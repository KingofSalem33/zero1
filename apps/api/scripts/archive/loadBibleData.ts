/**
 * Load full KJV Bible from JSON files into database
 *
 * Reads all Bible books from public/bible/strongs/*.json
 * and inserts verses into the verses table.
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

// Strip Strong's numbers from verse text
function stripStrongsNumbers(text: string): string {
  return text.replace(/\[([HG]\d+)\]/g, "").replace(/<\/?em>/g, "");
}

async function loadBibleData() {
  console.log("=".repeat(60));
  console.log("Loading Full KJV Bible into Database");
  console.log("=".repeat(60));
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

  let totalVerses = 0;
  let insertedVerses = 0;
  let skippedVerses = 0;

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
      skippedVerses++;
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
        const text = stripStrongsNumbers(verseData.en);

        verses.push({
          book_abbrev: bookAbbrev.toLowerCase(),
          book_name: bookName,
          chapter: chapterNum,
          verse: verseNum,
          text: text,
        });

        totalVerses++;
      }
    }

    // Insert verses in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < verses.length; i += BATCH_SIZE) {
      const batch = verses.slice(i, i + BATCH_SIZE);

      const { error } = await supabase.from("verses").upsert(batch, {
        onConflict: "book_abbrev,chapter,verse",
        ignoreDuplicates: false,
      });

      if (error) {
        console.error(`   ❌ Error inserting batch: ${error.message}`);
        skippedVerses += batch.length;
      } else {
        insertedVerses += batch.length;
      }
    }

    console.log(`   ✅ Inserted ${verses.length} verses`);
  }

  console.log();
  console.log("=".repeat(60));
  console.log("✅ Bible Data Load Complete!");
  console.log("=".repeat(60));
  console.log(`   Total verses processed: ${totalVerses.toLocaleString()}`);
  console.log(`   Successfully inserted: ${insertedVerses.toLocaleString()}`);
  console.log(`   Skipped (errors): ${skippedVerses.toLocaleString()}`);
  console.log();
  console.log("🚀 Next step: Run generateEmbeddings.bat to create embeddings");
  console.log();

  process.exit(0);
}

loadBibleData().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
