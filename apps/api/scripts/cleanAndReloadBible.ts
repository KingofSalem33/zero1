/**
 * Clean up duplicate Bible data and reload from Strong's JSON files
 *
 * This script:
 * 1. Backs up current verse count
 * 2. Deletes all verses and Strong's data
 * 3. Re-loads from public/bible/strongs/*.json
 * 4. Re-populates verse_strongs table
 */

import { config } from "dotenv";
config();

import { supabase } from "../src/db";
import * as fs from "fs";
import * as path from "path";

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

interface StrongsEntry {
  verse_id: number;
  strongs_number: string;
  position: number;
}

function stripStrongsNumbers(text: string): string {
  return text.replace(/\[([HG]\d+)\]/g, "").replace(/<\/?em>/g, "");
}

function extractStrongsNumbers(
  text: string,
): Array<{ strongsNumber: string; position: number }> {
  const results: Array<{ strongsNumber: string; position: number }> = [];
  const regex = /\[([HG]\d+)\]/g;

  let position = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    results.push({
      strongsNumber: match[1],
      position: position,
    });
    position++;
  }

  return results;
}

async function cleanAndReload() {
  console.log("=".repeat(70));
  console.log("Clean & Reload Bible Database with Strong's Numbers");
  console.log("=".repeat(70));
  console.log();

  // Step 1: Backup current counts
  console.log("📊 Current database state:");
  const { count: verseCount } = await supabase
    .from("verses")
    .select("*", { count: "exact", head: true });
  const { count: strongsCount } = await supabase
    .from("verse_strongs")
    .select("*", { count: "exact", head: true });

  console.log(`   Verses: ${verseCount?.toLocaleString() ?? "Unknown"}`);
  console.log(
    `   Strong's entries: ${strongsCount?.toLocaleString() ?? "Unknown"}`,
  );
  console.log();

  // Step 2: Clear all data
  console.log("🗑️  Clearing database...");

  console.log("   Deleting verse_strongs...");
  const { error: deleteStrongsError } = await supabase
    .from("verse_strongs")
    .delete()
    .neq("id", 0);

  if (deleteStrongsError) {
    console.error(`   ❌ Error: ${deleteStrongsError.message}`);
  } else {
    console.log("   ✅ verse_strongs cleared");
  }

  console.log("   Deleting verses...");
  const { error: deleteVersesError } = await supabase
    .from("verses")
    .delete()
    .neq("id", 0);

  if (deleteVersesError) {
    console.error(`   ❌ Error: ${deleteVersesError.message}`);
  } else {
    console.log("   ✅ verses cleared");
  }
  console.log();

  // Step 3: Load Bible data from Strong's JSON files
  const bibleDataPath = path.join(
    process.cwd(),
    "..",
    "..",
    "public",
    "bible",
    "strongs",
  );

  const files = fs
    .readdirSync(bibleDataPath)
    .filter((f) => f.endsWith(".json"))
    .sort(); // Sort to process in order

  console.log(`📚 Found ${files.length} Bible books to load`);
  console.log();

  let totalVerses = 0;
  let totalStrongsEntries = 0;
  const verseIdCache = new Map<string, number>(); // Cache: "book:chapter:verse" -> id

  for (const file of files) {
    const bookAbbrev = file.replace(".json", "");
    const bookName = BOOK_NAMES[bookAbbrev];

    if (!bookName) {
      console.log(`⚠️  Skipping unknown book: ${bookAbbrev}`);
      continue;
    }

    console.log(`📖 Processing ${bookName} (${bookAbbrev})...`);

    const filePath = path.join(bibleDataPath, file);

    let data;
    try {
      const fileContent = fs.readFileSync(filePath, "utf-8");
      data = JSON.parse(fileContent);
    } catch (error) {
      console.log(
        `   ❌ Failed to parse JSON: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      continue;
    }

    const bookData = data[bookAbbrev];
    if (!bookData) {
      console.log(`   ❌ No data found in file`);
      continue;
    }

    const verses: Array<{
      book_abbrev: string;
      book_name: string;
      chapter: number;
      verse: number;
      text: string;
    }> = [];

    const strongsEntries: StrongsEntry[] = [];

    // Parse all verses
    for (const chapterKey of Object.keys(bookData)) {
      const chapter = bookData[chapterKey];

      for (const verseKey of Object.keys(chapter)) {
        const verseData = chapter[verseKey];

        // Parse verse reference (e.g., "Gen|1|1")
        const parts = verseKey.split("|");
        if (parts.length !== 3) continue;

        const chapterNum = parseInt(parts[1]);
        const verseNum = parseInt(parts[2]);
        const textWithStrongs = verseData.en;
        const cleanText = stripStrongsNumbers(textWithStrongs);

        verses.push({
          book_abbrev: bookAbbrev.toLowerCase(),
          book_name: bookName,
          chapter: chapterNum,
          verse: verseNum,
          text: cleanText,
        });

        totalVerses++;
      }
    }

    // Insert verses in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < verses.length; i += BATCH_SIZE) {
      const batch = verses.slice(i, i + BATCH_SIZE);

      const { data: insertedData, error } = await supabase
        .from("verses")
        .insert(batch)
        .select("id, chapter, verse");

      if (error) {
        console.error(`   ❌ Error inserting verses: ${error.message}`);
      } else if (insertedData) {
        // Cache verse IDs for Strong's number insertion
        for (const v of insertedData) {
          const key = `${bookAbbrev}:${v.chapter}:${v.verse}`;
          verseIdCache.set(key, v.id);
        }
      }
    }

    console.log(`   ✅ Inserted ${verses.length} verses`);

    // Now insert Strong's numbers for this book
    for (const chapterKey of Object.keys(bookData)) {
      const chapter = bookData[chapterKey];

      for (const verseKey of Object.keys(chapter)) {
        const verseData = chapter[verseKey];

        const parts = verseKey.split("|");
        if (parts.length !== 3) continue;

        const chapterNum = parseInt(parts[1]);
        const verseNum = parseInt(parts[2]);
        const textWithStrongs = verseData.en;

        // Get verse ID from cache
        const cacheKey = `${bookAbbrev}:${chapterNum}:${verseNum}`;
        const verseId = verseIdCache.get(cacheKey);

        if (!verseId) continue;

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
    }

    // Insert Strong's entries in batches
    for (let i = 0; i < strongsEntries.length; i += BATCH_SIZE) {
      const batch = strongsEntries.slice(i, i + BATCH_SIZE);

      const { error } = await supabase.from("verse_strongs").insert(batch);

      if (error) {
        console.error(`   ❌ Error inserting Strong's: ${error.message}`);
      }
    }

    console.log(
      `   ✅ Inserted ${strongsEntries.length.toLocaleString()} Strong's entries`,
    );
    console.log();
  }

  console.log();
  console.log("=".repeat(70));
  console.log("✅ Database Reload Complete!");
  console.log("=".repeat(70));
  console.log(`   Total verses loaded: ${totalVerses.toLocaleString()}`);
  console.log(
    `   Total Strong's entries: ${totalStrongsEntries.toLocaleString()}`,
  );
  console.log();

  // Verify final state
  const { count: finalVerseCount } = await supabase
    .from("verses")
    .select("*", { count: "exact", head: true });
  const { count: finalStrongsCount } = await supabase
    .from("verse_strongs")
    .select("*", { count: "exact", head: true });

  console.log("📊 Final database state:");
  console.log(`   Verses: ${finalVerseCount?.toLocaleString() ?? "Unknown"}`);
  console.log(
    `   Strong's entries: ${finalStrongsCount?.toLocaleString() ?? "Unknown"}`,
  );
  console.log();

  console.log("🎉 Your database now has clean, complete Bible data!");
  console.log();

  process.exit(0);
}

cleanAndReload().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
