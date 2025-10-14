/**
 * Token counting utility for managing context windows
 * Uses tiktoken for accurate OpenAI token estimation
 */

import { encoding_for_model } from "tiktoken";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import pino from "pino";

const logger = pino({ name: "token-counter" });

// Model context limits
export const MODEL_LIMITS = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
  // Add other models as needed
} as const;

// Reserve tokens for completion
export const COMPLETION_RESERVE = 4096;

/**
 * Count tokens in a single message
 */
export function countMessageTokens(
  message: ChatCompletionMessageParam,
  model: string = "gpt-4o",
): number {
  try {
    const encoding = encoding_for_model(model as any);

    let tokenCount = 4; // Every message has overhead: <|im_start|>{role}\n{content}<|im_end|>\n

    // Add tokens for role
    tokenCount += encoding.encode(message.role).length;

    // Add tokens for content
    if (typeof message.content === "string") {
      tokenCount += encoding.encode(message.content).length;
    } else if (Array.isArray(message.content)) {
      // Handle multi-part content (images, etc.)
      for (const part of message.content) {
        if (part.type === "text") {
          tokenCount += encoding.encode(part.text).length;
        } else if (part.type === "image_url") {
          // Images use a fixed token count based on size
          // For simplicity, assume ~85 tokens per image (low detail)
          tokenCount += 85;
        }
      }
    }

    encoding.free();
    return tokenCount;
  } catch (error) {
    logger.warn(
      { model, error: error instanceof Error ? error.message : error },
      "Failed to count tokens, using fallback estimation",
    );

    // Fallback: rough estimation (1 token ≈ 4 characters)
    const contentStr =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    return Math.ceil((contentStr.length + message.role.length) / 4);
  }
}

/**
 * Count tokens in an array of messages
 */
export function countMessagesTokens(
  messages: ChatCompletionMessageParam[],
  model: string = "gpt-4o",
): number {
  let totalTokens = 3; // Every conversation starts with 3 tokens

  for (const message of messages) {
    totalTokens += countMessageTokens(message, model);
  }

  logger.debug({ totalTokens, messageCount: messages.length }, "Token count");

  return totalTokens;
}

/**
 * Get maximum allowed context tokens for a model
 */
export function getMaxContextTokens(model: string = "gpt-4o"): number {
  const limit =
    MODEL_LIMITS[model as keyof typeof MODEL_LIMITS] || MODEL_LIMITS["gpt-4o"];

  // Reserve tokens for completion
  return limit - COMPLETION_RESERVE;
}

/**
 * Check if messages exceed token limit
 */
export function exceedsTokenLimit(
  messages: ChatCompletionMessageParam[],
  model: string = "gpt-4o",
): boolean {
  const tokenCount = countMessagesTokens(messages, model);
  const maxTokens = getMaxContextTokens(model);

  const exceeds = tokenCount > maxTokens;

  if (exceeds) {
    logger.warn(
      {
        tokenCount,
        maxTokens,
        messageCount: messages.length,
        model,
      },
      "Messages exceed token limit",
    );
  }

  return exceeds;
}

/**
 * Get token budget remaining after messages
 */
export function getRemainingTokens(
  messages: ChatCompletionMessageParam[],
  model: string = "gpt-4o",
): number {
  const used = countMessagesTokens(messages, model);
  const max = getMaxContextTokens(model);
  return Math.max(0, max - used);
}
