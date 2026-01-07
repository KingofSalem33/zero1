/**
 * Populate verse_strongs table with Strong's number data
 *
 * Reads all Bible books from public/bible/strongs/*.json
 * and extracts Strong's numbers with their positions.
 */

// Load environment variables
import { config } from "dotenv";
config();

import { supabase } from "../src/db";
import * as fs from "fs";
import * as path from "path";
import { BOOK_NAMES as DB_BOOK_NAMES } from "../src/bible/bookNames";

// Mapping from file abbreviations to full book names
const BOOK_NAMES: Record<string, string> = {
  Gen: "Genesis",
  Exo: "Exodus",
  Lev: "Leviticus",
  Num: "Numbers",
  Deu: "Deuteronomy",
  Jos: "Joshua",
  Jdg: "Judges",
  Rth: "Ruth",
  "1Sa": "1 Samuel",
  "2Sa": "2 Samuel",
  "1Ki": "1 Kings",
  "2Ki": "2 Kings",
  "1Ch": "1 Chronicles",
  "2Ch": "2 Chronicles",
  Ezr: "Ezra",
  Neh: "Nehemiah",
  Est: "Esther",
  Job: "Job",
  Psa: "Psalms",
  Pro: "Proverbs",
  Ecc: "Ecclesiastes",
  Sng: "Song of Solomon",
  Isa: "Isaiah",
  Jer: "Jeremiah",
  Lam: "Lamentations",
  Eze: "Ezekiel",
  Dan: "Daniel",
  Hos: "Hosea",
  Joe: "Joel",
  Amo: "Amos",
  Oba: "Obadiah",
  Jon: "Jonah",
  Mic: "Micah",
  Nah: "Nahum",
  Hab: "Habakkuk",
  Zep: "Zephaniah",
  Hag: "Haggai",
  Zec: "Zechariah",
  Mal: "Malachi",
  Mat: "Matthew",
  Mar: "Mark",
  Luk: "Luke",
  Jhn: "John",
  Act: "Acts",
  Rom: "Romans",
  "1Co": "1 Corinthians",
  "2Co": "2 Corinthians",
  Gal: "Galatians",
  Eph: "Ephesians",
  Phl: "Philippians",
  Col: "Colossians",
  "1Th": "1 Thessalonians",
  "2Th": "2 Thessalonians",
  "1Ti": "1 Timothy",
  "2Ti": "2 Timothy",
  Tit: "Titus",
  Phm: "Philemon",
  Heb: "Hebrews",
  Jas: "James",
  "1Pe": "1 Peter",
  "2Pe": "2 Peter",
  "1Jo": "1 John",
  "2Jo": "2 John",
  "3Jo": "3 John",
  Jde: "Jude",
  Rev: "Revelation",
};

const DB_ABBREV_BY_NAME = Object.entries(DB_BOOK_NAMES).reduce(
  (acc, [abbrev, name]) => {
    acc[name] = abbrev;
    return acc;
  },
  {} as Record<string, string>,
);

interface StrongsEntry {
  verse_id: number;
  strongs_number: string;
  position: number;
}

type LooseVerse = {
  chapterNum: number;
  verseNum: number;
  textWithStrongs: string;
};

/**
 * Extract Strong's numbers from verse text
 * Returns array of {strongsNumber, position}
 * Example: "In the beginning[H7225] God[H430]" -> [{H7225, 0}, {H430, 1}]
 */
function extractStrongsNumbers(
  text: string,
): Array<{ strongsNumber: string; position: number }> {
  const results: Array<{ strongsNumber: string; position: number }> = [];
  const regex = /\[([HG]\d+)\]/g;

  let position = 0;
  let match;

  // Find all Strong's numbers
  while ((match = regex.exec(text)) !== null) {
    results.push({
      strongsNumber: match[1],
      position: position,
    });
    // Each Strong's number increments position
    // (even if multiple Strong's numbers appear consecutively)
    position++;
  }

  return results;
}

/**
 * Extract verse keys + English text from loosely formatted JSON.
 * This handles files with unescaped quotes in non-English fields.
 */
function extractLooseVerses(raw: string, bookAbbrev: string): LooseVerse[] {
  const verses: LooseVerse[] = [];
  const regex =
    /"([A-Za-z0-9]+\|\d+\|\d+)":\s*\{\s*"en"\s*:\s*"((?:\\.|[^"\\])*)"/g;

  let match;
  while ((match = regex.exec(raw)) !== null) {
    const verseKey = match[1];
    const textWithStrongs = match[2];
    const parts = verseKey.split("|");
    if (parts.length !== 3) continue;
    if (parts[0] !== bookAbbrev) continue;

    const chapterNum = parseInt(parts[1], 10);
    const verseNum = parseInt(parts[2], 10);
    if (!Number.isFinite(chapterNum) || !Number.isFinite(verseNum)) continue;

    verses.push({
      chapterNum,
      verseNum,
      textWithStrongs,
    });
  }

  return verses;
}

async function populateStrongsNumbers() {
  console.log("=".repeat(60));
  console.log("Populating verse_strongs Table");
  console.log("=".repeat(60));
  console.log();

  // First, clear existing data
  console.log("🗑️  Clearing existing verse_strongs data...");
  const { error: deleteError } = await supabase
    .from("verse_strongs")
    .delete()
    .neq("id", 0); // Delete all rows

  if (deleteError) {
    console.error(`   ❌ Error clearing table: ${deleteError.message}`);
  } else {
    console.log("   ✅ Table cleared");
  }
  console.log();

  const bibleDataPath = path.join(
    process.cwd(),
    "..",
    "..",
    "public",
    "bible",
    "strongs",
  );

  // Get all JSON files
  const files = fs
    .readdirSync(bibleDataPath)
    .filter((f) => f.endsWith(".json"));

  console.log(`📚 Found ${files.length} Bible books`);
  console.log();

  let totalStrongsEntries = 0;
  let insertedEntries = 0;
  let skippedBooks = 0;

  for (const file of files) {
    const bookAbbrev = file.replace(".json", "");
    const bookName = BOOK_NAMES[bookAbbrev];

    if (!bookName) {
      console.log(`⚠️  Skipping unknown book: ${bookAbbrev}`);
      skippedBooks++;
      continue;
    }

    const dbBookAbbrev =
      DB_ABBREV_BY_NAME[bookName] ?? bookAbbrev.toLowerCase();

    console.log(`📖 Processing ${bookName} (${bookAbbrev})...`);

    const filePath = path.join(bibleDataPath, file);

    let data: Record<string, unknown> | null = null;
    let looseVerses: LooseVerse[] | null = null;
    let fileContent = "";
    try {
      fileContent = fs.readFileSync(filePath, "utf-8");
      data = JSON.parse(fileContent) as Record<string, unknown>;
    } catch (error) {
      console.log(
        `   WARN: Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      looseVerses = extractLooseVerses(fileContent, bookAbbrev);
    }

    let bookData: Record<string, unknown> | null = null;
    if (data) {
      const keys = Object.keys(data);
      const singleKey = keys.length === 1 ? keys[0] : null;
      const candidate =
        data[bookAbbrev] ??
        data[bookName] ??
        (singleKey ? data[singleKey] : null);
      if (candidate && typeof candidate === "object") {
        bookData = candidate as Record<string, unknown>;
      }

      if (!bookData) {
        looseVerses = extractLooseVerses(fileContent, bookAbbrev);
      }
    }

    // Fetch all verses for this book at once (much faster than individual queries)
    const { data: bookVerses, error: bookVersesError } = await supabase
      .from("verses")
      .select("id, chapter, verse")
      .eq("book_abbrev", dbBookAbbrev);

    if (bookVersesError || !bookVerses) {
      console.log(`   ❌ Failed to fetch verses: ${bookVersesError?.message}`);
      skippedBooks++;
      continue;
    }

    // Create lookup map: "chapter:verse" -> verse_id
    const verseIdMap = new Map<string, number>();
    for (const v of bookVerses) {
      verseIdMap.set(`${v.chapter}:${v.verse}`, v.id);
    }

    const strongsEntries: StrongsEntry[] = [];

    const verseTexts: LooseVerse[] = [];

    if (bookData) {
      // Parse all verses from JSON structure
      for (const chapterKey of Object.keys(bookData)) {
        const chapter = (bookData as Record<string, any>)[chapterKey];

        for (const verseKey of Object.keys(chapter)) {
          const verseData = chapter[verseKey];

          // Parse verse reference (e.g., "Gen|1|1")
          const parts = verseKey.split("|");
          if (parts.length !== 3) continue;

          const chapterNum = parseInt(parts[1], 10);
          const verseNum = parseInt(parts[2], 10);
          const textWithStrongs = verseData.en as string;
          if (!textWithStrongs) continue;

          verseTexts.push({ chapterNum, verseNum, textWithStrongs });
        }
      }
    } else if (looseVerses && looseVerses.length > 0) {
      verseTexts.push(...looseVerses);
      console.log(
        `   WARN: using loose parser for ${looseVerses.length.toLocaleString()} verses`,
      );
    } else {
      console.log(`   WARN: no verse data found in file`);
      skippedBooks++;
      continue;
    }

    for (const verse of verseTexts) {
      const { chapterNum, verseNum, textWithStrongs } = verse;

      // Get verse_id from map
      const verseId = verseIdMap.get(`${chapterNum}:${verseNum}`);
      if (!verseId) {
        console.log(
          `   WARN: verse not found: ${bookAbbrev} ${chapterNum}:${verseNum}`,
        );
        continue;
      }

      // Extract Strong's numbers
      const strongsNumbers = extractStrongsNumbers(textWithStrongs);

      for (const { strongsNumber, position } of strongsNumbers) {
        strongsEntries.push({
          verse_id: verseId,
          strongs_number: strongsNumber,
          position: position,
        });
        totalStrongsEntries++;
      }
    }
    const seenEntries = new Set<string>();
    const uniqueEntries: StrongsEntry[] = [];
    for (const entry of strongsEntries) {
      const key = `${entry.verse_id}|${entry.strongs_number}|${entry.position}`;
      if (seenEntries.has(key)) continue;
      seenEntries.add(key);
      uniqueEntries.push(entry);
    }

    if (uniqueEntries.length !== strongsEntries.length) {
      console.log(
        `   WARN: deduped ${strongsEntries.length - uniqueEntries.length} Strong's entries`,
      );
    }

    // Insert Strong's entries in batches
    const BATCH_SIZE = 1000;
    for (let i = 0; i < uniqueEntries.length; i += BATCH_SIZE) {
      const batch = uniqueEntries.slice(i, i + BATCH_SIZE);

      const { error } = await supabase.from("verse_strongs").insert(batch);

      if (error) {
        console.error(`   ❌ Error inserting batch: ${error.message}`);
      } else {
        insertedEntries += batch.length;
      }
    }

    console.log(
      `   ✅ Inserted ${uniqueEntries.length.toLocaleString()} Strong's entries`,
    );
  }

  console.log();
  console.log("=".repeat(60));
  console.log("✅ Strong's Number Population Complete!");
  console.log("=".repeat(60));
  console.log(
    `   Total Strong's entries: ${totalStrongsEntries.toLocaleString()}`,
  );
  console.log(`   Successfully inserted: ${insertedEntries.toLocaleString()}`);
  console.log(`   Skipped books: ${skippedBooks}`);
  console.log();

  // Verify the data
  console.log("🔍 Verifying data...");
  const { count } = await supabase
    .from("verse_strongs")
    .select("*", { count: "exact", head: true });

  console.log(
    `   Total rows in verse_strongs: ${count?.toLocaleString() ?? "Unknown"}`,
  );
  console.log();

  // Show sample data
  console.log("📊 Sample data from Genesis 1:1:");
  const { data: sampleData } = await supabase
    .from("verses")
    .select(
      `
      id,
      book_name,
      chapter,
      verse,
      text,
      verse_strongs (
        strongs_number,
        position
      )
    `,
    )
    .eq("book_abbrev", "gn")
    .eq("chapter", 1)
    .eq("verse", 1)
    .single();

  if (sampleData) {
    console.log(
      `   ${sampleData.book_name} ${sampleData.chapter}:${sampleData.verse}`,
    );
    console.log(`   Text: ${sampleData.text}`);
    console.log(`   Strong's numbers:`);
    if (Array.isArray(sampleData.verse_strongs)) {
      interface VerseStrong {
        position: number;
        strongs_number: string;
      }
      (sampleData.verse_strongs as VerseStrong[])
        .sort((a, b) => a.position - b.position)
        .forEach((s) => {
          console.log(`      Position ${s.position}: ${s.strongs_number}`);
        });
    }
  }
  console.log();

  console.log(
    "🚀 Next step: Update edgeFetchers.ts to use lexical ROOTS edges",
  );
  console.log();

  process.exit(0);
}

populateStrongsNumbers().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
