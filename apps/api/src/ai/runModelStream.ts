import { makeOpenAI } from "../ai";
import { toolMap, type ToolName, type ToolMap } from "./tools";
import { ZodError } from "zod";
import pino from "pino";
import { ENV } from "../env";
import type { Response } from "express";

const logger = pino({ name: "runModelStream" });

// Responses API tool format
export interface ResponsesAPITool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolActivity {
  type: "tool_start" | "tool_end" | "tool_error";
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  timestamp: string;
}

export interface RunModelStreamOptions {
  toolSpecs?: ResponsesAPITool[];
  toolMap?: Partial<ToolMap>;
  maxIterations?: number;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
}

/**
 * Streaming version of runModel that sends SSE events to the client
 * Events:
 * - tool_call: { tool: string, args: unknown }
 * - tool_result: { tool: string, result: unknown }
 * - tool_error: { tool: string, error: string }
 * - content: { delta: string }
 * - done: { citations: string[] }
 * Returns the full accumulated AI response
 */
export async function runModelStream(
  res: Response,
  messages: any[], // Responses API accepts ResponseInput items
  options: RunModelStreamOptions = {},
): Promise<string> {
  const {
    toolSpecs = [],
    toolMap: providedToolMap = toolMap,
    maxIterations = 10,
    model = ENV.OPENAI_MODEL_NAME,
  } = options;

  const client = makeOpenAI();
  if (!client) {
    throw new Error("OpenAI client not configured");
  }

  // Helper to send SSE event
  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Helper to send heartbeat (keeps connection alive through proxies)
  const sendHeartbeat = () => {
    res.write(`:\n\n`);
  };

  // Send initial heartbeat
  sendHeartbeat();

  // Set up heartbeat interval (every 15 seconds)
  const heartbeatInterval = setInterval(sendHeartbeat, 15000);

  const conversationMessages: any[] = [...messages]; // ResponseInputItem[]
  const allCitations: string[] = [];
  let iterations = 0;
  let finalResponse = ""; // Track the final AI response to return

  logger.info(
    { messageCount: messages.length, toolCount: toolSpecs.length },
    "Starting streaming model run",
  );

  try {
    while (iterations < maxIterations) {
      iterations++;

      // Use chat.completions API instead of responses API
      const stream = await client.chat.completions.create({
        model,
        messages: conversationMessages,
        tools: toolSpecs.length > 0 ? (toolSpecs as any) : undefined,
        tool_choice: toolSpecs.length > 0 ? "auto" : undefined,
        temperature: 0.3,
        max_tokens: 16000,
        parallel_tool_calls: true,
        stream: true,
      });

      let currentContent = "";
      const currentToolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
      }> = [];

      // Process stream chunks - Chat Completions API streaming
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;

        // Handle text content delta
        if (delta.content) {
          currentContent += delta.content;
          sendEvent("content", { delta: delta.content });
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            // Ensure we have a slot for this tool call
            while (currentToolCalls.length <= index) {
              currentToolCalls.push({
                id: "",
                name: "",
                arguments: "",
              });
            }

            const toolCall = currentToolCalls[index];

            if (toolCallDelta.id) {
              toolCall.id = toolCallDelta.id;
            }
            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              toolCall.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }

      // Construct final assistant message
      if (currentContent) {
        conversationMessages.push({
          role: "assistant",
          content: currentContent,
        });
      } else if (currentToolCalls.length > 0) {
        conversationMessages.push({
          role: "assistant",
          content: null,
          tool_calls: currentToolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        });
      }

      // If no tool calls, we're done
      if (!currentToolCalls.length) {
        finalResponse = currentContent; // Save the final response
        clearInterval(heartbeatInterval);
        sendEvent("done", { citations: [...new Set(allCitations)] });
        res.end();
        return finalResponse;
      }

      // Process tool calls
      logger.info(
        { toolCallCount: currentToolCalls.length },
        "Processing tool calls",
      );

      for (const toolCall of currentToolCalls) {
        const { id, name: toolName, arguments: toolArgs } = toolCall;

        if (!providedToolMap[toolName as ToolName]) {
          logger.error({ toolName }, "Unknown tool requested");
          sendEvent("tool_error", {
            tool: toolName,
            error: `Unknown tool: ${toolName}`,
          });
          conversationMessages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
          });
          continue;
        }

        try {
          const args = JSON.parse(toolArgs || "{}");
          logger.info({ toolName, args }, "Executing tool");

          // Emit user-friendly status message
          const statusMessages: Record<string, string> = {
            web_search: "Searching the web...",
            http_fetch: "Reading content...",
            calculator: "Calculating...",
            file_search: "Searching files...",
          };
          const statusMessage =
            statusMessages[toolName] || `Using ${toolName}...`;
          sendEvent("status", { message: statusMessage });

          // Emit tool_call event
          sendEvent("tool_call", { tool: toolName, args });

          // Execute tool
          const toolFn = providedToolMap[toolName as ToolName];
          if (!toolFn) {
            throw new Error(`Tool function not found: ${toolName}`);
          }
          const result = await toolFn(args);

          // Emit tool_result event
          sendEvent("tool_result", { tool: toolName, result });

          // Collect citations
          if (result && typeof result === "object" && "citations" in result) {
            const citations = (result as any).citations;
            if (Array.isArray(citations)) {
              allCitations.push(...citations);
            }
          }

          // Add tool result to conversation
          conversationMessages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify(result),
          });

          logger.info(
            { toolName, success: true },
            "Tool executed successfully",
          );
        } catch (error) {
          logger.error(
            { toolName, error: error instanceof Error ? error.message : error },
            "Tool execution failed",
          );

          let errorMessage = "Tool execution failed";
          if (error instanceof ZodError) {
            errorMessage = `Invalid parameters: ${error.errors.map((e) => e.message).join(", ")}`;
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }

          // Emit tool_error event
          sendEvent("tool_error", { tool: toolName, error: errorMessage });

          conversationMessages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify({ error: errorMessage }),
          });
        }
      }

      // Continue loop to get model's response to tool results
      logger.info("Tool calls completed, requesting model response");
    }

    logger.warn({ maxIterations }, "Maximum iterations reached");
    clearInterval(heartbeatInterval);
    sendEvent("done", { citations: [...new Set(allCitations)] });
    res.end();
    return finalResponse;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      "Streaming failed",
    );
    clearInterval(heartbeatInterval);
    sendEvent("error", {
      message:
        error instanceof Error ? error.message : "Unknown streaming error",
    });
    res.end();
    return finalResponse;
  }
}
