/**
 * Populate canonical edge tables: citations, prophecies, genealogies.
 *
 * Expected data files (JSON arrays) in apps/api/data/canonical:
 * - citations.json
 * - prophecies.json
 * - genealogies.json
 */

import { config } from "dotenv";
config();

import { supabase } from "../src/db";
import { parseExplicitReference } from "../src/bible/referenceParser";
import { BOOK_NAMES } from "../src/bible/bookNames";
import * as fs from "fs";
import * as path from "path";

type ReferenceInput =
  | string
  | {
      book: string;
      chapter: number;
      verse: number;
      endVerse?: number;
    };

type CitationInput = {
  ot?: ReferenceInput;
  nt?: ReferenceInput;
  ot_verse?: ReferenceInput;
  nt_verse?: ReferenceInput;
  quote_type?: string;
  quoteType?: string;
};

type ProphecyInput = {
  prophecy?: ReferenceInput;
  fulfillment?: ReferenceInput;
  prophecy_verse?: ReferenceInput;
  fulfillment_verse?: ReferenceInput;
  prophecy_type?: string;
  prophecyType?: string;
};

type GenealogyInput = {
  ancestor?: ReferenceInput;
  descendant?: ReferenceInput;
  ancestor_verse?: ReferenceInput;
  descendant_verse?: ReferenceInput;
  relationship?: string;
};

const DATA_DIR = path.join(process.cwd(), "data", "canonical");
const CITATIONS_PATH = path.join(DATA_DIR, "citations.json");
const PROPHECIES_PATH = path.join(DATA_DIR, "prophecies.json");
const GENEALOGIES_PATH = path.join(DATA_DIR, "genealogies.json");
const BATCH_SIZE = 1000;

const hasFlag = (flag: string) => process.argv.includes(flag);
const getNumberFlag = (name: string): number | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  const value = Number.parseInt(arg.slice(prefix.length), 10);
  return Number.isFinite(value) ? value : undefined;
};

const shouldReset = hasFlag("--reset");
const dryRun = hasFlag("--dry-run");
const limit = getNumberFlag("limit");

const normalizeReferenceText = (input: string): string =>
  input
    .replace(/\./g, "")
    .replace(/\bPsalm\b/gi, "Psalms")
    .replace(/^\s*III\s+/i, "3 ")
    .replace(/^\s*II\s+/i, "2 ")
    .replace(/^\s*I\s+/i, "1 ")
    .replace(/\s+/g, " ")
    .trim();

const toReferenceString = (input: ReferenceInput): string => {
  if (typeof input === "string") return input;
  if (!input?.book || !input.chapter || !input.verse) return "";
  const end =
    input.endVerse && input.endVerse !== input.verse
      ? `-${input.endVerse}`
      : "";
  return `${input.book} ${input.chapter}:${input.verse}${end}`;
};

const readJsonArray = (filePath: string): unknown[] | null => {
  if (!fs.existsSync(filePath)) {
    console.log(`[Canonical] File not found, skipping: ${filePath}`);
    return null;
  }

  try {
    const contents = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(contents);
    if (!Array.isArray(parsed)) {
      console.log(`[Canonical] Expected array in ${filePath}`);
      return null;
    }
    return parsed as unknown[];
  } catch (error) {
    console.log(
      `[Canonical] Failed to parse ${filePath}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
};

const referenceCache = new Map<string, number[]>();

const resolveReferenceIds = async (
  input: ReferenceInput,
): Promise<number[]> => {
  const raw = toReferenceString(input);
  const normalized = normalizeReferenceText(raw);
  if (!normalized) return [];

  const cached = referenceCache.get(normalized);
  if (cached) return cached;

  const parsed = parseExplicitReference(normalized);
  if (!parsed) {
    console.log(`[Canonical] Unparsed reference: "${raw}"`);
    referenceCache.set(normalized, []);
    return [];
  }

  const minVerse = Math.min(parsed.verse, parsed.endVerse ?? parsed.verse);
  const maxVerse = Math.max(parsed.verse, parsed.endVerse ?? parsed.verse);
  const bookName = BOOK_NAMES[parsed.book];

  const fetchBy = async (field: "book_abbrev" | "book_name", value: string) => {
    const { data, error } = await supabase
      .from("verses")
      .select("id, verse")
      .eq(field, value)
      .eq("chapter", parsed.chapter)
      .gte("verse", minVerse)
      .lte("verse", maxVerse);

    if (error) {
      console.log(
        `[Canonical] Verse lookup failed (${value} ${parsed.chapter}:${minVerse}-${maxVerse}): ${error.message}`,
      );
      return [];
    }

    return (data || []) as Array<{ id: number; verse: number }>;
  };

  let rows = await fetchBy("book_abbrev", parsed.book);
  if (rows.length === 0 && bookName) {
    rows = await fetchBy("book_name", bookName);
  }

  if (rows.length === 0) {
    console.log(`[Canonical] Verse not found: ${normalized}`);
    referenceCache.set(normalized, []);
    return [];
  }

  const ids = rows.sort((a, b) => a.verse - b.verse).map((row) => row.id);
  referenceCache.set(normalized, ids);
  return ids;
};

const clearTable = async (table: string) => {
  const { error } = await supabase.from(table).delete().neq("id", 0);
  if (error) {
    console.log(`[Canonical] Failed to clear ${table}: ${error.message}`);
  } else {
    console.log(`[Canonical] Cleared ${table}`);
  }
};

const insertBatches = async (
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
) => {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });

    if (error) {
      console.log(`[Canonical] Insert failed (${table}): ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
};

const logTableCount = async (table: string) => {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.log(`[Canonical] Count failed (${table}): ${error.message}`);
    return;
  }
  console.log(`[Canonical] ${table} rows: ${count ?? "Unknown"}`);
};

const populateCitations = async () => {
  const data = readJsonArray(CITATIONS_PATH);
  if (!data) return;

  const rows: Array<{
    ot_verse_id: number;
    nt_verse_id: number;
    quote_type?: string;
  }> = [];
  const seen = new Set<string>();
  let skipped = 0;

  const entries = typeof limit === "number" ? data.slice(0, limit) : data;

  for (const entry of entries) {
    const item = entry as CitationInput;
    const otRef = item.ot ?? item.ot_verse;
    const ntRef = item.nt ?? item.nt_verse;
    if (!otRef || !ntRef) {
      skipped += 1;
      continue;
    }

    const otIds = await resolveReferenceIds(otRef);
    const ntIds = await resolveReferenceIds(ntRef);
    if (otIds.length === 0 || ntIds.length === 0) {
      skipped += 1;
      continue;
    }

    const quoteType = item.quote_type ?? item.quoteType;

    for (const otId of otIds) {
      for (const ntId of ntIds) {
        const key = `${otId}|${ntId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          ot_verse_id: otId,
          nt_verse_id: ntId,
          ...(quoteType ? { quote_type: quoteType } : {}),
        });
      }
    }
  }

  console.log(
    `[Canonical] Citations: prepared ${rows.length} rows (${skipped} skipped)`,
  );
  if (dryRun) return;
  if (shouldReset) await clearTable("citations");

  const inserted = await insertBatches(
    "citations",
    rows,
    "ot_verse_id,nt_verse_id",
  );
  console.log(`[Canonical] Citations: inserted ${inserted}`);
  await logTableCount("citations");
};

const populateProphecies = async () => {
  const data = readJsonArray(PROPHECIES_PATH);
  if (!data) return;

  const rows: Array<{
    prophecy_verse_id: number;
    fulfillment_verse_id: number;
    prophecy_type?: string;
  }> = [];
  const seen = new Set<string>();
  let skipped = 0;

  const entries = typeof limit === "number" ? data.slice(0, limit) : data;

  for (const entry of entries) {
    const item = entry as ProphecyInput;
    const prophecyRef = item.prophecy ?? item.prophecy_verse;
    const fulfillmentRef = item.fulfillment ?? item.fulfillment_verse;
    if (!prophecyRef || !fulfillmentRef) {
      skipped += 1;
      continue;
    }

    const prophecyIds = await resolveReferenceIds(prophecyRef);
    const fulfillmentIds = await resolveReferenceIds(fulfillmentRef);
    if (prophecyIds.length === 0 || fulfillmentIds.length === 0) {
      skipped += 1;
      continue;
    }

    const prophecyType = item.prophecy_type ?? item.prophecyType;

    for (const prophecyId of prophecyIds) {
      for (const fulfillmentId of fulfillmentIds) {
        const key = `${prophecyId}|${fulfillmentId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          prophecy_verse_id: prophecyId,
          fulfillment_verse_id: fulfillmentId,
          ...(prophecyType ? { prophecy_type: prophecyType } : {}),
        });
      }
    }
  }

  console.log(
    `[Canonical] Prophecies: prepared ${rows.length} rows (${skipped} skipped)`,
  );
  if (dryRun) return;
  if (shouldReset) await clearTable("prophecies");

  const inserted = await insertBatches(
    "prophecies",
    rows,
    "prophecy_verse_id,fulfillment_verse_id",
  );
  console.log(`[Canonical] Prophecies: inserted ${inserted}`);
  await logTableCount("prophecies");
};

const populateGenealogies = async () => {
  const data = readJsonArray(GENEALOGIES_PATH);
  if (!data) return;

  const rows: Array<{
    ancestor_verse_id: number;
    descendant_verse_id: number;
    relationship?: string;
  }> = [];
  const seen = new Set<string>();
  let skipped = 0;

  const entries = typeof limit === "number" ? data.slice(0, limit) : data;

  for (const entry of entries) {
    const item = entry as GenealogyInput;
    const ancestorRef = item.ancestor ?? item.ancestor_verse;
    const descendantRef = item.descendant ?? item.descendant_verse;
    if (!ancestorRef || !descendantRef) {
      skipped += 1;
      continue;
    }

    const ancestorIds = await resolveReferenceIds(ancestorRef);
    const descendantIds = await resolveReferenceIds(descendantRef);
    if (ancestorIds.length === 0 || descendantIds.length === 0) {
      skipped += 1;
      continue;
    }

    const relationship = item.relationship;

    for (const ancestorId of ancestorIds) {
      for (const descendantId of descendantIds) {
        const key = `${ancestorId}|${descendantId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          ancestor_verse_id: ancestorId,
          descendant_verse_id: descendantId,
          ...(relationship ? { relationship } : {}),
        });
      }
    }
  }

  console.log(
    `[Canonical] Genealogies: prepared ${rows.length} rows (${skipped} skipped)`,
  );
  if (dryRun) return;
  if (shouldReset) await clearTable("genealogies");

  const inserted = await insertBatches(
    "genealogies",
    rows,
    "ancestor_verse_id,descendant_verse_id",
  );
  console.log(`[Canonical] Genealogies: inserted ${inserted}`);
  await logTableCount("genealogies");
};

async function main() {
  console.log("=".repeat(60));
  console.log("Populate Canonical Tables");
  console.log("=".repeat(60));
  console.log(`Data dir: ${DATA_DIR}`);
  if (limit !== undefined) {
    console.log(`Limit: ${limit}`);
  }
  if (dryRun) {
    console.log("Dry run: no inserts");
  }
  if (shouldReset) {
    console.log("Reset enabled: tables will be cleared");
  }
  console.log();

  await populateCitations();
  await populateProphecies();
  await populateGenealogies();

  console.log();
  console.log("Canonical table population complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Canonical population failed:", error);
  process.exit(1);
});
