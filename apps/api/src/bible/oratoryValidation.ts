/**
 * ORATORY Scripture Resonance Validation
 *
 * After a pastoral response, finds verses that validate and support
 * the themes discussed. Uses semantic search to surface Scripture
 * that resonates with the pastoral care given.
 */

import { searchVersesByQuery } from "./semanticSearch";

interface ResonantVerse {
  id: number;
  reference: string;
  text: string;
  similarity: number;
}

/**
 * Find Scripture that resonates with the user's original issue
 *
 * @param userMessage - The user's original message (the actual issue)
 * @param pastoralResponse - The pastoral response (for fallback if needed)
 * @param limit - Number of verses to return (default: 3)
 * @returns Array of verses that validate/support the user's core issue
 */
export async function findResonantScripture(
  userMessage: string,
  _pastoralResponse: string, // Reserved for future use (e.g., avoiding duplicate verses)
  limit: number = 3,
): Promise<ResonantVerse[]> {
  console.log(
    `[Oratory Validation] Finding Scripture for user's issue: "${userMessage.substring(0, 100)}..."`,
  );

  const startTime = Date.now();

  // Use the USER'S MESSAGE as the search query - that's the real issue needing validation
  // The pastoral response already addresses it, we want Scripture that speaks to the original problem
  const searchQuery = userMessage.substring(0, 500);

  console.log(
    `[Oratory Validation] Searching for Scripture addressing: "${searchQuery}"`,
  );

  try {
    // Use semantic search to find verses that address the user's actual issue
    const results = await searchVersesByQuery(
      searchQuery,
      limit * 3, // Get more candidates for diversity (avoid verses already in response)
      0.5, // Lower threshold - we want verses that speak to the issue broadly
    );

    if (results.length === 0) {
      console.log("[Oratory Validation] No resonant verses found");
      return [];
    }

    // Filter for diversity - prefer verses from different books/chapters
    const diverseVerses: ResonantVerse[] = [];
    const usedBooks = new Set<string>();

    for (const verse of results) {
      // Prefer verses from books we haven't used yet
      if (!usedBooks.has(verse.book_abbrev) || diverseVerses.length < limit) {
        diverseVerses.push({
          id: verse.id,
          reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
          text: verse.text,
          similarity: verse.similarity,
        });

        usedBooks.add(verse.book_abbrev);

        if (diverseVerses.length >= limit) {
          break;
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[Oratory Validation] ✅ Found ${diverseVerses.length} resonant verses in ${elapsed}ms`,
    );

    // Log what we found
    diverseVerses.forEach((v, i) => {
      console.log(
        `[Oratory Validation]   ${i + 1}. ${v.reference} (${(v.similarity * 100).toFixed(0)}% resonance)`,
      );
    });

    return diverseVerses;
  } catch (error) {
    console.error(
      "[Oratory Validation] Failed to find resonant Scripture:",
      error,
    );
    return [];
  }
}

/**
 * Find Scripture that resonates with a specific theme or phrase
 * Useful for targeted validation of specific pastoral statements
 *
 * @param theme - A specific theme or phrase to validate
 * @param limit - Number of verses to return (default: 2)
 * @returns Array of verses that support this specific theme
 */
export async function findThemeValidation(
  theme: string,
  limit: number = 2,
): Promise<ResonantVerse[]> {
  console.log(`[Oratory Validation] Finding validation for theme: "${theme}"`);

  try {
    const results = await searchVersesByQuery(
      theme,
      limit,
      0.6, // Higher threshold for specific themes
    );

    return results.map((verse) => ({
      id: verse.id,
      reference: `${verse.book_name} ${verse.chapter}:${verse.verse}`,
      text: verse.text,
      similarity: verse.similarity,
    }));
  } catch (error) {
    console.error(
      "[Oratory Validation] Failed to find theme validation:",
      error,
    );
    return [];
  }
}
