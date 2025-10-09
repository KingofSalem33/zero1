import type {
  ChatCompletionTool,
  ChatCompletionMessageParam,
} from "openai/resources";
import { makeOpenAI } from "../ai";
import { toolMap, type ToolName } from "./tools";
import { ZodError } from "zod";
import pino from "pino";
import { ENV } from "../env";
import type { Response } from "express";

const logger = pino({ name: "runModelStream" });

export interface ToolActivity {
  type: "tool_start" | "tool_end" | "tool_error";
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  timestamp: string;
}

export interface RunModelStreamOptions {
  toolSpecs?: ChatCompletionTool[];
  toolMap?: typeof toolMap;
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
 */
export async function runModelStream(
  res: Response,
  messages: ChatCompletionMessageParam[],
  options: RunModelStreamOptions = {},
): Promise<void> {
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

  const conversationMessages: ChatCompletionMessageParam[] = [...messages];
  const allCitations: string[] = [];
  let iterations = 0;

  logger.info(
    { messageCount: messages.length, toolCount: toolSpecs.length },
    "Starting streaming model run",
  );

  try {
    while (iterations < maxIterations) {
      iterations++;

      const stream = await client.chat.completions.create({
        model,
        messages: conversationMessages,
        tools: toolSpecs.length > 0 ? toolSpecs : undefined,
        tool_choice: toolSpecs.length > 0 ? "auto" : undefined,
        temperature: 0.3,
        max_tokens: 16000,
        stream: true,
        ...(model.startsWith("gpt-5") && {
          reasoning_effort: reasoningEffort,
          verbosity: verbosity,
        }),
      });

      let currentContent = "";
      const currentToolCalls: Array<{
        id: string;
        type: string;
        function: { name: string; arguments: string };
      }> = [];

      // Process stream chunks
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Stream content deltas
        if (delta.content) {
          currentContent += delta.content;
          sendEvent("content", { delta: delta.content });
        }

        // Accumulate tool calls
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            if (!currentToolCalls[index]) {
              currentToolCalls[index] = {
                id: toolCallDelta.id || "",
                type: toolCallDelta.type || "function",
                function: { name: "", arguments: "" },
              };
            }

            if (toolCallDelta.function?.name) {
              currentToolCalls[index].function.name +=
                toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              currentToolCalls[index].function.arguments +=
                toolCallDelta.function.arguments;
            }
          }
        }
      }

      // Add assistant message to conversation
      const assistantMessage: ChatCompletionMessageParam = {
        role: "assistant",
        content: currentContent || null,
        tool_calls:
          currentToolCalls.length > 0
            ? currentToolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: tc.function,
              }))
            : undefined,
      };
      conversationMessages.push(assistantMessage);

      // If no tool calls, we're done
      if (!currentToolCalls.length) {
        sendEvent("done", { citations: [...new Set(allCitations)] });
        res.end();
        return;
      }

      // Process tool calls
      logger.info(
        { toolCallCount: currentToolCalls.length },
        "Processing tool calls",
      );

      for (const toolCall of currentToolCalls) {
        const { id, function: func } = toolCall;
        const toolName = func.name as ToolName;

        if (!providedToolMap[toolName]) {
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
          const args = JSON.parse(func.arguments || "{}");
          logger.info({ toolName, args }, "Executing tool");

          // Emit tool_call event
          sendEvent("tool_call", { tool: toolName, args });

          // Execute tool
          const result = await providedToolMap[toolName](args);

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
    sendEvent("done", { citations: [...new Set(allCitations)] });
    res.end();
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
  }
}
