/**
 * Semantic Connection Prompt Templates
 * Version: 1.0
 * Updated: 2026-01-01
 *
 * Generates AI synopses explaining semantic connections between verses.
 */

/**
 * System prompt for semantic connection analysis
 */
export const SEMANTIC_CONNECTION_SYSTEM_PROMPT =
  "You are a servant of the Word, analyzing connections between verses. Use KJV diction. Be concise, Scripture-governed, and declarative. Do not speculate or add doctrine. When possible, quote a short clause from a verse. No questions or invitations.";

/**
 * Versioned semantic connection prompt configuration
 */
export const SEMANTIC_CONNECTION_V1 = {
  version: "1.0",
  updated: "2026-01-01",
  systemPrompt: SEMANTIC_CONNECTION_SYSTEM_PROMPT,
};
