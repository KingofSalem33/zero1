/**
 * Ingest pericope metadata into the database.
 *
 * Usage:
 *   npx tsx apps/api/scripts/ingestPericopes.ts
 */

import "dotenv/config";

import fs from "fs";
import path from "path";
import { supabase } from "../src/db";

type PericopeSource = "SIL_AI" | "SBL";

type PericopeInput = {
  title: string;
  subtitle?: string;
  reference: {
    start: { book: string; chapter: number; verse: number };
    end: { book: string; chapter: number; verse: number };
  };
  type?: string;
  themes?: string[];
  keyFigures?: string[];
};

type VerseRow = {
  id: number;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
};

const BOOK_NAME_MAP: Record<string, string> = {
  "Song of Songs": "Song of Solomon",
  Canticles: "Song of Solomon",
};

const OT_BOOKS = new Set([
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
]);

const normalizeBookName = (book: string) => {
  const trimmed = book.trim().replace(/\s+/g, " ");
  return BOOK_NAME_MAP[trimmed] ?? trimmed;
};

const fetchAllVerses = async (): Promise<VerseRow[]> => {
  const { count, error: countError } = await supabase
    .from("verses")
    .select("id", { count: "exact", head: true });

  if (countError || !count) {
    throw new Error("Failed to count verses");
  }

  const batchSize = 1000;
  const rows: VerseRow[] = [];

  for (let offset = 0; offset < count; offset += batchSize) {
    const { data, error } = await supabase
      .from("verses")
      .select("id, book_name, chapter, verse, text")
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error || !data) {
      throw new Error(
        `Failed to fetch verses batch ${offset}-${offset + batchSize - 1}`,
      );
    }

    rows.push(...(data as VerseRow[]));
  }

  return rows;
};

const buildVerseIndex = (verses: VerseRow[]) => {
  const verseIdByRef = new Map<string, number>();
  const verseIndexById = new Map<number, number>();
  const chapterVerses = new Map<string, Array<{ verse: number; id: number }>>();

  verses.forEach((row, index) => {
    const key = `${row.book_name}|${row.chapter}|${row.verse}`;
    if (!verseIdByRef.has(key)) {
      verseIdByRef.set(key, row.id);
    }
    verseIndexById.set(row.id, index);

    const chapterKey = `${row.book_name}|${row.chapter}`;
    const list = chapterVerses.get(chapterKey) ?? [];
    list.push({ verse: row.verse, id: row.id });
    chapterVerses.set(chapterKey, list);
  });

  for (const list of chapterVerses.values()) {
    list.sort((a, b) =>
      a.verse === b.verse ? a.id - b.id : a.verse - b.verse,
    );
  }

  return { verseIdByRef, verseIndexById, chapterVerses };
};

const getVerseId = (
  verseIdByRef: Map<string, number>,
  chapterVerses: Map<string, Array<{ verse: number; id: number }>>,
  book: string,
  chapter: number,
  verse: number,
): number | null => {
  const key = `${book}|${chapter}|${verse}`;
  const id = verseIdByRef.get(key);
  if (id) return id;

  const chapterKey = `${book}|${chapter}`;
  const list = chapterVerses.get(chapterKey);
  if (!list || list.length === 0) {
    console.error(`Verse not found: ${book} ${chapter}:${verse}`);
    return null;
  }

  const fallback =
    [...list].reverse().find((entry) => entry.verse <= verse) ?? list[0];
  console.warn(
    `Verse not found: ${book} ${chapter}:${verse} (using ${fallback.verse})`,
  );
  return fallback.id;
};

const getVerseRange = (
  verses: VerseRow[],
  verseIndexById: Map<number, number>,
  startId: number,
  endId: number,
): { ids: number[]; fullText: string } => {
  const startIndex = verseIndexById.get(startId);
  const endIndex = verseIndexById.get(endId);
  if (startIndex === undefined || endIndex === undefined) {
    throw new Error(`Failed to resolve verse range ${startId}-${endId}`);
  }

  const sliceStart = Math.min(startIndex, endIndex);
  const sliceEnd = Math.max(startIndex, endIndex);
  const range = verses.slice(sliceStart, sliceEnd + 1);
  const ids = range.map((row) => row.id);
  const fullText = range.map((row) => row.text).join(" ");
  return { ids, fullText };
};

const chunkArray = <T>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const fetchExistingKeys = async (
  source: PericopeSource,
): Promise<Set<string>> => {
  const keys = new Set<string>();
  const { count, error: countError } = await supabase
    .from("pericopes")
    .select("id", { count: "exact", head: true })
    .eq("source", source);

  if (countError || !count) {
    return keys;
  }

  const batchSize = 1000;
  for (let offset = 0; offset < count; offset += batchSize) {
    const { data, error } = await supabase
      .from("pericopes")
      .select("range_start_id, range_end_id")
      .eq("source", source)
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error || !data) break;
    for (const row of data as Array<{
      range_start_id: number;
      range_end_id: number;
    }>) {
      keys.add(`${row.range_start_id}:${row.range_end_id}`);
    }
  }

  return keys;
};

async function ingestPericopes(source: PericopeSource, dataPath: string) {
  const raw = fs.readFileSync(dataPath, "utf8");
  const pericopes = JSON.parse(raw) as PericopeInput[];
  const startIndex = Number.parseInt(
    process.argv.find((arg) => arg.startsWith("--start="))?.split("=")[1] ??
      "0",
    10,
  );
  const limit = Number.parseInt(
    process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ??
      "0",
    10,
  );
  const skipExisting = process.argv.includes("--skip-existing");

  const targetPericopes =
    limit > 0
      ? pericopes.slice(startIndex, startIndex + limit)
      : pericopes.slice(startIndex);
  const verses = await fetchAllVerses();
  const { verseIdByRef, verseIndexById, chapterVerses } =
    buildVerseIndex(verses);
  const existingKeys = skipExisting ? null : await fetchExistingKeys(source);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const pericope of targetPericopes) {
    const start = pericope.reference.start;
    const end = pericope.reference.end;
    const startBook = normalizeBookName(start.book);
    const endBook = normalizeBookName(end.book);

    const startId = getVerseId(
      verseIdByRef,
      chapterVerses,
      startBook,
      start.chapter,
      start.verse,
    );
    const endId = getVerseId(
      verseIdByRef,
      chapterVerses,
      endBook,
      end.chapter,
      end.verse,
    );

    if (!startId || !endId) {
      failed += 1;
      continue;
    }

    const { ids, fullText } = getVerseRange(
      verses,
      verseIndexById,
      startId,
      endId,
    );
    const testament = OT_BOOKS.has(startBook) ? "OT" : "NT";

    if (existingKeys) {
      const key = `${startId}:${endId}`;
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
    }

    const title =
      pericope.title && pericope.title.trim().length > 0
        ? pericope.title.trim()
        : "Untitled Section";
    const safeTitle = title.length > 250 ? `${title.slice(0, 247)}...` : title;
    const subtitle =
      pericope.subtitle && pericope.subtitle.trim().length > 0
        ? pericope.subtitle.trim()
        : null;
    const safeSubtitle =
      subtitle && subtitle.length > 250
        ? `${subtitle.slice(0, 247)}...`
        : subtitle;

    const { data: inserted, error: insertError } = await supabase
      .from("pericopes")
      .insert({
        title: safeTitle,
        subtitle: safeSubtitle,
        range_start_id: startId,
        range_end_id: endId,
        source,
        pericope_type: pericope.type || null,
        full_text: fullText,
        themes: pericope.themes || null,
        key_figures: pericope.keyFigures || null,
        testament,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error(`Insert failed: ${pericope.title}`);
      failed += 1;
      continue;
    }

    const pericopeId = inserted.id as number;
    const mappings = ids.map((verseId, index) => ({
      verse_id: verseId,
      pericope_id: pericopeId,
      source,
      position_in_pericope: index + 1,
    }));

    for (const batch of chunkArray(mappings, 500)) {
      const { error: mappingError } = await supabase
        .from("verse_pericope_map")
        .insert(batch);
      if (mappingError) {
        console.error(`Mapping error for pericope ${pericopeId}`);
        break;
      }
    }

    success += 1;
    if (success % 25 === 0) {
      console.log(`Inserted ${success} pericopes...`);
    }
  }

  console.log(
    `Ingestion complete: ${success} inserted, ${skipped} skipped, ${failed} failed`,
  );
}

const dataFile = path.join(
  __dirname,
  "..",
  "data",
  "pericopes",
  "silai_pericopes.json",
);

ingestPericopes("SIL_AI", dataFile).catch((error) => {
  console.error(error);
  process.exit(1);
});
