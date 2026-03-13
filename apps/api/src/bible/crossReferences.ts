import fs from "fs/promises";
import path from "path";
import { VerseRef } from "./types";

// OpenBible.info cross-reference data uses different abbreviations
// Map them to full book names
const OPENBIBLE_BOOK_NAMES: Record<string, string> = {
  gn: "Genesis",
  ex: "Exodus",
  lv: "Leviticus",
  nu: "Numbers",
  dt: "Deuteronomy",
  jos: "Joshua",
  jdg: "Judges",
  ru: "Ruth",
  "1sa": "1 Samuel",
  "2sa": "2 Samuel",
  "1ki": "1 Kings",
  "2ki": "2 Kings",
  "1ch": "1 Chronicles",
  "2ch": "2 Chronicles",
  ezr: "Ezra",
  ne: "Nehemiah",
  est: "Esther",
  job: "Job",
  ps: "Psalms",
  pr: "Proverbs",
  ec: "Ecclesiastes",
  sng: "Song of Solomon",
  is: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  eze: "Ezekiel",
  da: "Daniel",
  ho: "Hosea",
  jol: "Joel",
  am: "Amos",
  ob: "Obadiah",
  jnh: "Jonah",
  mi: "Micah",
  na: "Nahum",
  hab: "Habakkuk",
  zep: "Zephaniah",
  hag: "Haggai",
  zec: "Zechariah",
  mal: "Malachi",
  mt: "Matthew",
  mk: "Mark",
  lk: "Luke",
  jn: "John",
  ac: "Acts",
  ro: "Romans",
  "1co": "1 Corinthians",
  "2co": "2 Corinthians",
  ga: "Galatians",
  eph: "Ephesians",
  php: "Philippians",
  col: "Colossians",
  "1th": "1 Thessalonians",
  "2th": "2 Thessalonians",
  "1ti": "1 Timothy",
  "2ti": "2 Timothy",
  tit: "Titus",
  phm: "Philemon",
  heb: "Hebrews",
  jas: "James",
  "1pe": "1 Peter",
  "2pe": "2 Peter",
  "1jn": "1 John",
  "2jn": "2 John",
  "3jn": "3 John",
  jud: "Jude",
  re: "Revelation",
};

/**
 * Comprehensive cross-reference dataset from OpenBible.info (TSK + community votes)
 * ~343,000 cross-references covering 29,335 unique source verses
 *
 * Format: "book chapter:verse" -> [{ book, chapter, verse }, ...]
 * Example: "gn 1:1" -> [{ book: "ps", chapter: 96, verse: 5 }, ...]
 *
 * Data source: https://www.openbible.info/labs/cross-references/
 * Licensed under Creative Commons Attribution License
 */

let crossRefData: Record<string, VerseRef[]> | null = null;

// Create reverse mapping: full name -> OpenBible abbreviation
const NAME_TO_OPENBIBLE_ABBREV: Record<string, string> = Object.entries(
  OPENBIBLE_BOOK_NAMES,
).reduce(
  (acc, [abbrev, name]) => {
    acc[name.toLowerCase()] = abbrev;
    return acc;
  },
  {} as Record<string, string>,
);

/**
 * Convert full book name to abbreviation used in OpenBible cross-reference data
 */
function getBookAbbrev(bookName: string): string | null {
  const normalized = bookName.toLowerCase().trim();
  return NAME_TO_OPENBIBLE_ABBREV[normalized] || null;
}

/**
 * Load cross-reference data lazily
 */
async function loadCrossRefData(): Promise<Record<string, VerseRef[]>> {
  if (crossRefData) {
    return crossRefData;
  }

  const dataPath = path.join(
    process.cwd(),
    "src",
    "bible",
    "crossReferencesData.json",
  );

  try {
    const rawData = await fs.readFile(dataPath, "utf-8");
    crossRefData = JSON.parse(rawData);
    console.log(
      `[Cross-References] Loaded ${Object.keys(crossRefData!).length} source verses with cross-references`,
    );
    return crossRefData!;
  } catch (error) {
    console.error("[Cross-References] Failed to load data:", error);
    return {};
  }
}

/**
 * Get cross-references for a verse
 */
export async function getCrossReferences(ref: VerseRef): Promise<VerseRef[]> {
  const data = await loadCrossRefData();

  // Convert full book name to abbreviation
  const bookAbbrev = getBookAbbrev(ref.book);
  if (!bookAbbrev) {
    console.warn(`[Cross-References] Unknown book name: "${ref.book}"`);
    return [];
  }

  // Create lookup key using abbreviation
  const key = `${bookAbbrev} ${ref.chapter}:${ref.verse}`;
  const refs = data[key] || [];

  // Convert OpenBible abbreviations in results back to full names
  return refs.map((crossRef) => ({
    book: OPENBIBLE_BOOK_NAMES[crossRef.book] || crossRef.book,
    chapter: crossRef.chapter,
    verse: crossRef.verse,
  }));
}
