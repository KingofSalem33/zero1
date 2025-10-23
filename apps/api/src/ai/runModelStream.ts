import { makeOpenAI } from "../ai";
import { toolMap, type ToolName, type ToolMap } from "./tools";
import { ZodError } from "zod";
import pino from "pino";
import { ENV } from "../env";
import type { Response } from "express";

const logger = pino({ name: "runModelStream" });

/**
 * Extract keywords from context to build a search query
 */
function extractTextFromItem(msg: any): string {
  // Handle Responses API items (type === 'message') or plain {role, content}
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

function extractSearchKeywords(context: any[]): string[] {
  const keywords: string[] = [];
  const keywordPatterns = [
    /\b(Minnesota|MN|Dakota County|California|CA|Texas|TX|Florida|FL)\b/gi,
    /\b(cottage food|commercial kitchen|food service|health department|permit|license|regulation|requirement)\b/gi,
    /\b(health department|FDA|USDA|department of agriculture)\b/gi,
  ];

  // Extract from recent conversation messages (assistant + user)
  const recentText = context
    .slice(-5)
    .map((msg: any) => extractTextFromItem(msg))
    .filter(Boolean)
    .join(" ");

  keywordPatterns.forEach((pattern) => {
    const matches = recentText.match(pattern);
    if (matches) {
      keywords.push(...matches.map((m) => m.toLowerCase()));
    }
  });

  return [...new Set(keywords)];
}

/**
 * Build a fallback query from context when model doesn't provide one
 */
function getLastUserText(context: any[]): string | null {
  // Walk backwards to find the last user-authored message and extract text
  for (let i = context.length - 1; i >= 0; i--) {
    const msg = context[i];
    const role = msg?.role || msg?.author || undefined;
    if (role === "user") {
      const text = extractTextFromItem(msg);
      if (text && text.trim().length > 0) return text;
    }
  }
  return null;
}

function buildFallbackQuery(context: any[]): string | null {
  const keywords = extractSearchKeywords(context);

  if (keywords.length === 0) {
    // Last-resort fallback: use latest conversational text
    const lastUserText = getLastUserText(context);
    const lastAnyText = (() => {
      for (let i = context.length - 1; i >= 0; i--) {
        const msg = context[i];
        const txt = extractTextFromItem(msg);
        if (txt && txt.trim().length > 0) return txt;
      }
      return null;
    })();
    const chosen = lastUserText || lastAnyText;
    if (chosen && chosen.trim().length >= 3) {
      const trimmed = chosen.trim().slice(0, 200);
      return `${trimmed} site:.gov`;
    }
    return null; // Can't construct meaningful query
  }

  // Prioritize jurisdiction + topic
  const jurisdiction = keywords.find((k) =>
    /minnesota|dakota|california|texas|florida/i.test(k),
  );
  const topic = keywords.find((k) =>
    /cottage food|commercial kitchen|food service|permit|license|regulation/i.test(
      k,
    ),
  );

  if (jurisdiction && topic) {
    return `${jurisdiction} ${topic} official requirements site:.gov`;
  }

  if (topic) {
    return `${topic} requirements site:.gov`;
  }

  // Last resort: use all keywords
  return keywords.slice(0, 4).join(" ") + " site:.gov";
}

/**
 * Validate tool arguments before execution
 * Returns error message if validation fails, null if valid
 * context parameter allows building fallback queries
 */
function validateToolArguments(
  toolName: ToolName,
  args: any,
  context: any[] = [],
): string | null {
  // Check required parameters for each tool
  switch (toolName) {
    case "web_search":
      if (!args.q || typeof args.q !== "string" || args.q.trim().length === 0) {
        // Try to build fallback query from context
        const fallbackQuery = buildFallbackQuery(context);
        if (fallbackQuery) {
          // Mutate args to include fallback (assist completion)
          args.q = fallbackQuery;
          console.log(
            `[Validation] Built fallback query for web_search: "${fallbackQuery}"`,
          );
          return null; // Now valid
        }
        return "web_search requires 'q' parameter (specific search query). Example: {q: 'Minnesota cottage food law site:mn.gov'}. Include jurisdiction + topic + 'site:.gov' for official sources.";
      }
      if (args.q.trim().length < 3) {
        return "web_search 'q' must be at least 3 characters. Provide a complete search query.";
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

  return null; // Valid
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
    const eventStr = `event: ${event}\n`;
    // For strings, send as-is; for objects, stringify
    const dataStr =
      typeof data === "string"
        ? `data: ${data}\n\n`
        : `data: ${JSON.stringify(data)}\n\n`;
    console.log(
      `[SSE] Sending event: ${event}, data: ${typeof data === "string" ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100)}...`,
    );
    res.write(eventStr);
    res.write(dataStr);
  };

  // Helper to send heartbeat (keeps connection alive through proxies)
  const sendHeartbeat = () => {
    res.write(`:\n\n`);
  };

  // Send initial heartbeat
  sendHeartbeat();

  // Set up heartbeat interval (every 15 seconds)
  let heartbeatInterval: ReturnType<typeof setInterval> | null = setInterval(
    sendHeartbeat,
    15000,
  );

  // ✅ Critical: Clear interval if client disconnects to prevent memory leak
  const cleanup = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
      logger.info("Heartbeat interval cleared");
    }
  };

  // Handle client disconnect
  res.on("close", () => {
    cleanup();
    logger.info("Client disconnected, cleaned up resources");
  });

  const conversationMessages: any[] = [...messages]; // ResponseInputItem[]
  const allCitations: string[] = [];
  let iterations = 0;
  let accumulatedResponse = ""; // Accumulate text across ALL iterations

  logger.info(
    { messageCount: messages.length, toolCount: toolSpecs.length },
    "Starting streaming model run",
  );

  try {
    while (iterations < maxIterations) {
      iterations++;

      // Debug: Log the input messages being sent to the API
      console.log(
        "[runModelStream] Sending to Responses API:",
        JSON.stringify(conversationMessages, null, 2),
      );

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

      let currentIterationContent = ""; // Content from THIS iteration only
      const outputItems: any[] = [];

      // Process stream chunks - Responses API has different event structure
      for await (const event of stream) {
        // Collect all output items as they're added
        if (event.type === "response.output_item.added") {
          outputItems.push(event.item);
          console.log(
            `[runModelStream] Iteration ${iterations}: Added output item type=${event.item.type}`,
          );
        }

        // Stream text deltas to the user in real-time
        if (event.type === "response.output_text.delta") {
          const delta = (event as any).delta;
          if (delta) {
            currentIterationContent += delta;
            accumulatedResponse += delta; // Also accumulate across iterations
            console.log(
              `[runModelStream] Iteration ${iterations}: Text delta received (${delta.length} chars)`,
            );
            sendEvent("content", delta);
          }
        }

        // Note: We don't need to manually assemble tool calls from deltas
        // The outputItems will contain complete function_tool_call objects
      }

      console.log(
        `[runModelStream] Iteration ${iterations} stream complete. This iteration: ${currentIterationContent.length} chars, Total accumulated: ${accumulatedResponse.length} chars, Output items: ${outputItems.length}`,
      );
      outputItems.forEach((item, idx) => {
        const isTool =
          item.type === "function_call" || item.type === "function_tool_call";
        console.log(
          `  Item ${idx}: type=${item.type}${isTool ? `, name=${item.name}` : ""}`,
        );
      });

      // DEBUG: Log all output items to understand what API is returning
      console.log(
        "[runModelStream] Output items received:",
        JSON.stringify(outputItems, null, 2),
      );

      // Fallback: If no text deltas were emitted, try to recover text
      // from assistant message output items and emit a single content chunk.
      if (!currentIterationContent) {
        const assistantTexts: string[] = [];
        for (const item of outputItems) {
          if (
            item.type === "message" &&
            item.role === "assistant" &&
            Array.isArray(item.content)
          ) {
            for (const c of item.content) {
              if (
                c &&
                c.type === "text" &&
                typeof c.text === "string" &&
                c.text.length > 0
              ) {
                assistantTexts.push(c.text);
              }
            }
          }
        }
        const fallbackText = assistantTexts.join("");
        if (fallbackText) {
          console.log(
            `[runModelStream] Fallback extracted ${fallbackText.length} chars from output items`,
          );
          currentIterationContent = fallbackText;
          accumulatedResponse += fallbackText;
          sendEvent("content", fallbackText);
        }
      }

      // Add all output items to conversation for context
      for (const outputItem of outputItems) {
        conversationMessages.push(outputItem);
      }

      // Extract tool calls from output items (these are already complete)
      // Note: OpenAI uses "function_call" not "function_tool_call"
      const toolCallItems = outputItems.filter(
        (item: any) =>
          item.type === "function_call" || item.type === "function_tool_call",
      );

      console.log(
        `[runModelStream] Found ${toolCallItems.length} tool call items`,
      );

      // If no tool calls, we're done
      if (toolCallItems.length === 0) {
        console.log(
          `[runModelStream] No tool calls in iteration ${iterations}. Ending stream with ${accumulatedResponse.length} total chars.`,
        );
        cleanup(); // ✅ Use cleanup function
        sendEvent("done", { citations: [...new Set(allCitations)] });
        res.end();
        return accumulatedResponse; // Return accumulated response across all iterations
      }

      // Convert output items to tool call format for processing
      const validToolCalls = toolCallItems
        .map((item: any) => ({
          id: item.call_id || item.id,
          name: item.name,
          arguments: item.arguments,
        }))
        .filter((tc) => {
          // Only filter if truly malformed (missing both id and name)
          if (!tc.id || !tc.name) {
            logger.warn(
              { toolCall: tc },
              "Skipping malformed tool call (missing call_id or name)",
            );
            return false;
          }
          return true;
        });

      // If all tool calls were malformed, we're done
      if (validToolCalls.length === 0) {
        logger.warn("All tool calls were malformed, ending stream");
        cleanup(); // ✅ Use cleanup function
        sendEvent("done", { citations: [...new Set(allCitations)] });
        res.end();
        return accumulatedResponse;
      }

      // Process tool calls
      logger.info(
        { toolCallCount: validToolCalls.length },
        "Processing tool calls",
      );

      for (const toolCall of validToolCalls) {
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

          // ✅ VALIDATION: Check required arguments BEFORE calling tool
          // Pass conversation context to enable fallback query construction
          const validationError = validateToolArguments(
            toolName as ToolName,
            args,
            conversationMessages,
          );
          if (validationError) {
            logger.error(
              { toolName, args, validationError },
              "Tool argument validation failed - cannot construct fallback",
            );
            sendEvent("tool_error", {
              tool: toolName,
              error: validationError,
            });
            conversationMessages.push({
              type: "function_call_output",
              call_id: id,
              output: JSON.stringify({
                error: validationError,
                hint: "Provide all required parameters. For web_search, include specific keywords like jurisdiction + topic + 'site:.gov'",
              }),
            });
            // ✅ DO NOT RETRY - Continue to next tool call
            continue;
          }

          // Log if args were modified (fallback query added)
          console.log(`[Tool Execution] ${toolName} with args:`, args);

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
      logger.info(
        "Tool calls completed, requesting model response in next iteration",
      );
      console.log(
        `[runModelStream] Iteration ${iterations} complete. Tool results added to conversation. Looping for AI response...`,
      );
    }

    logger.warn({ maxIterations }, "Maximum iterations reached");
    console.log(
      `[runModelStream] Max iterations reached. Returning ${accumulatedResponse.length} total chars.`,
    );
    cleanup(); // ✅ Use cleanup function
    sendEvent("done", { citations: [...new Set(allCitations)] });
    res.end();
    return accumulatedResponse;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      "Streaming failed",
    );
    cleanup(); // ✅ Use cleanup function
    sendEvent("error", {
      message:
        error instanceof Error ? error.message : "Unknown streaming error",
    });
    res.end();
    return accumulatedResponse;
  } finally {
    // ✅ Critical: Always cleanup in finally block as last resort
    cleanup();
  }
}
