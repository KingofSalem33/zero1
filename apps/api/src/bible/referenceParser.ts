/**
 * Bible Reference Parser
 *
 * Parses explicit verse references from user input:
 * - "John 3:16"
 * - "Genesis 1:1-3"
 * - "Psalm 23"
 * - "Romans 8:28-30"
 *
 * Handles both full names and abbreviations.
 */

import { BOOK_NAMES } from "./bookNames";
import { levenshteinDistance } from "./fuzzyMatch";

export interface ParsedReference {
  book: string;      // Abbreviation (e.g., "jn", "ge")
  chapter: number;
  verse: number;
  endVerse?: number; // For ranges like "John 3:16-18"
}

// Build regex pattern for all book names and abbreviations
const bookPatterns = [
  ...Object.keys(BOOK_NAMES), // Abbreviations: gn, ex, le, etc.
  ...Object.values(BOOK_NAMES), // Full names: Genesis, Exodus, etc.
].map((name) => name.replace(/\s/g, "\\s?")); // Handle "1 John" vs "1John"

const bookPattern = bookPatterns.join("|");

// Regex patterns for different reference formats
const patterns = [
  // Full format: "John 3:16" or "John 3:16-18"
  new RegExp(
    `\\b(${bookPattern})\\s+(\\d+):(\\d+)(?:-(\\d+))?\\b`,
    "i"
  ),
  // Chapter only: "Psalm 23" (defaults to verse 1)
  new RegExp(`\\b(${bookPattern})\\s+(\\d+)\\b`, "i"),
];

/**
 * Parse explicit verse reference from user input
 *
 * Examples:
 * - "John 3:16" -> { book: "jn", chapter: 3, verse: 16 }
 * - "Genesis 1:1-3" -> { book: "gn", chapter: 1, verse: 1, endVerse: 3 }
 * - "Psalm 23" -> { book: "ps", chapter: 23, verse: 1 }
 *
 * Returns null if no match found.
 */
export function parseExplicitReference(input: string): ParsedReference | null {
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      const bookInput = match[1].trim();
      const chapter = parseInt(match[2], 10);
      const verse = match[3] ? parseInt(match[3], 10) : 1; // Default to verse 1 for chapter-only
      const endVerse = match[4] ? parseInt(match[4], 10) : undefined;

      // Convert book name to abbreviation
      const bookAbbrev = normalizeBookName(bookInput);
      if (!bookAbbrev) {
        continue; // Invalid book name, try next pattern
      }

      return {
        book: bookAbbrev,
        chapter,
        verse,
        endVerse,
      };
    }
  }

  return null;
}

/**
 * Common alternative abbreviations
 * Maps user input -> canonical database abbreviation
 */
const ABBREVIATION_ALIASES: Record<string, string> = {
  // Common aliases that might conflict:
  "jon": "jn",     // Jonah (not Jonathan - that's in 1 Samuel)
  "jonah": "jn",   // Jonah

  // Numbers that might be confused:
  "num": "nu",     // Numbers
  "nums": "nu",    // Numbers

  // Judges vs Joshua:
  "judg": "jg",    // Judges
  "josh": "js",    // Joshua

  // Other common abbreviations:
  "gen": "gn",     // Genesis
  "exo": "ex",     // Exodus
  "exod": "ex",    // Exodus
  "lev": "lv",     // Leviticus
  "deut": "dt",    // Deuteronomy
  "deu": "dt",     // Deuteronomy
  "psa": "ps",     // Psalms
  "psalm": "ps",   // Psalms
  "prov": "pr",    // Proverbs
  "ecc": "ec",     // Ecclesiastes
  "song": "so",    // Song of Solomon
  "isa": "is",     // Isaiah
  "jer": "jr",     // Jeremiah
  "lam": "lm",     // Lamentations
  "eze": "ek",     // Ezekiel
  "ezek": "ek",    // Ezekiel
  "dan": "dn",     // Daniel
  "hos": "hs",     // Hosea
  "joe": "jl",     // Joel
  "amo": "am",     // Amos
  "oba": "ob",     // Obadiah
  "obad": "ob",    // Obadiah
  "mic": "mi",     // Micah
  "nah": "na",     // Nahum
  "hab": "hk",     // Habakkuk
  "zep": "zp",     // Zephaniah
  "zeph": "zp",    // Zephaniah
  "hag": "hg",     // Haggai
  "zec": "zc",     // Zechariah
  "zech": "zc",    // Zechariah
  "mal": "ml",     // Malachi
  "matt": "mt",    // Matthew
  "mar": "mk",     // Mark
  "luk": "lk",     // Luke
  "act": "ac",     // Acts
  "rom": "ro",     // Romans
  "gal": "gl",     // Galatians
  "eph": "ep",     // Ephesians
  "phil": "pp",    // Philippians
  "php": "pp",     // Philippians
  "col": "cl",     // Colossians
  "thess": "1th",  // 1 Thessalonians (will need disambiguation)
  "tim": "1tm",    // 1 Timothy (will need disambiguation)
  "tit": "ti",     // Titus
  "phm": "pm",     // Philemon
  "phlm": "pm",    // Philemon
  "heb": "hb",     // Hebrews
  "jam": "jm",     // James
  "jas": "jm",     // James
  "pet": "1pe",    // 1 Peter (will need disambiguation)
  "joh": "1jn",    // 1 John epistles (will need disambiguation from Gospel)
  "rev": "rv",     // Revelation
  "revel": "rv",   // Revelation
};

/**
 * Normalize book name to abbreviation
 *
 * Handles:
 * - Full names: "Genesis" -> "gn", "John" -> "jo", "Jonah" -> "jn"
 * - Abbreviations: "gen" -> "gn", "jo" -> "jo"
 * - Aliases: "jon" -> "jn" (Jonah)
 * - Case-insensitive matching
 * - Fuzzy matching for misspellings: "salamon" -> "so" (Solomon)
 */
function normalizeBookName(input: string): string | null {
  const lower = input.toLowerCase().trim();

  // Check aliases first (these are explicit mappings)
  if (ABBREVIATION_ALIASES[lower]) {
    return ABBREVIATION_ALIASES[lower];
  }

  // Check if it's already a valid abbreviation in BOOK_NAMES
  if (BOOK_NAMES[lower]) {
    return lower;
  }

  // Check if it matches a full book name (exact)
  for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
    if (fullName.toLowerCase() === lower) {
      return abbrev;
    }
  }

  // Check for partial matches (e.g., "gen" -> "gn")
  for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
    if (fullName.toLowerCase().startsWith(lower) && lower.length >= 3) {
      return abbrev;
    }
  }

  // FUZZY MATCHING: Handle misspellings like "salamon" -> "Solomon"
  if (lower.length >= 4) {
    let bestMatch: string | null = null;
    let bestDistance = Infinity;
    const threshold = lower.length <= 5 ? 1 : 2; // Allow 1-2 character difference

    // Check against full book names
    for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
      const distance = levenshteinDistance(lower, fullName.toLowerCase());
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = abbrev;
      }
    }

    // Also check against common aliases
    for (const [alias, abbrev] of Object.entries(ABBREVIATION_ALIASES)) {
      const distance = levenshteinDistance(lower, alias);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = abbrev;
      }
    }

    if (bestMatch) {
      console.log(`[Reference Parser] Fuzzy matched "${input}" -> "${bestMatch}" (distance: ${bestDistance})`);
      return bestMatch;
    }
  }

  return null;
}

/**
 * Test if input contains an explicit reference
 */
export function hasExplicitReference(input: string): boolean {
  return parseExplicitReference(input) !== null;
}
