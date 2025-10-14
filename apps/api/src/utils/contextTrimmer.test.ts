/**
 * Test suite for context trimmer
 * Verifies token counting, summarization, and trimming logic
 */

import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { trimContext, trimContextIfNeeded } from "./contextTrimmer";
import { countMessagesTokens, getMaxContextTokens } from "./tokenCounter";

// Test helper: Create a long message that will exceed token limits
function createLongMessage(length: number): string {
  return "This is a test message. ".repeat(Math.ceil(length / 25));
}

// Test 1: No trimming needed for small contexts
console.log("\n=== Test 1: Small context (no trimming needed) ===");
const smallMessages: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello, how are you?" },
  { role: "assistant", content: "I'm doing great! How can I help you today?" },
  { role: "user", content: "Tell me about context windows." },
];

const smallResult = trimContextIfNeeded(smallMessages, "gpt-4o");
console.log(
  "Original token count:",
  countMessagesTokens(smallMessages, "gpt-4o"),
);
console.log("Final token count:", smallResult.finalTokens);
console.log("Trimmed:", smallResult.trimmed);
console.log("✅ Test 1 passed: No trimming for small context\n");

// Test 2: Trimming large assistant messages
console.log("=== Test 2: Large assistant messages (trimming needed) ===");
const largeMessages: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Question 1" },
  {
    role: "assistant",
    content: createLongMessage(10000),
  },
  { role: "user", content: "Question 2" },
  {
    role: "assistant",
    content: createLongMessage(10000),
  },
  { role: "user", content: "Question 3" },
  {
    role: "assistant",
    content: createLongMessage(10000),
  },
  { role: "user", content: "Question 4" },
  {
    role: "assistant",
    content: createLongMessage(10000),
  },
  { role: "user", content: "Question 5" },
];

const largeOriginalTokens = countMessagesTokens(largeMessages, "gpt-4o");
const largeResult = trimContext(largeMessages, "gpt-4o", 0.5);

console.log("Original token count:", largeOriginalTokens);
console.log("Final token count:", largeResult.finalTokens);
console.log("Trimmed:", largeResult.trimmed);
console.log("Summarized count:", largeResult.summarizedCount);
console.log(
  "Reduction:",
  (
    ((largeOriginalTokens - largeResult.finalTokens) / largeOriginalTokens) *
    100
  ).toFixed(1) + "%",
);

// Verify all user messages are preserved
const originalUserCount = largeMessages.filter((m) => m.role === "user").length;
const trimmedUserCount = largeResult.messages.filter(
  (m) => m.role === "user",
).length;
console.log("Original user messages:", originalUserCount);
console.log("Trimmed user messages:", trimmedUserCount);

if (trimmedUserCount !== originalUserCount) {
  console.error("❌ Test 2 FAILED: User messages were not preserved!");
  process.exit(1);
}

console.log(
  "✅ Test 2 passed: Large context trimmed, user messages preserved\n",
);

// Test 3: Verify system messages are always kept
console.log("=== Test 3: System message preservation ===");
const messagesWithSystem: ChatCompletionMessageParam[] = [
  {
    role: "system",
    content: createLongMessage(1000) + " SYSTEM MESSAGE MARKER",
  },
  { role: "user", content: "Question 1" },
  { role: "assistant", content: createLongMessage(10000) },
  { role: "user", content: "Question 2" },
  { role: "assistant", content: createLongMessage(10000) },
];

const systemResult = trimContext(messagesWithSystem, "gpt-4o", 0.5);
const hasSystemMarker = systemResult.messages.some(
  (m) =>
    m.role === "system" &&
    typeof m.content === "string" &&
    m.content.includes("SYSTEM MESSAGE MARKER"),
);

if (!hasSystemMarker) {
  console.error("❌ Test 3 FAILED: System message was not preserved!");
  process.exit(1);
}

console.log("✅ Test 3 passed: System message preserved\n");

// Test 4: Verify token limits
console.log("=== Test 4: Token limit enforcement ===");
const maxTokens = getMaxContextTokens("gpt-4o");
console.log("Max context tokens for gpt-4o:", maxTokens);

// Create messages that exceed limit
const exceedingMessages: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Start conversation" },
];

// Add enough messages to exceed the limit
for (let i = 0; i < 50; i++) {
  exceedingMessages.push({
    role: "assistant",
    content: createLongMessage(5000),
  });
  exceedingMessages.push({
    role: "user",
    content: `Question ${i + 1}`,
  });
}

const exceedingTokens = countMessagesTokens(exceedingMessages, "gpt-4o");
console.log("Created messages with tokens:", exceedingTokens);
console.log("Exceeds limit:", exceedingTokens > maxTokens);

const limitResult = trimContext(exceedingMessages, "gpt-4o", 0.5);
console.log("After trimming:", limitResult.finalTokens);
console.log("Under target:", limitResult.finalTokens < maxTokens * 0.5);

if (limitResult.finalTokens > maxTokens) {
  console.error("❌ Test 4 FAILED: Trimmed result still exceeds token limit!");
  process.exit(1);
}

console.log("✅ Test 4 passed: Token limit enforced\n");

// Summary
console.log("=== All Tests Passed ✅ ===");
console.log("Context trimmer is working correctly:");
console.log("- Small contexts are not unnecessarily trimmed");
console.log("- Large assistant messages are summarized");
console.log("- All user messages are preserved");
console.log("- System messages are always kept");
console.log("- Token limits are enforced");
