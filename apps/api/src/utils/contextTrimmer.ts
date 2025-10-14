/**
 * Context trimmer for managing conversation history
 * Summarizes old assistant messages while preserving all user messages
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  countMessagesTokens,
  getMaxContextTokens,
  countMessageTokens,
} from "./tokenCounter";
import pino from "pino";

const logger = pino({ name: "context-trimmer" });

interface TrimResult {
  messages: ChatCompletionMessageParam[];
  trimmed: boolean;
  originalTokens: number;
  finalTokens: number;
  summarizedCount: number;
}

/**
 * Summarize a group of assistant messages into a concise summary
 */
function summarizeAssistantMessages(
  messages: ChatCompletionMessageParam[],
): string {
  const contents = messages
    .filter((m) => m.role === "assistant" && typeof m.content === "string")
    .map((m) => m.content as string);

  if (contents.length === 0) return "";
  if (contents.length === 1) {
    // Single message: create brief summary
    const content = contents[0];
    if (content.length <= 200) return content;

    // Extract key points from single message
    const sentences = content.split(/[.!?]\s+/).filter((s) => s.trim());
    return sentences.slice(0, 2).join(". ") + ".";
  }

  // Multiple messages: create aggregate summary
  const keyPoints: string[] = [];

  for (const content of contents) {
    // Extract first sentence or first 100 chars
    const firstSentence = content.split(/[.!?]\s+/)[0];
    if (firstSentence && firstSentence.length > 0) {
      const truncated =
        firstSentence.length > 100
          ? firstSentence.slice(0, 100) + "..."
          : firstSentence;
      keyPoints.push(truncated);
    }
  }

  if (keyPoints.length === 0) {
    return "[Previous assistant responses summarized]";
  }

  return `[Summary of ${contents.length} previous responses: ${keyPoints.join("; ")}]`;
}

/**
 * Trim context by summarizing old assistant messages
 * Preserves all user messages and system messages
 * Summarizes oldest assistant messages until token limit is met
 */
export function trimContext(
  messages: ChatCompletionMessageParam[],
  model: string = "gpt-4o",
  targetReduction: number = 0.5, // Reduce to 50% of max by default
): TrimResult {
  const originalTokens = countMessagesTokens(messages, model);
  const maxTokens = getMaxContextTokens(model);

  logger.info(
    { originalTokens, maxTokens, messageCount: messages.length },
    "Starting context trim",
  );

  // If under limit, no trimming needed
  if (originalTokens <= maxTokens) {
    logger.info("No trimming needed, under token limit");
    return {
      messages,
      trimmed: false,
      originalTokens,
      finalTokens: originalTokens,
      summarizedCount: 0,
    };
  }

  // Target token count (aim below max to provide buffer)
  const targetTokens = Math.floor(maxTokens * targetReduction);

  // Separate messages by type
  const systemMessages: ChatCompletionMessageParam[] = [];
  const conversationMessages: Array<{
    message: ChatCompletionMessageParam;
    index: number;
  }> = [];

  messages.forEach((msg, index) => {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      conversationMessages.push({ message: msg, index });
    }
  });

  // Always keep system messages
  const trimmedMessages: ChatCompletionMessageParam[] = [...systemMessages];
  let currentTokens = countMessagesTokens(systemMessages, model);

  // Track assistant messages to summarize
  let assistantChunk: ChatCompletionMessageParam[] = [];
  let summarizedCount = 0;

  // Process conversation messages from oldest to newest
  for (let i = 0; i < conversationMessages.length; i++) {
    const { message } = conversationMessages[i];
    const messageTokens = countMessageTokens(message, model);

    // If we're over target and this is an assistant message, add to chunk for summarization
    if (currentTokens > targetTokens && message.role === "assistant") {
      assistantChunk.push(message);
      summarizedCount++;
      continue;
    }

    // If we have a chunk to summarize and hit a user message, summarize the chunk now
    if (assistantChunk.length > 0 && message.role === "user") {
      const summary = summarizeAssistantMessages(assistantChunk);
      const summaryMessage: ChatCompletionMessageParam = {
        role: "assistant",
        content: summary,
      };

      const summaryTokens = countMessageTokens(summaryMessage, model);
      trimmedMessages.push(summaryMessage);
      currentTokens += summaryTokens;

      logger.debug(
        {
          originalChunkSize: assistantChunk.length,
          summaryTokens,
          savedTokens:
            assistantChunk.reduce(
              (sum, m) => sum + countMessageTokens(m, model),
              0,
            ) - summaryTokens,
        },
        "Summarized assistant chunk",
      );

      assistantChunk = [];
    }

    // Add current message (always keep user messages)
    trimmedMessages.push(message);
    currentTokens += messageTokens;

    // If we're back under target, stop summarizing
    if (currentTokens <= targetTokens) {
      // Add remaining messages without summarization
      for (let j = i + 1; j < conversationMessages.length; j++) {
        trimmedMessages.push(conversationMessages[j].message);
      }
      break;
    }
  }

  // If there's a remaining assistant chunk at the end, summarize it
  if (assistantChunk.length > 0) {
    const summary = summarizeAssistantMessages(assistantChunk);
    const summaryMessage: ChatCompletionMessageParam = {
      role: "assistant",
      content: summary,
    };
    trimmedMessages.push(summaryMessage);
  }

  const finalTokens = countMessagesTokens(trimmedMessages, model);

  logger.info(
    {
      originalTokens,
      finalTokens,
      originalCount: messages.length,
      finalCount: trimmedMessages.length,
      summarizedCount,
      reduction: ((originalTokens - finalTokens) / originalTokens) * 100,
    },
    "Context trimming complete",
  );

  return {
    messages: trimmedMessages,
    trimmed: true,
    originalTokens,
    finalTokens,
    summarizedCount,
  };
}

/**
 * Trim context only if it exceeds the token limit
 * Convenience wrapper around trimContext
 */
export function trimContextIfNeeded(
  messages: ChatCompletionMessageParam[],
  model: string = "gpt-4o",
): TrimResult {
  const maxTokens = getMaxContextTokens(model);
  const currentTokens = countMessagesTokens(messages, model);

  if (currentTokens <= maxTokens) {
    return {
      messages,
      trimmed: false,
      originalTokens: currentTokens,
      finalTokens: currentTokens,
      summarizedCount: 0,
    };
  }

  return trimContext(messages, model);
}
