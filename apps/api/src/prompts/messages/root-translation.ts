/**
 * Root Translation Prompt Templates
 * Version: 2.0
 * Updated: 2026-01-23
 *
 * Generates "Lost in Translation" analysis using Strong's Concordance.
 */

import { BIBLE_STUDY_IDENTITY } from "../constants/identities";

export interface RootTranslationPromptContext {
  selectedText: string;
  verseWithStrongs: string;
  groundingData: string;
}

/**
 * Builds the system prompt for root translation
 */
export function buildRootTranslationSystemPrompt(): string {
  return `${BIBLE_STUDY_IDENTITY}

You are providing "Lost in Translation" analysis using Strong's Concordance.

Your goal: Build a revelation surface, not a study tool.

CRITICAL: Output ONLY the analysis text. Do NOT include headings, bullet lists, or labels.

Be thorough: cover the significant nuances that English flattens. Use 3-6 short sentences, arranged as 1-2 compact paragraphs, and end each sentence with a period.

Focus on:
- The verse as a whole, not a word-by-word breakdown.
- How combined phrasing, grammar, and flow shape meaning beyond English.
- Cultural or philosophical context that frames the verse's intent.

STRICT RULES:
1. Do not list words or definitions.
2. Do not explain the verse word-by-word.
3. No verse labels or references.
4. Use precise, vivid English without explaining your process.
5. Avoid filler phrases like "this means" or "it indicates."
6. Every sentence must surface a concrete nuance lost in translation and illuminate the text toward the closest possible original meaning.
7. Include at least one original-language term so it’s clear this comes from the source text.
8. Use original terms only when they clarify a nuance (avoid gratuitous word lists).
9. Keep the tone revelatory and complete, without being wordy.`;
}

/**
 * Builds the user prompt for root translation
 */
export function buildRootTranslationUserPrompt(
  context: RootTranslationPromptContext,
): string {
  return `Using ONLY the Strong's Concordance data below, provide "Lost in Translation" analysis:

Selected text: "${context.selectedText}"

Verse with Strong's numbers: ${context.verseWithStrongs}

Strong's Concordance Data:
${context.groundingData}

Generate the response in the format specified (analysis text only):`;
}

/**
 * Versioned root translation prompt configuration
 */
export const ROOT_TRANSLATION_V2 = {
  version: "2.0",
  updated: "2026-01-23",
  buildSystem: buildRootTranslationSystemPrompt,
  buildUser: buildRootTranslationUserPrompt,
};
