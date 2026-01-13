/**
 * Build a pericope index from a CSV dataset.
 *
 * Usage:
 *   npx tsx apps/api/scripts/buildPericopeIndexFromCsv.ts --csv .tmp/pericopes.csv --output apps/api/data/pericopes/silai_pericopes.json
 */

import fs from "fs";
import path from "path";

type VerseRef = {
  book: string;
  chapter: number;
  verse: number;
};

type PericopeEntry = {
  title: string;
  subtitle?: string;
  reference: {
    start: VerseRef;
    end: VerseRef;
  };
  type?: string;
  themes?: string[];
  keyFigures?: string[];
};

const BOOK_CODE_MAP: Record<string, string> = {
  GEN: "Genesis",
  EXO: "Exodus",
  LEV: "Leviticus",
  NUM: "Numbers",
  DEU: "Deuteronomy",
  JOS: "Joshua",
  JDG: "Judges",
  RUT: "Ruth",
  "1SA": "1 Samuel",
  "2SA": "2 Samuel",
  "1KI": "1 Kings",
  "2KI": "2 Kings",
  "1CH": "1 Chronicles",
  "2CH": "2 Chronicles",
  EZR: "Ezra",
  NEH: "Nehemiah",
  EST: "Esther",
  JOB: "Job",
  PSA: "Psalms",
  PRO: "Proverbs",
  ECC: "Ecclesiastes",
  SNG: "Song of Solomon",
  ISA: "Isaiah",
  JER: "Jeremiah",
  LAM: "Lamentations",
  EZK: "Ezekiel",
  DAN: "Daniel",
  HOS: "Hosea",
  JOL: "Joel",
  AMO: "Amos",
  OBA: "Obadiah",
  JON: "Jonah",
  MIC: "Micah",
  NAM: "Nahum",
  HAB: "Habakkuk",
  ZEP: "Zephaniah",
  HAG: "Haggai",
  ZEC: "Zechariah",
  MAL: "Malachi",
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation",
};

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
};

const getArgValue = (flag: string): string | null => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
};

const csvPath = getArgValue("--csv") || ".tmp/pericopes.csv";
const outputFile =
  getArgValue("--output") || "apps/api/data/pericopes/silai_pericopes.json";

if (!fs.existsSync(csvPath)) {
  console.error(`CSV file not found: ${csvPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, "utf8");
const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
const header = parseCsvLine(lines[0]);

const pericopes: PericopeEntry[] = [];

for (const line of lines.slice(1)) {
  const values = parseCsvLine(line);
  const row: Record<string, string> = {};
  header.forEach((key, index) => {
    row[key] = values[index] ?? "";
  });

  const bookCode = row["Book"];
  const bookName = BOOK_CODE_MAP[bookCode] || bookCode;
  const chapter = Number.parseInt(row["Chapter"], 10);
  const startVerse = Number.parseInt(row["Start Verse"], 10);
  const endVerse = Number.parseInt(row["End Verse"], 10);
  const summary = row["Summary"]?.trim() || "Untitled Section";
  const title = summary.replace(/[;.\s]+$/, "").trim();

  if (!bookName || !chapter || !startVerse || !endVerse) continue;

  pericopes.push({
    title,
    reference: {
      start: {
        book: bookName,
        chapter,
        verse: startVerse,
      },
      end: {
        book: bookName,
        chapter,
        verse: endVerse,
      },
    },
  });
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, JSON.stringify(pericopes, null, 2));

console.log(`Wrote ${pericopes.length} pericopes to ${outputFile}`);
