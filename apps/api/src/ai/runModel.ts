import type {
  ChatCompletionTool,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from "openai/resources";
import { makeOpenAI } from "../ai";
import { toolMap, type ToolName } from "./tools";
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
  toolMap?: typeof toolMap;
  maxIterations?: number;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  onToolCall?: (toolName: string, args: unknown) => void;
  onToolResult?: (toolName: string, result: unknown) => void;
  onToolError?: (toolName: string, error: string) => void;
}

export interface RunModelResult {
  text: string;
  citations?: string[];
  tools_used?: ToolActivity[];
}

export async function runModel(
  messages: ChatCompletionMessageParam[],
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
  } = options;

  const client = makeOpenAI();
  if (!client) {
    throw new Error("OpenAI client not configured");
  }

  const conversationMessages: ChatCompletionMessageParam[] = [...messages];
  const allCitations: string[] = [];
  const toolActivity: ToolActivity[] = [];
  let iterations = 0;

  logger.info(
    { messageCount: messages.length, toolCount: toolSpecs.length },
    "Starting model run",
  );

  while (iterations < maxIterations) {
    iterations++;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: conversationMessages,
        tools: toolSpecs.length > 0 ? toolSpecs : undefined,
        tool_choice: toolSpecs.length > 0 ? "auto" : undefined,
        temperature: 0.3,
        max_tokens: 16000, // Increased to leverage GPT-5-mini's 128k output capacity
        // GPT-5 specific parameters (will be ignored by older models)
        ...(model.startsWith("gpt-5") && {
          reasoning_effort: reasoningEffort,
          verbosity: verbosity,
        }),
      });

      const choice = response.choices[0];
      if (!choice?.message) {
        throw new Error("No message in response");
      }

      const assistantMessage = choice.message;
      logger.info(
        {
          iteration: iterations,
          hasToolCalls: !!assistantMessage.tool_calls?.length,
        },
        "Received model response",
      );

      // Add assistant message to conversation
      conversationMessages.push(assistantMessage);

      // Check if there are tool calls to process
      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        // No tool calls, return final response
        return {
          text: assistantMessage.content || "",
          citations:
            allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
          tools_used: toolActivity.length > 0 ? toolActivity : undefined,
        };
      }

      // Process tool calls
      logger.info(
        { toolCallCount: assistantMessage.tool_calls.length },
        "Processing tool calls",
      );

      for (const toolCall of assistantMessage.tool_calls) {
        const { id } = toolCall;

        // Handle different tool call types
        if (toolCall.type !== "function") {
          logger.warn({ toolCall }, "Unsupported tool call type");
          continue;
        }

        const func = (toolCall as any).function;
        const toolName = func.name as ToolName;

        if (!providedToolMap[toolName]) {
          logger.error({ toolName }, "Unknown tool requested");
          conversationMessages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
          });
          continue;
        }

        try {
          // Parse arguments
          const args = JSON.parse(func.arguments || "{}");
          logger.info({ toolName, args }, "Executing tool");

          // Track tool call start
          const timestamp = new Date().toISOString();
          toolActivity.push({
            type: "tool_start",
            tool: toolName,
            args,
            timestamp,
          });
          onToolCall?.(toolName, args);

          // Execute tool function with validation
          const result = await providedToolMap[toolName](args);

          // Track tool call success
          toolActivity.push({
            type: "tool_end",
            tool: toolName,
            result,
            timestamp: new Date().toISOString(),
          });
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

          // Track tool call error
          toolActivity.push({
            type: "tool_error",
            tool: toolName,
            error: errorMessage,
            timestamp: new Date().toISOString(),
          });
          onToolError?.(toolName, errorMessage);

          conversationMessages.push({
            role: "tool",
            tool_call_id: id,
            content: JSON.stringify({ error: errorMessage }),
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
          .reverse()
          .find((msg) => msg.role === "assistant") as
          | ChatCompletionMessage
          | undefined;

        return {
          text:
            lastAssistantMessage?.content ||
            "An error occurred during processing",
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
    .reverse()
    .find((msg) => msg.role === "assistant") as
    | ChatCompletionMessage
    | undefined;

  return {
    text:
      lastAssistantMessage?.content ||
      "Maximum iterations reached without completion",
    citations: allCitations.length > 0 ? [...new Set(allCitations)] : undefined,
    tools_used: toolActivity.length > 0 ? toolActivity : undefined,
  };
}
