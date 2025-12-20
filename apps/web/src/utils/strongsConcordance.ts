/**
 * Utilities for working with Strong's Concordance Bible data
 */

// Mapping from full book names to kaiserlik abbreviations
export const BOOK_TO_ABBREV: Record<string, string> = {
  Genesis: "Gen",
  Exodus: "Exo",
  Leviticus: "Lev",
  Numbers: "Num",
  Deuteronomy: "Deu",
  Joshua: "Jos",
  Judges: "Jdg",
  Ruth: "Rth",
  "1 Samuel": "1Sa",
  "2 Samuel": "2Sa",
  "1 Kings": "1Ki",
  "2 Kings": "2Ki",
  "1 Chronicles": "1Ch",
  "2 Chronicles": "2Ch",
  Ezra: "Ezr",
  Nehemiah: "Neh",
  Esther: "Est",
  Job: "Job",
  Psalms: "Psa",
  Proverbs: "Pro",
  Ecclesiastes: "Ecc",
  "Song of Solomon": "Sng",
  Isaiah: "Isa",
  Jeremiah: "Jer",
  Lamentations: "Lam",
  Ezekiel: "Eze",
  Daniel: "Dan",
  Hosea: "Hos",
  Joel: "Joe",
  Amos: "Amo",
  Obadiah: "Oba",
  Jonah: "Jon",
  Micah: "Mic",
  Nahum: "Nah",
  Habakkuk: "Hab",
  Zephaniah: "Zep",
  Haggai: "Hag",
  Zechariah: "Zec",
  Malachi: "Mal",
  Matthew: "Mat",
  Mark: "Mar",
  Luke: "Luk",
  John: "Jhn",
  Acts: "Act",
  Romans: "Rom",
  "1 Corinthians": "1Co",
  "2 Corinthians": "2Co",
  Galatians: "Gal",
  Ephesians: "Eph",
  Philippians: "Phl",
  Colossians: "Col",
  "1 Thessalonians": "1Th",
  "2 Thessalonians": "2Th",
  "1 Timothy": "1Ti",
  "2 Timothy": "2Ti",
  Titus: "Tit",
  Philemon: "Phm",
  Hebrews: "Heb",
  James: "Jas",
  "1 Peter": "1Pe",
  "2 Peter": "2Pe",
  "1 John": "1Jo",
  "2 John": "2Jo",
  "3 John": "3Jo",
  Jude: "Jde",
  Revelation: "Rev",
};

// Reverse mapping
export const ABBREV_TO_BOOK: Record<string, string> = Object.entries(
  BOOK_TO_ABBREV,
).reduce(
  (acc, [book, abbrev]) => {
    acc[abbrev] = book;
    return acc;
  },
  {} as Record<string, string>,
);

export interface StrongsWord {
  text: string;
  strongs?: string; // e.g., "H7225" or "G1722"
}

export interface StrongsLexiconEntry {
  Hb_word?: string; // For Hebrew
  Gk_word?: string; // For Greek
  transliteration: string;
  strongs_def: string;
  part_of_speech: string;
  root_word: string;
  occurrences: string;
  outline_usage: string;
}

/**
 * Extract Strong's numbers from a verse text
 * Input: "In[G1722] the[G3588] beginning[G746]"
 * Output: [{text: "In", strongs: "G1722"}, {text: "the", strongs: "G3588"}, ...]
 */
export function extractStrongsWords(verseText: string): StrongsWord[] {
  const words: StrongsWord[] = [];

  // Regex to match word[H1234] or word[G1234] or just word
  const regex = /(\S+?)(?:\[([HG]\d+)\])?(?:\s|$)/g;

  let match;
  while ((match = regex.exec(verseText)) !== null) {
    const text = match[1];
    const strongs = match[2];

    // Remove any trailing punctuation from text
    words.push({
      text: text,
      strongs: strongs,
    });
  }

  return words;
}

/**
 * Get verse text with Strong's numbers from the local Strong's Bible
 */
export async function getStrongsVerse(
  book: string,
  chapter: number,
  verse: number,
): Promise<string | null> {
  try {
    const abbrev = BOOK_TO_ABBREV[book];
    if (!abbrev) {
      console.error(`No abbreviation found for book: ${book}`);
      return null;
    }

    const response = await fetch(`/bible/strongs/${abbrev}.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Navigate the structure: data[abbrev][abbrev|chapter][abbrev|chapter|verse].en
    const bookData = data[abbrev];
    if (!bookData) return null;

    const chapterKey = `${abbrev}|${chapter}`;
    const chapterData = bookData[chapterKey];
    if (!chapterData) return null;

    const verseKey = `${abbrev}|${chapter}|${verse}`;
    const verseData = chapterData[verseKey];
    if (!verseData || !verseData.en) return null;

    return verseData.en;
  } catch (error) {
    console.error("Error loading Strong's verse:", error);
    return null;
  }
}

/**
 * Get multiple verses with Smart's numbers
 * Useful for loading context around a highlighted passage
 */
export async function getStrongsVerses(
  book: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
): Promise<string[]> {
  const verses: string[] = [];

  for (let v = startVerse; v <= endVerse; v++) {
    const verseText = await getStrongsVerse(book, chapter, v);
    if (verseText) {
      verses.push(verseText);
    }
  }

  return verses;
}

/**
 * Extract all unique Strong's numbers from a verse or passage
 */
export function extractUniqueStrongsNumbers(verseText: string): string[] {
  const regex = /\[([HG]\d+)\]/g;
  const numbers = new Set<string>();

  let match;
  while ((match = regex.exec(verseText)) !== null) {
    numbers.add(match[1]);
  }

  return Array.from(numbers);
}

/**
 * Determine if Strong's numbers are Hebrew (OT) or Greek (NT)
 */
export function detectLanguage(
  strongsNumbers: string[],
): "hebrew" | "greek" | "mixed" {
  const hasHebrew = strongsNumbers.some((num) => num.startsWith("H"));
  const hasGreek = strongsNumbers.some((num) => num.startsWith("G"));

  if (hasHebrew && hasGreek) return "mixed";
  if (hasHebrew) return "hebrew";
  return "greek";
}

/**
 * Load Strong's lexicon entries for given Strong's numbers
 */
export async function getStrongsDefinitions(
  strongsNumbers: string[],
): Promise<Record<string, StrongsLexiconEntry>> {
  try {
    const response = await fetch("/bible/strongs/lexicon.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const lexicon = await response.json();
    const definitions: Record<string, StrongsLexiconEntry> = {};

    for (const num of strongsNumbers) {
      if (lexicon[num]) {
        definitions[num] = lexicon[num];
      }
    }

    return definitions;
  } catch (error) {
    console.error("Error loading Strong's lexicon:", error);
    return {};
  }
}

/**
 * Strip Strong's numbers from text to get clean reading text
 * Input: "In[G1722] the[G3588] beginning[G746]"
 * Output: "In the beginning"
 */
export function stripStrongsNumbers(text: string): string {
  return text.replace(/\[([HG]\d+)\]/g, "");
}

/**
 * Count total words in a passage (for 100-word cap)
 */
export function countWords(text: string): number {
  const cleanText = stripStrongsNumbers(text);
  return cleanText.trim().split(/\s+/).length;
}

/**
 * Smart truncate to complete verses within word limit
 * Returns the truncated text and the number of verses included
 */
export function smartTruncate(
  verses: string[],
  maxWords: number,
): { text: string; versesIncluded: number } {
  let totalWords = 0;
  let versesIncluded = 0;
  const includedVerses: string[] = [];

  for (const verse of verses) {
    const wordsInVerse = countWords(verse);

    // Check if adding this verse would exceed the limit
    if (totalWords + wordsInVerse > maxWords && versesIncluded > 0) {
      break; // Stop before exceeding limit (unless it's the first verse)
    }

    includedVerses.push(verse);
    totalWords += wordsInVerse;
    versesIncluded++;

    // If this is the first verse and it already exceeds limit, include it anyway
    if (versesIncluded === 1 && totalWords >= maxWords) {
      break;
    }
  }

  return {
    text: includedVerses.join(" "),
    versesIncluded,
  };
}
