import type { ChatCompletionTool } from "openai/resources";
import { makeOpenAI } from "../ai";
import { toolMap, type ToolName, type ToolMap } from "./tools";
import { ZodError } from "zod";
import pino from "pino";
import { ENV } from "../env";

const logger = pino({ name: "runModel" });

export interface ToolActivity {
  type: "tool_start" | "tool_end" | "tool_error";
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  timestamp: string;
}

export interface RunModelOptions {
  toolSpecs?: ChatCompletionTool[];
  toolMap?: Partial<ToolMap>;
  maxIterations?: number;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onToolError?: (toolName: string, error: string) => void;
  responseFormat?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
}

export interface RunModelResult {
  text: string;
  citations?: string[];
  tools_used?: ToolActivity[];
}

export async function runModel(
  messages: any[], // Responses API accepts ResponseInput items (array of ResponseInputItem)
  options: RunModelOptions = {},
): Promise<RunModelResult> {
  const {
    toolSpecs = [],
    toolMap: providedToolMap = toolMap,
    maxIterations = 10,
    model = ENV.OPENAI_MODEL_NAME, // Use configured model (gpt-5-mini)
    reasoningEffort = "high", // Leverage GPT-5's reasoning capabilities
    verbosity = "medium",
    onToolCall,
    onToolResult,
    onToolError,
    responseFormat,
  } = options;

  const client = makeOpenAI();
  if (!client) {
    throw new Error("OpenAI client not configured");
  }

  const conversationMessages: any[] = [...messages]; // ResponseInputItem[]
  const allCitations: string[] = [];
  const toolActivity: ToolActivity[] = [];
  const MAX_TOOL_ACTIVITY = 100; // ✅ Fix #10: Limit tool activity tracking to prevent unbounded growth
  let iterations = 0;

  logger.info(
    { messageCount: messages.length, toolCount: toolSpecs.length },
    "Starting model run",
  );

  while (iterations < maxIterations) {
    iterations++;

    try {
      const response = await client.responses.create({
        model,
        input: conversationMessages,
        tools: toolSpecs.length > 0 ? (toolSpecs as any) : undefined,
        tool_choice: toolSpecs.length > 0 ? "auto" : undefined,
        temperature: 0.3,
        max_output_tokens: 16000, // Increased to leverage GPT-5-mini's 128k output capacity
        parallel_tool_calls: true,
        // Text configuration with structured outputs and verbosity
        text: responseFormat
          ? {
              format: {
                type: "json_schema" as const,
                name: responseFormat.json_schema.name,
                schema: responseFormat.json_schema.schema,
              },
              verbosity: verbosity,
            }
          : {
              verbosity: verbosity,
            },
        // GPT-5 specific reasoning parameters
        ...(model.startsWith("gpt-5") && {
          reasoning: {
            effort: reasoningEffort,
          },
        }),
      });

      // Extract assistant message from output array
      const assistantMessage = response.output.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;

      if (!assistantMessage) {
        throw new Error("No assistant message in response");
      }
      // Extract tool calls from output array
      const toolCalls = response.output.filter(
        (item: any) => item.type === "function_tool_call",
      ) as any[];

      logger.info(
        {
          iteration: iterations,
          hasToolCalls: toolCalls.length > 0,
        },
        "Received model response",
      );

      // Add all output items to conversation for context
      for (const outputItem of response.output) {
        conversationMessages.push(outputItem);
      }

      // Check if there are tool calls to process
      if (toolCalls.length === 0) {
        // No tool calls, return final response
        // Get text content from assistant message
        const textContent =
          assistantMessage.content
            ?.filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("") || "";

        return {
          text: textContent,
          citations:
            allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
          tools_used: toolActivity.length > 0 ? toolActivity : undefined,
        };
      }

      // Process tool calls
      logger.info({ toolCallCount: toolCalls.length }, "Processing tool calls");

      for (const toolCall of toolCalls) {
        const { id, name: toolName } = toolCall as {
          id: string;
          name: ToolName;
        };

        if (!providedToolMap[toolName]) {
          logger.error({ toolName }, "Unknown tool requested");
          conversationMessages.push({
            type: "function_call_output",
            call_id: id,
            output: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
          });
          continue;
        }

        try {
          // Parse arguments from tool call
          const args =
            typeof toolCall.arguments === "string"
              ? JSON.parse(toolCall.arguments)
              : toolCall.arguments || {};
          logger.info({ toolName, args }, "Executing tool");

          // Track tool call start
          const timestamp = new Date().toISOString();
          // ✅ Fix #10: Only track if under limit
          if (toolActivity.length < MAX_TOOL_ACTIVITY) {
            toolActivity.push({
              type: "tool_start",
              tool: toolName,
              args,
              timestamp,
            });
          }
          onToolCall?.(toolName, args);

          // Execute tool function with validation
          const result = await providedToolMap[toolName](args);

          // Track tool call success
          // ✅ Fix #10: Only track if under limit
          if (toolActivity.length < MAX_TOOL_ACTIVITY) {
            toolActivity.push({
              type: "tool_end",
              tool: toolName,
              result,
              timestamp: new Date().toISOString(),
            });
          }
          onToolResult?.(toolName, result);

          // Collect citations if available
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

          // Track tool call error
          // ✅ Fix #10: Only track if under limit
          if (toolActivity.length < MAX_TOOL_ACTIVITY) {
            toolActivity.push({
              type: "tool_error",
              tool: toolName,
              error: errorMessage,
              timestamp: new Date().toISOString(),
            });
          }
          onToolError?.(toolName, errorMessage);

          conversationMessages.push({
            type: "function_call_output",
            call_id: id,
            output: JSON.stringify({ error: errorMessage }),
          });
        }
      }

      // Continue the loop to get the model's response to the tool results
      logger.info("Tool calls completed, requesting model response");
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : error,
          iteration: iterations,
        },
        "Model request failed",
      );

      if (iterations === 1) {
        // If first iteration fails, throw the error
        throw error;
      } else {
        // If later iteration fails, return what we have so far
        const lastAssistantMessage = conversationMessages
          .slice()
          .reverse()
          .find(
            (msg: any) => msg.type === "message" && msg.role === "assistant",
          ) as any;

        const textContent =
          lastAssistantMessage?.content
            ?.filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("") || "An error occurred during processing";

        return {
          text: textContent,
          citations:
            allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
          tools_used: toolActivity.length > 0 ? toolActivity : undefined,
        };
      }
    }
  }

  logger.warn({ maxIterations }, "Maximum iterations reached");

  // Max iterations reached, return the last assistant message
  const lastAssistantMessage = conversationMessages
    .slice()
    .reverse()
    .find(
      (msg: any) => msg.type === "message" && msg.role === "assistant",
    ) as any;

  const textContent =
    lastAssistantMessage?.content
      ?.filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("") || "Maximum iterations reached without completion";

  return {
    text: textContent,
    citations: allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
    tools_used: toolActivity.length > 0 ? toolActivity : undefined,
  };
}
