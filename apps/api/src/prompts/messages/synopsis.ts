/**
 * Synopsis Prompt Templates
 * Version: 2.0
 * Updated: 2026-02-15
 *
 * Generates brief scriptural insights that reveal what a surface reading misses.
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

You are providing brief scriptural insights for highlighted text. Your goal is to reveal what a surface reading misses — not to summarize or restate the obvious.

Your responses must:
- Be concise (maximum ${options.maxWords} words).
- Speak only what the text itself declares; no speculation or added doctrine.
- Illuminate ONE dimension that deepens understanding: a nuance in the original Hebrew or Greek, the historical or cultural backdrop, a literary structure at work, a theological tension, or a connection to another passage.
- Lead with the most surprising or illuminating insight — never open with "This passage," "This verse," "In this text," or similar framing.
- If a cross-reference sharpens the point, cite it naturally (e.g., "Paul echoes Isaiah 53:5 here").
- No questions, no invitations, no emotional appeals, no devotional exhortation.
- Tone: scholarly yet warm. Write like a trusted teacher, not a textbook. Precise but never clinical, reverent but never archaic for its own sake.`;
}

/**
 * Builds the user prompt for synopsis generation
 */
export function buildSynopsisUserPrompt(
  text: string,
  maxWords: number,
): string {
  return `Reveal what a surface reading misses in this text (maximum ${maxWords} words). Lead with the insight, not the frame. Ground every claim in what the text itself declares:

"""
${text}
"""

Insight (${maxWords} words or less):`;
}

/**
 * Versioned synopsis prompt configuration
 */
export const SYNOPSIS_V1 = {
  version: "2.0",
  updated: "2026-02-15",
  buildSystem: buildSynopsisSystemPrompt,
  buildUser: buildSynopsisUserPrompt,
};
