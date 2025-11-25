import { makeOpenAI } from "../ai";
import { toolMap, type ToolName, type ToolMap } from "./tools";
import { ZodError } from "zod";
import pino from "pino";
import { ENV } from "../env";

const logger = pino({ name: "runModel" });

function extractTextFromItem(msg: any): string {
  const content = msg?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) =>
        typeof c === "string"
          ? c
          : c && typeof c.text === "string"
            ? c.text
            : "",
      )
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function getLastUserText(context: any[]): string | null {
  for (let i = context.length - 1; i >= 0; i--) {
    const msg = context[i];
    const role = msg?.role || msg?.author || undefined;
    if (role === "user") {
      const txt = extractTextFromItem(msg);
      if (txt && txt.trim().length > 0) return txt;
    }
  }
  return null;
}

function buildFallbackQuery(context: any[]): string | null {
  const lastUser = getLastUserText(context);
  const chosen = lastUser;
  if (chosen && chosen.trim().length >= 3) {
    const trimmed = chosen.trim().slice(0, 200);
    return `${trimmed} site:.gov`;
  }
  return null;
}

/**
 * Validate tool arguments before execution
 * Returns error message if validation fails, null if valid
 */
function validateToolArguments(
  toolName: ToolName,
  args: any,
  context: any[] = [],
): string | null {
  switch (toolName) {
    case "web_search":
      if (!args.q || typeof args.q !== "string" || args.q.trim().length === 0) {
        const fallbackQuery = buildFallbackQuery(context);
        if (fallbackQuery) {
          args.q = fallbackQuery;
          return null;
        }
        return "web_search requires 'q' parameter (non-empty search query string). Example: {q: 'health department regulations'}";
      }
      break;

    case "http_fetch":
      if (
        !args.url ||
        typeof args.url !== "string" ||
        args.url.trim().length === 0
      ) {
        return "http_fetch requires 'url' parameter (valid http/https URL). Example: {url: 'https://example.com'}";
      }
      if (!args.url.startsWith("http://") && !args.url.startsWith("https://")) {
        return "http_fetch 'url' must start with http:// or https://";
      }
      break;

    case "file_search":
      if (
        !args.query ||
        typeof args.query !== "string" ||
        args.query.trim().length === 0
      ) {
        return "file_search requires 'query' parameter (non-empty search string). Example: {query: 'API documentation'}. Note: Use web_search for internet research, not file_search.";
      }
      break;

    case "calculator":
      if (
        !args.expression ||
        typeof args.expression !== "string" ||
        args.expression.trim().length === 0
      ) {
        return "calculator requires 'expression' parameter (mathematical expression). Example: {expression: '2 + 2'}";
      }
      break;
  }

  return null;
}

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

export interface RunModelOptions {
  toolSpecs?: ResponsesAPITool[];
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
      // Be tolerant of SDK/event shape differences (id vs call_id)
      const toolCalls = (
        response.output.filter(
          (item: any) => item.type === "function_tool_call",
        ) as any[]
      ).map((item: any) => ({
        // Prefer call_id if present; fall back to id
        id: item.call_id || item.id,
        name: item.name,
        arguments: item.arguments,
      }));

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
        // Handle both "text" and "output_text" types (Responses API format)
        const textContent =
          assistantMessage.content
            ?.filter((c: any) => c.type === "text" || c.type === "output_text")
            .map((c: any) => c.text)
            .join("") || "";

        // Log if text content is empty to help debug
        if (!textContent) {
          logger.warn(
            {
              assistantMessageType: assistantMessage.type,
              contentType: typeof assistantMessage.content,
              contentIsArray: Array.isArray(assistantMessage.content),
              contentLength: assistantMessage.content?.length,
              firstContentItem: assistantMessage.content?.[0],
            },
            "Empty text content extracted from assistant message",
          );
        }

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
          id: string | undefined;
          name: ToolName;
        };

        if (!id) {
          logger.error({ toolName }, "Missing call_id for tool call");
          conversationMessages.push({
            type: "function_call_output",
            call_id: "", // intentionally empty to avoid undefined
            output: JSON.stringify({ error: "Missing call_id for tool call" }),
          });
          continue;
        }

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

          // ✅ VALIDATION: Check required arguments BEFORE calling tool
          const validationError = validateToolArguments(
            toolName,
            args,
            conversationMessages,
          );
          if (validationError) {
            logger.error(
              { toolName, args, validationError },
              "Tool argument validation failed",
            );

            // Track validation error
            if (toolActivity.length < MAX_TOOL_ACTIVITY) {
              toolActivity.push({
                type: "tool_error",
                tool: toolName,
                error: validationError,
                timestamp: new Date().toISOString(),
              });
            }
            onToolError?.(toolName, validationError);

            // Return error to model - DO NOT RETRY
            conversationMessages.push({
              type: "function_call_output",
              call_id: id,
              output: JSON.stringify({
                error: validationError,
                hint: "Provide all required parameters with correct types and non-empty values",
              }),
            });
            continue;
          }

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

  // Handle both "text" and "output_text" types (Responses API format)
  const textContent =
    lastAssistantMessage?.content
      ?.filter((c: any) => c.type === "text" || c.type === "output_text")
      .map((c: any) => c.text)
      .join("") || "Maximum iterations reached without completion";

  return {
    text: textContent,
    citations: allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
    tools_used: toolActivity.length > 0 ? toolActivity : undefined,
  };
}
