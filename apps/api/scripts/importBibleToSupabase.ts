/**
 * Import KJV Bible and Cross-References into Supabase
 *
 * This script:
 * 1. Loads KJV text from kjv.json
 * 2. Loads cross-references from crossReferencesData.json
 * 3. Inserts verses into Supabase (with sequential IDs)
 * 4. Inserts cross-references as graph edges
 *
 * Run with: npx ts-node scripts/importBibleToSupabase.ts
 */

// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import fs from "fs/promises";
import path from "path";
import { supabase } from "../src/db";
import { BOOK_NAMES } from "../src/bible/bookNames";

interface Book {
  abbrev: string;
  name?: string;
  chapters: string[][];
}

interface VerseRef {
  book: string;
  chapter: number;
  verse: number;
}

interface VerseRow {
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

async function main() {
  console.log("=".repeat(60));
  console.log("BIBLE IMPORT TO SUPABASE");
  console.log("=".repeat(60));

  // ========================================
  // STEP 1: Load KJV Data
  // ========================================
  console.log("\n[1/5] Loading KJV data...");
  const kjvPath = path.join(process.cwd(), "data", "kjv.json");
  const kjvRaw = await fs.readFile(kjvPath, "utf-8");
  const kjvBooks = JSON.parse(kjvRaw) as Book[];
  console.log(`✓ Loaded ${kjvBooks.length} books`);

  // ========================================
  // STEP 2: Build Verse Rows
  // ========================================
  console.log("\n[2/5] Building verse rows...");
  const verseRows: VerseRow[] = [];
  const verseIdMap = new Map<string, number>(); // "book ch:v" -> sequential ID

  let sequentialId = 1;
  for (const book of kjvBooks) {
    const bookName = BOOK_NAMES[book.abbrev] || book.abbrev.toUpperCase();

    for (let chapterIdx = 0; chapterIdx < book.chapters.length; chapterIdx++) {
      const chapter = book.chapters[chapterIdx];
      const chapterNum = chapterIdx + 1;

      for (let verseIdx = 0; verseIdx < chapter.length; verseIdx++) {
        const verseNum = verseIdx + 1;
        const text = chapter[verseIdx];

        verseRows.push({
          book_abbrev: book.abbrev.toLowerCase(),
          book_name: bookName,
          chapter: chapterNum,
          verse: verseNum,
          text,
        });

        // Store mapping for cross-reference resolution
        const key = `${book.abbrev.toLowerCase()} ${chapterNum}:${verseNum}`;
        verseIdMap.set(key, sequentialId);
        sequentialId++;
      }
    }
  }

  console.log(`✓ Built ${verseRows.length} verse rows`);
  console.log(`  Total verses: ${verseRows.length}`);
  console.log(`  Expected ~31,102 verses (KJV)`);

  // ========================================
  // STEP 3: Insert Verses into Supabase
  // ========================================
  console.log("\n[3/5] Inserting verses into Supabase...");
  console.log("  (This may take 1-2 minutes for 31k rows)");

  // Clear existing data
  console.log("  Clearing existing verses...");
  // Delete in batches since Supabase has row limits on deletes
  let deletedCount = 0;
  while (true) {
    const { data: toDelete } = await supabase
      .from("verses")
      .select("id")
      .limit(1000);

    if (!toDelete || toDelete.length === 0) break;

    const { error: deleteError } = await supabase
      .from("verses")
      .delete()
      .in("id", toDelete.map(v => v.id));

    if (deleteError) {
      console.error("  Warning: Failed to delete batch:", deleteError);
      break;
    }

    deletedCount += toDelete.length;
    if (deletedCount % 10000 === 0) {
      console.log(`  Deleted ${deletedCount} verses so far...`);
    }
  }
  console.log(`  ✓ Cleared ${deletedCount} existing verses`);

  // Insert in batches of 1000
  const BATCH_SIZE = 1000;
  for (let i = 0; i < verseRows.length; i += BATCH_SIZE) {
    const batch = verseRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("verses").insert(batch);

    if (error) {
      console.error(`✗ Failed at batch ${i / BATCH_SIZE + 1}:`, error);
      throw error;
    }

    if ((i / BATCH_SIZE + 1) % 10 === 0) {
      console.log(`  Progress: ${i + batch.length}/${verseRows.length} verses`);
    }
  }

  console.log(`✓ Inserted all ${verseRows.length} verses`);

  // ========================================
  // STEP 4: Load Cross-References
  // ========================================
  console.log("\n[4/5] Loading cross-reference data...");
  const xrefPath = path.join(
    process.cwd(),
    "src",
    "bible",
    "crossReferencesData.json"
  );
  const xrefRaw = await fs.readFile(xrefPath, "utf-8");
  const xrefData = JSON.parse(xrefRaw) as Record<string, VerseRef[]>;

  const xrefCount = Object.keys(xrefData).length;
  console.log(`✓ Loaded cross-references for ${xrefCount} source verses`);

  // ========================================
  // STEP 5: Build Cross-Reference Edges
  // ========================================
  console.log("\n[5/5] Building cross-reference edges...");

  // Fetch verse ID mapping from database
  console.log("  Fetching verse IDs from database...");

  // Fetch ALL verses (Supabase default limit is 1000, so we need to paginate)
  let dbVerses: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("verses")
      .select("id, book_abbrev, chapter, verse")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("✗ Failed to fetch verses:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    dbVerses = dbVerses.concat(data);
    page++;

    if (page % 10 === 0) {
      console.log(`  Fetched ${dbVerses.length} verses so far...`);
    }
  }

  // Build ID lookup map
  const dbVerseIdMap = new Map<string, number>();
  for (const v of dbVerses!) {
    const key = `${v.book_abbrev} ${v.chapter}:${v.verse}`;
    dbVerseIdMap.set(key, v.id);
  }
  console.log(`✓ Built ID map for ${dbVerseIdMap.size} verses`);

  // Build edge rows
  interface EdgeRow {
    from_verse_id: number;
    to_verse_id: number;
  }

  const edgeRows: EdgeRow[] = [];
  let skippedRefs = 0;

  for (const [sourceKey, targetRefs] of Object.entries(xrefData)) {
    const fromId = dbVerseIdMap.get(sourceKey);
    if (!fromId) {
      skippedRefs++;
      continue;
    }

    for (const targetRef of targetRefs) {
      const targetKey = `${targetRef.book} ${targetRef.chapter}:${targetRef.verse}`;
      const toId = dbVerseIdMap.get(targetKey);

      if (!toId) {
        skippedRefs++;
        continue;
      }

      edgeRows.push({
        from_verse_id: fromId,
        to_verse_id: toId,
      });
    }
  }

  console.log(`✓ Built ${edgeRows.length} cross-reference edges`);
  console.log(`  Skipped ${skippedRefs} invalid references`);

  // Insert edges in batches
  console.log("  Inserting edges into Supabase...");
  console.log("  (This may take 2-3 minutes for ~343k edges)");

  // Clear existing edges
  console.log("  Clearing existing cross-references...");
  let deletedXrefCount = 0;
  while (true) {
    const { data: toDelete } = await supabase
      .from("cross_references")
      .select("id")
      .limit(1000);

    if (!toDelete || toDelete.length === 0) break;

    const { error: deleteError } = await supabase
      .from("cross_references")
      .delete()
      .in("id", toDelete.map(x => x.id));

    if (deleteError) {
      console.error("  Warning: Failed to delete xref batch:", deleteError);
      break;
    }

    deletedXrefCount += toDelete.length;
    if (deletedXrefCount % 10000 === 0) {
      console.log(`  Deleted ${deletedXrefCount} cross-references so far...`);
    }
  }
  console.log(`  ✓ Cleared ${deletedXrefCount} existing cross-references`);

  for (let i = 0; i < edgeRows.length; i += BATCH_SIZE) {
    const batch = edgeRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("cross_references").insert(batch);

    if (error) {
      console.error(`✗ Failed at edge batch ${i / BATCH_SIZE + 1}:`, error);
      throw error;
    }

    if ((i / BATCH_SIZE + 1) % 50 === 0) {
      console.log(`  Progress: ${i + batch.length}/${edgeRows.length} edges`);
    }
  }

  console.log(`✓ Inserted all ${edgeRows.length} cross-reference edges`);

  // ========================================
  // SUMMARY
  // ========================================
  console.log("\n" + "=".repeat(60));
  console.log("IMPORT COMPLETE");
  console.log("=".repeat(60));
  console.log(`Verses inserted:          ${verseRows.length}`);
  console.log(`Cross-references inserted: ${edgeRows.length}`);
  console.log(`Skipped invalid refs:      ${skippedRefs}`);
  console.log("=".repeat(60));

  // Test query
  console.log("\n[TEST] Querying John 3:16...");
  const { data: testVerses, error: testError } = await supabase
    .from("verses")
    .select("*")
    .eq("book_abbrev", "jo")  // "jo" = John (Gospel), "jn" = Jonah
    .eq("chapter", 3)
    .eq("verse", 16);

  if (testError) {
    console.error("✗ Test query failed:", testError);
  } else if (!testVerses || testVerses.length === 0) {
    console.error("✗ John 3:16 not found in database");
  } else {
    console.log("✓ Found:", testVerses[0]);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("\n✗ IMPORT FAILED:", error);
  process.exit(1);
});
