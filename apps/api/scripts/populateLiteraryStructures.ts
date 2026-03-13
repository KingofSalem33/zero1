/**
 * Populate literary_structures with curated chiasm data.
 *
 * Expected data file:
 *   apps/api/data/structures/literary_structures.json
 *
 * Usage:
 *   npx ts-node scripts/populateLiteraryStructures.ts
 *   npx ts-node scripts/populateLiteraryStructures.ts --reset
 *   npx ts-node scripts/populateLiteraryStructures.ts --dry-run
 *   npx ts-node scripts/populateLiteraryStructures.ts --file=path/to/file.json
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

type StructureInput = {
  id?: number;
  name?: string;
  type?: string;
  center?: ReferenceInput;
  center_ref?: ReferenceInput;
  verse_ids?: ReferenceInput[] | number[];
  mapping?: Record<string, ReferenceInput | ReferenceInput[]>;
  json_mapping?: Record<string, ReferenceInput | ReferenceInput[]>;
  confidence?: number;
  source?: string;
};

const DEFAULT_PATH = path.join(
  process.cwd(),
  "data",
  "structures",
  "literary_structures.json",
);

const BATCH_SIZE = 200;
const hasFlag = (flag: string) => process.argv.includes(flag);
const getStringFlag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  return arg.slice(prefix.length);
};

const shouldReset = hasFlag("--reset");
const dryRun = hasFlag("--dry-run");
const filePath = getStringFlag("file") ?? DEFAULT_PATH;

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
    console.log(`[Structures] Unparsed reference: "${raw}"`);
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
        `[Structures] Verse lookup failed (${value} ${parsed.chapter}:${minVerse}-${maxVerse}): ${error.message}`,
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
    console.log(`[Structures] Verse not found: ${normalized}`);
    referenceCache.set(normalized, []);
    return [];
  }

  const ids = rows.sort((a, b) => a.verse - b.verse).map((row) => row.id);
  referenceCache.set(normalized, ids);
  return ids;
};

const selectRepresentative = (ids: number[]): number | null => {
  if (ids.length === 0) return null;
  return ids[Math.floor((ids.length - 1) / 2)];
};

const readJsonArray = (file: string): StructureInput[] => {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const contents = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(contents);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected array in ${file}`);
  }

  return parsed as StructureInput[];
};

const clearTable = async () => {
  const { error } = await supabase
    .from("literary_structures")
    .delete()
    .neq("id", 0);
  if (error) {
    console.log(
      `[Structures] Failed to clear literary_structures: ${error.message}`,
    );
  } else {
    console.log("[Structures] Cleared literary_structures");
  }
};

const insertBatches = async (rows: Array<Record<string, unknown>>) => {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("literary_structures").insert(batch);

    if (error) {
      console.log(`[Structures] Insert failed: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
};

async function main() {
  console.log("=".repeat(60));
  console.log("Populate Literary Structures");
  console.log("=".repeat(60));
  console.log(`File: ${filePath}`);
  if (dryRun) console.log("Dry run: no inserts");
  if (shouldReset) console.log("Reset enabled: table will be cleared");
  console.log();

  const input = readJsonArray(filePath);
  const rows: Array<Record<string, unknown>> = [];
  let skipped = 0;

  for (const entry of input) {
    const mappingInput = entry.mapping ?? entry.json_mapping ?? {};
    const jsonMapping: Record<string, number> = {};
    const verseIds = new Set<number>();

    for (const [label, value] of Object.entries(mappingInput)) {
      const values = Array.isArray(value) ? value : [value];
      const resolved: number[] = [];

      for (const val of values) {
        if (typeof val === "number" && Number.isFinite(val)) {
          resolved.push(val);
          continue;
        }
        const ids = await resolveReferenceIds(val as ReferenceInput);
        resolved.push(...ids);
      }

      resolved.forEach((id) => verseIds.add(id));
      const representative = selectRepresentative(resolved);
      if (representative) {
        jsonMapping[label] = representative;
      }
    }

    let centerId: number | null = null;
    const centerRef = entry.center ?? entry.center_ref;
    if (centerRef) {
      const ids = await resolveReferenceIds(centerRef);
      centerId = selectRepresentative(ids);
      ids.forEach((id) => verseIds.add(id));
    } else if (jsonMapping.C) {
      centerId = jsonMapping.C;
    }

    if (entry.verse_ids && Array.isArray(entry.verse_ids)) {
      for (const value of entry.verse_ids) {
        if (typeof value === "number" && Number.isFinite(value)) {
          verseIds.add(value);
          continue;
        }
        const ids = await resolveReferenceIds(value as ReferenceInput);
        ids.forEach((id) => verseIds.add(id));
      }
    }

    const verseIdList = Array.from(verseIds);
    if (verseIdList.length === 0) {
      skipped += 1;
      continue;
    }

    const row: Record<string, unknown> = {
      structure_type: entry.type ?? "chiasm",
      name: entry.name ?? null,
      center_verse_id: centerId,
      verse_ids: verseIdList,
      json_mapping: jsonMapping,
      confidence: entry.confidence ?? 0.9,
      source: entry.source ?? null,
    };

    if (typeof entry.id === "number") {
      row.id = entry.id;
    }

    rows.push(row);
  }

  console.log(`[Structures] Prepared ${rows.length} rows (${skipped} skipped)`);

  if (dryRun) {
    console.log("[Structures] Dry run complete.");
    process.exit(0);
  }

  if (shouldReset) {
    await clearTable();
  }

  const inserted = await insertBatches(rows);
  console.log(`[Structures] Inserted ${inserted} rows`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Populate literary_structures failed:", error);
  process.exit(1);
});
