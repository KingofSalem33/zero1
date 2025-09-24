import type {
  ChatCompletionTool,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from "openai/resources";
import { makeOpenAI } from "../ai";
import { toolMap, type ToolName } from "./tools";
import { ZodError } from "zod";
import pino from "pino";

const logger = pino({ name: "runModel" });

export interface RunModelOptions {
  toolSpecs?: ChatCompletionTool[];
  toolMap?: typeof toolMap;
  maxIterations?: number;
  model?: string;
}

export interface RunModelResult {
  text: string;
  citations?: string[];
}

export async function runModel(
  messages: ChatCompletionMessageParam[],
  options: RunModelOptions = {},
): Promise<RunModelResult> {
  const {
    toolSpecs = [],
    toolMap: providedToolMap = toolMap,
    maxIterations = 10,
    model = "gpt-4o", // Using gpt-4o instead of gpt-5 as it's more widely available
  } = options;

  const client = makeOpenAI();
  if (!client) {
    throw new Error("OpenAI client not configured");
  }

  const conversationMessages: ChatCompletionMessageParam[] = [...messages];
  const allCitations: string[] = [];
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
        max_tokens: 2000,
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

          // Execute tool function with validation
          const result = await providedToolMap[toolName](args);

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
  };
}
