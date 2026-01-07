/**
 * Normalize book_name values to canonical names based on book_abbrev.
 *
 * This fixes casing issues (e.g., "JO", "RM") and legacy label mismatches.
 * Usage:
 *   npx ts-node scripts/normalizeBookNames.ts
 *   npx ts-node scripts/normalizeBookNames.ts --dry-run
 */

import { config } from "dotenv";
config();

import { supabase } from "../src/db";
import { BOOK_NAMES } from "../src/bible/bookNames";

const ALT_ABBREV_MAP: Record<string, string> = {
  // Common 3-letter aliases -> canonical DB abbrev
  gen: "gn",
  exo: "ex",
  lev: "lv",
  num: "nm",
  deu: "dt",
  jos: "js",
  jdg: "jud",
  rth: "rt",
  jhn: "jo",
  jon: "jn",
  psa: "ps",
  pro: "prv",
  ecc: "ec",
  eze: "ez",
  dan: "dn",
  amo: "am",
  hab: "hk",
  hag: "hg",
  zec: "zc",
  zep: "zp",
  mat: "mt",
  mar: "mk",
  luk: "lk",
  rom: "rm",
  col: "cl",
  gal: "gl",
  phl: "ph",
  heb: "hb",
  jas: "jm",
  jde: "jd",
  rev: "re",
  mic: "mi",
  nah: "na",
  neh: "ne",
  oba: "ob",
  hos: "ho",
  joe: "jl",
  tit: "tt",
};

type BookRow = {
  book_abbrev: string;
  book_name: string;
};

function resolveCanonicalName(
  bookAbbrev: string,
  currentName: string,
): string | null {
  const lowerAbbrev = bookAbbrev.toLowerCase();

  if (BOOK_NAMES[lowerAbbrev]) {
    return BOOK_NAMES[lowerAbbrev];
  }

  const aliasTarget = ALT_ABBREV_MAP[lowerAbbrev];
  if (aliasTarget && BOOK_NAMES[aliasTarget]) {
    return BOOK_NAMES[aliasTarget];
  }

  const normalizedName = currentName?.toLowerCase().trim();
  if (normalizedName) {
    const match = Object.values(BOOK_NAMES).find(
      (name) => name.toLowerCase() === normalizedName,
    );
    if (match) return match;
  }

  return null;
}

async function fetchDistinctBooks(): Promise<BookRow[]> {
  const allBooks = new Map<string, string>();
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("verses")
      .select("book_abbrev, book_name")
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) break;

    data.forEach((row) => {
      if (!allBooks.has(row.book_abbrev)) {
        allBooks.set(row.book_abbrev, row.book_name);
      }
    });

    offset += pageSize;
    if (data.length < pageSize) break;
  }

  return Array.from(allBooks.entries()).map(([book_abbrev, book_name]) => ({
    book_abbrev,
    book_name,
  }));
}

async function updateBookNameInBatches(
  bookAbbrev: string,
  canonicalName: string,
  batchSize: number,
  dryRun: boolean,
): Promise<number> {
  let updated = 0;
  const concurrency = 10;

  while (true) {
    const { data, error } = await supabase
      .from("verses")
      .select("id", { count: "exact" })
      .eq("book_abbrev", bookAbbrev)
      .neq("book_name", canonicalName)
      .range(0, batchSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      break;
    }

    const ids = data.map((row) => row.id);

    if (dryRun) {
      updated += ids.length;
      break;
    }

    for (let i = 0; i < ids.length; i += concurrency) {
      const slice = ids.slice(i, i + concurrency);
      const results = await Promise.all(
        slice.map((id) =>
          supabase
            .from("verses")
            .update({ book_name: canonicalName })
            .eq("id", id),
        ),
      );

      for (const result of results) {
        if (result.error) {
          throw new Error(result.error.message);
        }
      }

      updated += slice.length;
    }
  }

  return updated;
}

async function normalizeBookNames() {
  const dryRun = process.argv.includes("--dry-run");
  const batchSize = 500;

  console.log("Normalizing book_name values...");
  if (dryRun) {
    console.log("Dry run mode: no updates will be applied.");
  }

  const distinctBooks = await fetchDistinctBooks();
  const sorted = distinctBooks.sort((a, b) =>
    a.book_abbrev.localeCompare(b.book_abbrev),
  );

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalUnknown = 0;

  for (const book of sorted) {
    const canonicalName = resolveCanonicalName(
      book.book_abbrev,
      book.book_name,
    );

    if (!canonicalName) {
      console.log(
        `WARN: No canonical name found for ${book.book_abbrev} (${book.book_name})`,
      );
      totalUnknown += 1;
      continue;
    }

    try {
      const updated = await updateBookNameInBatches(
        book.book_abbrev,
        canonicalName,
        batchSize,
        dryRun,
      );

      if (updated === 0) {
        totalSkipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(
          `Would update ${book.book_abbrev} (${book.book_name}) -> ${canonicalName} for ${updated} rows`,
        );
        continue;
      }

      console.log(
        `Updated ${book.book_abbrev} (${book.book_name}) -> ${canonicalName} (${updated} rows)`,
      );
      totalUpdated += updated;
    } catch (error) {
      console.log(
        `ERROR: Failed to update ${book.book_abbrev}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  console.log("Normalization complete.");
  console.log(`Rows updated: ${totalUpdated}`);
  console.log(`Abbrevs already normalized: ${totalSkipped}`);
  console.log(`Unknown abbrevs: ${totalUnknown}`);
}

normalizeBookNames().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
