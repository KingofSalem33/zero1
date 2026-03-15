import { makeOpenAI } from "../ai";
import { toolMap, type ToolName, type ToolMap } from "./tools";
import { ZodError } from "zod";
import pino from "pino";
import { ENV } from "../env";
import { profileTime } from "../profiling/requestProfiler";
import { type TaskType, getModelConfig, recordModelUsage } from "./modelRouter";

const logger = pino({ name: "runModel" });

function resolveModelVerbosity(
  model: string,
  requested: "low" | "medium" | "high",
): "low" | "medium" | "high" {
  // gpt-4o-mini currently rejects "low" verbosity and supports "medium".
  if (model.includes("gpt-4o-mini") && requested === "low") {
    return "medium";
  }
  return requested;
}

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

function extractTextFromContentArray(content: any): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item: any) => {
      if (!item) return "";
      if (typeof item === "string") return item;
      if (typeof item.text === "string") return item.text;
      return "";
    })
    .filter(Boolean)
    .join("");
}

function extractTextFromResponse(
  response: any,
  assistantMessage?: any,
): string {
  // Preferred: SDK-provided convenience field
  const outputText = response?.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText;
  }

  if (Array.isArray(outputText)) {
    const joined = outputText
      .map((item: any) =>
        typeof item === "string" ? item : (item?.text ?? ""),
      )
      .filter(Boolean)
      .join("");
    if (joined.trim().length > 0) return joined;
  }

  // Legacy/common path: assistant message content array
  const assistantText = extractTextFromContentArray(assistantMessage?.content);
  if (assistantText.trim().length > 0) {
    return assistantText;
  }

  // Fallback: scan output items directly for text-bearing entries
  if (Array.isArray(response?.output)) {
    const fromOutputItems = response.output
      .map((item: any) => {
        if (!item) return "";
        if (typeof item.text === "string") return item.text;
        if (Array.isArray(item.content)) {
          return extractTextFromContentArray(item.content);
        }
        return "";
      })
      .filter(Boolean)
      .join("");
    if (fromOutputItems.trim().length > 0) {
      return fromOutputItems;
    }
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
  // Prompt caching optimization (OpenAI API)
  // Note: Prompt caching is automatic for prompts > 1024 tokens
  // These parameters are for advanced optimization
  promptCacheRetention?: "24h"; // Extended retention for frequently-used prompts
  promptCacheKey?: string; // Custom key to improve cache hit rates for shared prefixes
  maxOutputTokens?: number; // Per-call output token cap override
  // Model routing - use task type for automatic model selection
  taskType?: TaskType;
}

export interface RunModelResult {
  text: string;
  citations?: string[];
  tools_used?: ToolActivity[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: {
      cached_tokens?: number;
    };
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

function getUsagePromptTokens(usage: RunModelResult["usage"]): number {
  if (!usage) return 0;
  return typeof usage.input_tokens === "number"
    ? usage.input_tokens
    : (usage.prompt_tokens ?? 0);
}

function getUsageCompletionTokens(usage: RunModelResult["usage"]): number {
  if (!usage) return 0;
  return typeof usage.output_tokens === "number"
    ? usage.output_tokens
    : (usage.completion_tokens ?? 0);
}

function getUsageTotalTokens(usage: RunModelResult["usage"]): number {
  if (!usage) return 0;
  return typeof usage.total_tokens === "number"
    ? usage.total_tokens
    : getUsagePromptTokens(usage) + getUsageCompletionTokens(usage);
}

function getUsageCachedTokens(
  usage: RunModelResult["usage"],
): number | undefined {
  if (!usage) return undefined;
  return (
    usage.input_tokens_details?.cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens
  );
}

export async function runModel(
  messages: any[], // Responses API accepts ResponseInput items (array of ResponseInputItem)
  options: RunModelOptions = {},
): Promise<RunModelResult> {
  const {
    toolSpecs = [],
    toolMap: providedToolMap = toolMap,
    maxIterations = 10,
    reasoningEffort, // Only set for models that support it (not nano)
    verbosity = "medium",
    onToolCall,
    onToolResult,
    onToolError,
    responseFormat,
    promptCacheRetention, // Optional: "24h" for extended cache retention
    promptCacheKey, // Optional: Custom key for cache routing
    maxOutputTokens,
    taskType,
  } = options;

  // Resolve model from task type or use explicit model or default
  const resolvedConfig = taskType ? getModelConfig(taskType) : null;
  const model = options.model ?? resolvedConfig?.model ?? ENV.OPENAI_MODEL_NAME;
  const effectiveVerbosity = resolveModelVerbosity(model, verbosity);
  const startTime = Date.now();

  // Helper to record usage and return result
  const recordAndReturn = (result: RunModelResult): RunModelResult => {
    if (taskType && result.usage) {
      recordModelUsage({
        task: taskType,
        model,
        tokenUsage: {
          prompt: getUsagePromptTokens(result.usage),
          completion: getUsageCompletionTokens(result.usage),
          total: getUsageTotalTokens(result.usage),
          cached: getUsageCachedTokens(result.usage),
        },
        latencyMs: Date.now() - startTime,
        timestamp: startTime,
      });
    }
    return result;
  };

  // Set reasoning effort only when explicitly requested.
  // GPT-5 family models support reasoning controls, including nano.
  const effectiveReasoningEffort =
    model.startsWith("gpt-5") && reasoningEffort !== undefined
      ? reasoningEffort
      : undefined;

  const client = makeOpenAI();
  if (!client) {
    throw new Error("AI client not configured");
  }

  const conversationMessages: any[] = [...messages]; // ResponseInputItem[]
  const allCitations: string[] = [];
  const toolActivity: ToolActivity[] = [];
  const MAX_TOOL_ACTIVITY = 100; // ✅ Fix #10: Limit tool activity tracking to prevent unbounded growth
  let iterations = 0;
  let lastUsageData: any = undefined; // Track usage from last API call

  logger.info(
    { messageCount: messages.length, toolCount: toolSpecs.length },
    "Starting model run",
  );

  while (iterations < maxIterations) {
    iterations++;

    try {
      logger.info(
        {
          model,
          verbosity: effectiveVerbosity,
          effectiveReasoningEffort,
          willSendReasoning: !!effectiveReasoningEffort,
          iteration: iterations,
        },
        "Model configuration for iteration",
      );

      const response = await profileTime(
        "llm.responses_create",
        () =>
          client.responses.create({
            model,
            input: conversationMessages,
            tools: toolSpecs.length > 0 ? (toolSpecs as any) : undefined,
            tool_choice: toolSpecs.length > 0 ? "auto" : undefined,
            max_output_tokens: maxOutputTokens ?? 16000,
            parallel_tool_calls: true,
            ...(responseFormat
              ? {
                  text: {
                    format: {
                      type: "json_schema" as const,
                      name: responseFormat.json_schema.name,
                      schema: responseFormat.json_schema.schema,
                    },
                    verbosity: effectiveVerbosity,
                  },
                }
              : {
                  text: {
                    verbosity: effectiveVerbosity,
                  },
                }),
            // Only apply reasoning for models that support it (not nano)
            ...(effectiveReasoningEffort && {
              reasoning: {
                effort: effectiveReasoningEffort,
              },
            }),
            // Note: OpenAI prompt caching parameters (if supported by SDK version)
            // Prompt caching is automatic for prompts > 1024 tokens
            // These parameters are for advanced optimization when supported
            ...(promptCacheRetention && {
              prompt_cache_retention: promptCacheRetention,
            }),
            ...(promptCacheKey && { prompt_cache_key: promptCacheKey }),
          }),
        {
          file: "ai/runModel.ts",
          fn: "runModel",
          await: "client.responses.create",
          model,
        },
      );

      // Log prompt cache performance if available
      const responseUsage = (response as any).usage as RunModelResult["usage"];
      const cached = getUsageCachedTokens(responseUsage);
      if (cached) {
        const total = getUsagePromptTokens(responseUsage);
        const cacheHitRate =
          total > 0 ? ((cached / total) * 100).toFixed(1) : "0";
        logger.info(
          {
            cached_tokens: cached,
            total_prompt_tokens: total,
            cache_hit_rate: `${cacheHitRate}%`,
            model,
          },
          "Prompt cache hit",
        );
      }

      // Store usage data for telemetry
      lastUsageData = responseUsage;

      const outputItems = Array.isArray(response.output) ? response.output : [];

      // Extract assistant message from output array (legacy shape)
      const assistantMessage = outputItems.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;
      // Extract tool calls from output array
      // Be tolerant of SDK/event shape differences (id vs call_id)
      const toolCalls = (
        outputItems.filter(
          (item: any) =>
            item.type === "function_tool_call" || item.type === "function_call",
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
          hasAssistantMessage: !!assistantMessage,
          hasToolCalls: toolCalls.length > 0,
        },
        "Received model response",
      );

      // Add all output items to conversation for context
      for (const outputItem of outputItems) {
        conversationMessages.push(outputItem);
      }

      // Check if there are tool calls to process
      if (toolCalls.length === 0) {
        // No tool calls, return final response
        // Get text content from assistant message
        // Handle both "text" and "output_text" types (Responses API format)
        const textContent = extractTextFromResponse(response, assistantMessage);

        // Log if text content is empty to help debug
        if (!textContent) {
          logger.warn(
            {
              outputLength: outputItems.length,
              outputTypes: outputItems
                .map((item: any) => item?.type)
                .slice(0, 8),
              outputTextType: typeof response?.output_text,
              assistantMessageType: assistantMessage?.type,
              contentType: typeof assistantMessage?.content,
              contentIsArray: Array.isArray(assistantMessage?.content),
              contentLength: assistantMessage?.content?.length,
              firstContentItem: assistantMessage?.content?.[0],
            },
            "Empty text content extracted from assistant message",
          );
        }

        return recordAndReturn({
          text: textContent,
          citations:
            allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
          tools_used: toolActivity.length > 0 ? toolActivity : undefined,
          usage: lastUsageData,
        });
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

        const toolFn = providedToolMap[toolName];
        if (!toolFn) {
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
          const result = await profileTime(
            `tool.${toolName}`,
            async () => toolFn(args) as unknown,
            {
              file: "ai/tools",
              fn: toolName,
              await: "tool_execution",
            },
          );

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

        return recordAndReturn({
          text: textContent,
          citations:
            allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
          tools_used: toolActivity.length > 0 ? toolActivity : undefined,
          usage: lastUsageData,
        });
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

  return recordAndReturn({
    text: textContent,
    citations: allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
    tools_used: toolActivity.length > 0 ? toolActivity : undefined,
    usage: lastUsageData,
  });
}
