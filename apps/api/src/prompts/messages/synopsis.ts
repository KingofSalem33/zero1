/**
 * Synopsis Prompt Templates
 * Version: 1.0
 * Updated: 2026-01-01
 *
 * Generates brief scriptural insights for highlighted text.
 */

import { BIBLE_STUDY_IDENTITY } from "../constants/identities";

export interface SynopsisPromptOptions {
  maxWords: number;
}

/**
 * Builds the system prompt for synopsis generation
 */
export function buildSynopsisSystemPrompt(
  options: SynopsisPromptOptions,
): string {
  return `${BIBLE_STUDY_IDENTITY}

You are providing brief scriptural insights for highlighted text. Your responses must:
- Be concise (maximum ${options.maxWords} words).
- Use KJV diction; avoid modern academic language.
- Speak only what the text itself says; no speculation or added doctrine.
- If the text is Scripture, quote a short clause and cite the reference if present.
- No questions, no invitations, no emotional appeals.`;
}

/**
 * Builds the user prompt for synopsis generation
 */
export function buildSynopsisUserPrompt(
  text: string,
  maxWords: number,
): string {
  return `Provide a brief scriptural insight (maximum ${maxWords} words) grounded only in the text itself (KJV tone, no speculation):

"""
${text}
"""

Brief insight (${maxWords} words or less):`;
}

/**
 * Versioned synopsis prompt configuration
 */
export const SYNOPSIS_V1 = {
  version: "1.0",
  updated: "2026-01-01",
  buildSystem: buildSynopsisSystemPrompt,
  buildUser: buildSynopsisUserPrompt,
};
