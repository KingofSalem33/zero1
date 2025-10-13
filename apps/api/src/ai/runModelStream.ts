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
    reasoningEffort = "high",
    verbosity = "medium",
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

      const stream = await client.responses.create({
        model,
        input: conversationMessages,
        tools: toolSpecs.length > 0 ? (toolSpecs as any) : undefined,
        tool_choice: toolSpecs.length > 0 ? "auto" : undefined,
        temperature: 0.3,
        max_output_tokens: 16000,
        parallel_tool_calls: true,
        stream: true,
        text: {
          verbosity: verbosity,
        },
        ...(model.startsWith("gpt-5") && {
          reasoning: {
            effort: reasoningEffort,
          },
        }),
      });

      let currentContent = "";
      const currentToolCalls: Array<{
        id: string;
        name: string;
        arguments: string;
      }> = [];
      const outputItems: any[] = [];

      // Process stream chunks - Responses API has different event structure
      for await (const event of stream) {
        // Handle text delta events
        if (event.type === "response.output_item.added") {
          outputItems.push(event.item);
        }

        if (event.type === "response.output_text.delta") {
          const delta = (event as any).delta;
          if (delta) {
            currentContent += delta;
            sendEvent("content", { delta });
          }
        }

        // Handle function tool call events
        if (event.type === "response.function_call_arguments.delta") {
          const callId = (event as any).call_id;
          const delta = (event as any).delta;

          let toolCall = currentToolCalls.find((tc) => tc.id === callId);
          if (!toolCall) {
            toolCall = {
              id: callId,
              name: (event as any).name || "",
              arguments: "",
            };
            currentToolCalls.push(toolCall);
          }
          if (delta) {
            toolCall.arguments += delta;
          }
        }

        if (event.type === "response.function_call_arguments.done") {
          const callId = (event as any).call_id;
          const name = (event as any).name;

          let toolCall = currentToolCalls.find((tc) => tc.id === callId);
          if (!toolCall) {
            toolCall = {
              id: callId,
              name: name || "",
              arguments: (event as any).arguments || "",
            };
            currentToolCalls.push(toolCall);
          } else {
            toolCall.name = name || toolCall.name;
            toolCall.arguments = (event as any).arguments || toolCall.arguments;
          }
        }
      }

      // Add all output items to conversation for context
      for (const outputItem of outputItems) {
        conversationMessages.push(outputItem);
      }

      // If no tool calls, we're done
      if (!currentToolCalls.length) {
        finalResponse = currentContent; // Save the final response
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
            type: "function_call_output",
            call_id: id,
            output: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
          });
          continue;
        }

        try {
          const args = JSON.parse(toolArgs || "{}");
          logger.info({ toolName, args }, "Executing tool");

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
            type: "function_call_output",
            call_id: id,
            output: JSON.stringify(result),
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
            type: "function_call_output",
            call_id: id,
            output: JSON.stringify({ error: errorMessage }),
          });
        }
      }

      // Continue loop to get model's response to tool results
      logger.info("Tool calls completed, requesting model response");
    }

    logger.warn({ maxIterations }, "Maximum iterations reached");
    sendEvent("done", { citations: [...new Set(allCitations)] });
    res.end();
    return finalResponse;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      "Streaming failed",
    );
    sendEvent("error", {
      message:
        error instanceof Error ? error.message : "Unknown streaming error",
    });
    res.end();
    return finalResponse;
  }
}
