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
      skippedBooks++;
      continue;
    }

    const bookData = data[bookAbbrev];
    if (!bookData) {
      console.log(`   ❌ No data found in file`);
      skippedBooks++;
      continue;
    }

    // Fetch all verses for this book at once (much faster than individual queries)
    const { data: bookVerses, error: bookVersesError } = await supabase
      .from("verses")
      .select("id, chapter, verse")
      .eq("book_abbrev", bookAbbrev.toLowerCase());

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

        // Get verse_id from map
        const verseId = verseIdMap.get(`${chapterNum}:${verseNum}`);
        if (!verseId) {
          console.log(
            `   ⚠️  Verse not found: ${bookAbbrev} ${chapterNum}:${verseNum}`,
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
    }

    // Insert Strong's entries in batches
    const BATCH_SIZE = 1000;
    for (let i = 0; i < strongsEntries.length; i += BATCH_SIZE) {
      const batch = strongsEntries.slice(i, i + BATCH_SIZE);

      const { error } = await supabase.from("verse_strongs").insert(batch);

      if (error) {
        console.error(`   ❌ Error inserting batch: ${error.message}`);
      } else {
        insertedEntries += batch.length;
      }
    }

    console.log(
      `   ✅ Inserted ${strongsEntries.length.toLocaleString()} Strong's entries`,
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
    .eq("book_abbrev", "gen")
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
