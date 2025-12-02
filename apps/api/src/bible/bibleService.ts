import fs from "fs/promises";
import path from "path";
import { Verse, VerseRef, Book } from "./types";
import { BOOK_NAMES, ABBREV_TO_INDEX } from "./bookNames";
import { fuzzyMatchWord, calculateMatchScore } from "./fuzzyMatch";

// Helper to convert full book name to abbreviation
function normalizeBookName(bookName: string): string {
  const lower = bookName.toLowerCase().trim();

  // First check if it's already an abbreviation
  if (ABBREV_TO_INDEX[lower] !== undefined) {
    return lower;
  }

  // Check if it matches a full book name
  for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
    if (fullName.toLowerCase() === lower) {
      return abbrev;
    }
  }

  // Return as-is if no match (will fail lookup later)
  return lower;
}

// Resolve relative to this file so dev (root cwd) and build (dist cwd) both work
const KJV_PATH = path.join(__dirname, "..", "..", "data", "kjv.json");

let kjvData: Book[] | null = null;

/**
 * Load KJV Bible data into memory
 */
export async function loadKJVData(): Promise<Book[]> {
  if (kjvData) {
    return kjvData;
  }

  try {
    console.log(`[Bible Service] Loading KJV data from ${KJV_PATH}...`);
    const rawData = await fs.readFile(KJV_PATH, "utf-8");
    console.log(
      `[Bible Service] File loaded, parsing JSON (${rawData.length} chars, first char code: ${rawData.charCodeAt(0)})...`,
    );
    const books = JSON.parse(rawData) as Book[];

    // Add full book names
    kjvData = books.map((book) => ({
      ...book,
      name: BOOK_NAMES[book.abbrev] || book.abbrev.toUpperCase(),
    }));

    console.log(`[Bible Service] Loaded ${kjvData.length} books from KJV`);
    return kjvData;
  } catch (error) {
    console.error("[Bible Service] Failed to load KJV data:", error);
    throw new Error("Failed to load KJV Bible data");
  }
}

/**
 * Get a single verse by reference
 */
export async function getVerse(ref: VerseRef): Promise<Verse | null> {
  const data = await loadKJVData();

  const normalizedBook = normalizeBookName(ref.book);
  const bookIndex = ABBREV_TO_INDEX[normalizedBook];
  if (bookIndex === undefined || bookIndex >= data.length) {
    console.log(
      `[Bible Service] Book not found: "${ref.book}" (normalized: "${normalizedBook}")`,
    );
    return null;
  }

  const book = data[bookIndex];
  const chapter = book.chapters[ref.chapter - 1];

  if (!chapter || ref.verse < 1 || ref.verse > chapter.length) {
    return null;
  }

  return {
    book: book.name,
    chapter: ref.chapter,
    verse: ref.verse,
    text: chapter[ref.verse - 1],
  };
}

/**
 * Get multiple verses by references
 */
export async function getVerses(refs: VerseRef[]): Promise<Verse[]> {
  const verses: Verse[] = [];

  for (const ref of refs) {
    const verse = await getVerse(ref);
    if (verse) {
      verses.push(verse);
    }
  }

  return verses;
}

/**
 * Get a range of verses from a chapter
 */
export async function getVerseRange(
  book: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
): Promise<Verse[]> {
  const data = await loadKJVData();

  const normalizedBook = normalizeBookName(book);
  const bookIndex = ABBREV_TO_INDEX[normalizedBook];
  if (bookIndex === undefined || bookIndex >= data.length) {
    console.log(
      `[Bible Service] Book not found: "${book}" (normalized: "${normalizedBook}")`,
    );
    return [];
  }

  const bookData = data[bookIndex];
  const chapterData = bookData.chapters[chapter - 1];

  if (!chapterData) {
    return [];
  }

  const verses: Verse[] = [];
  const actualStart = Math.max(1, startVerse);
  const actualEnd = Math.min(chapterData.length, endVerse);

  for (let verseNum = actualStart; verseNum <= actualEnd; verseNum++) {
    verses.push({
      book: bookData.name,
      chapter,
      verse: verseNum,
      text: chapterData[verseNum - 1],
    });
  }

  return verses;
}

/**
 * Search verses by keywords with fuzzy matching for misspellings
 *
 * Strategy:
 * 1. Try exact matching first (fast path)
 * 2. If no results, try fuzzy matching (handles misspellings like "salamon" -> "solomon")
 * 3. Rank results by match quality
 */
export async function searchVerses(
  keywords: string[],
  limit: number = 50,
): Promise<Verse[]> {
  const data = await loadKJVData();

  // Normalize keywords for case-insensitive matching
  const normalizedKeywords = keywords.map((k) => k.toLowerCase());

  console.log(`[Bible Service] Searching for keywords:`, normalizedKeywords);

  // ========================================
  // FAST PATH: Try exact matching first
  // ========================================
  const exactResults: Verse[] = [];

  for (const book of data) {
    for (let chapterIdx = 0; chapterIdx < book.chapters.length; chapterIdx++) {
      const chapter = book.chapters[chapterIdx];

      for (let verseIdx = 0; verseIdx < chapter.length; verseIdx++) {
        const verseText = chapter[verseIdx];
        const normalizedText = verseText.toLowerCase();

        // Check if verse contains any of the keywords (exact substring match)
        const matchCount = normalizedKeywords.filter((keyword) =>
          normalizedText.includes(keyword),
        ).length;

        if (matchCount > 0) {
          exactResults.push({
            book: book.name,
            chapter: chapterIdx + 1,
            verse: verseIdx + 1,
            text: verseText,
          });

          if (exactResults.length >= limit) {
            console.log(
              `[Bible Service] Found ${exactResults.length} exact matches`,
            );
            return exactResults;
          }
        }
      }
    }
  }

  // If we found exact matches, return them
  if (exactResults.length > 0) {
    console.log(`[Bible Service] Found ${exactResults.length} exact matches`);
    return exactResults;
  }

  // ========================================
  // FALLBACK: Fuzzy matching for misspellings
  // ========================================
  console.log(`[Bible Service] No exact matches, trying fuzzy matching...`);

  interface ScoredVerse extends Verse {
    score: number;
  }

  const fuzzyResults: ScoredVerse[] = [];

  for (const book of data) {
    for (let chapterIdx = 0; chapterIdx < book.chapters.length; chapterIdx++) {
      const chapter = book.chapters[chapterIdx];

      for (let verseIdx = 0; verseIdx < chapter.length; verseIdx++) {
        const verseText = chapter[verseIdx];

        // Check if verse fuzzy-matches any keyword
        let matchCount = 0;
        let totalScore = 0;

        for (const keyword of normalizedKeywords) {
          if (fuzzyMatchWord(keyword, verseText)) {
            matchCount++;
            totalScore += calculateMatchScore(keyword, verseText);
          }
        }

        if (matchCount > 0) {
          fuzzyResults.push({
            book: book.name,
            chapter: chapterIdx + 1,
            verse: verseIdx + 1,
            text: verseText,
            score: totalScore / matchCount, // Average score
          });

          // Keep collecting more results for ranking
          // (don't early-exit like exact matching)
          if (fuzzyResults.length >= limit * 3) {
            break; // But don't search the entire Bible
          }
        }
      }
    }
  }

  // Sort by score (lower = better) and take top results
  fuzzyResults.sort((a, b) => a.score - b.score);
  const topResults = fuzzyResults.slice(0, limit);

  console.log(
    `[Bible Service] Found ${topResults.length} fuzzy matches (from ${fuzzyResults.length} candidates)`,
  );

  // Remove score property before returning
  return topResults.map(({ score: _score, ...verse }) => verse);
}

/**
 * Format verse reference as string
 */
export function formatVerseRef(ref: VerseRef): string {
  return `${ref.book} ${ref.chapter}:${ref.verse}`;
}

/**
 * Format verse with reference
 */
export function formatVerse(verse: Verse): string {
  return `${formatVerseRef(verse)} – ${verse.text}`;
}
