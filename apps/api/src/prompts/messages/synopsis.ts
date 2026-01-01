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

You are providing brief scriptural insights for highlighted text. Your responses should:
- Be concise (maximum ${options.maxWords} words)
- Draw from KJV Scripture when relevant
- Explain the significance or key meaning
- Use plain, accessible language
- Focus on what's important or noteworthy from a biblical perspective`;
}

/**
 * Builds the user prompt for synopsis generation
 */
export function buildSynopsisUserPrompt(
  text: string,
  maxWords: number,
): string {
  return `Provide a brief scriptural insight (maximum ${maxWords} words) explaining the significance of this text from a KJV biblical perspective:

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
