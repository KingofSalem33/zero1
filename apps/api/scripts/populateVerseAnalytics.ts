/**
 * Populate verse_analytics with centrality + pagerank scores.
 *
 * Centrality: degree count across edges (normalized 0-1, floor at 0.1).
 * PageRank: log-normalized degree by default (optional).
 *
 * Usage:
 *   npx ts-node scripts/populateVerseAnalytics.ts
 *   npx ts-node scripts/populateVerseAnalytics.ts --reset
 *   npx ts-node scripts/populateVerseAnalytics.ts --dry-run
 *   npx ts-node scripts/populateVerseAnalytics.ts --include-llm
 *   npx ts-node scripts/populateVerseAnalytics.ts --pagerank=log
 *   npx ts-node scripts/populateVerseAnalytics.ts --pagerank=none
 */

import { config } from "dotenv";
config();

import { supabase } from "../src/db";

type EdgeTableConfig = {
  table: string;
  fromField: string;
  toField: string;
  label: string;
};

type EdgeRow = Record<string, number>;
type EdgeQueryResult = Promise<{
  data: EdgeRow[] | null;
  error: { message: string } | null;
}>;
type EdgeQuery = {
  select: (columns: string) => {
    order: (
      column: string,
      opts: { ascending: boolean },
    ) => {
      range: (from: number, to: number) => EdgeQueryResult;
    };
  };
};

const BATCH_SIZE = 1000;
const PAGE_SIZE = 1000;

const hasFlag = (flag: string) => process.argv.includes(flag);
const getStringFlag = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  return arg.slice(prefix.length);
};

const shouldReset = hasFlag("--reset");
const dryRun = hasFlag("--dry-run");
const includeLLM = hasFlag("--include-llm");
const pagerankMode = getStringFlag("pagerank") ?? "log";

const EDGE_TABLES: EdgeTableConfig[] = [
  {
    table: "cross_references",
    fromField: "from_verse_id",
    toField: "to_verse_id",
    label: "cross_references",
  },
  {
    table: "citations",
    fromField: "ot_verse_id",
    toField: "nt_verse_id",
    label: "citations",
  },
  {
    table: "prophecies",
    fromField: "prophecy_verse_id",
    toField: "fulfillment_verse_id",
    label: "prophecies",
  },
  {
    table: "genealogies",
    fromField: "ancestor_verse_id",
    toField: "descendant_verse_id",
    label: "genealogies",
  },
];

if (includeLLM) {
  EDGE_TABLES.push({
    table: "llm_connections",
    fromField: "from_verse_id",
    toField: "to_verse_id",
    label: "llm_connections",
  });
}

const incrementCount = (map: Map<number, number>, id: number) => {
  map.set(id, (map.get(id) ?? 0) + 1);
};

const clearTable = async () => {
  const { error } = await supabase
    .from("verse_analytics")
    .delete()
    .neq("verse_id", 0);
  if (error) {
    console.log(
      `[Analytics] Failed to clear verse_analytics: ${error.message}`,
    );
  } else {
    console.log("[Analytics] Cleared verse_analytics");
  }
};

const fetchVerseIds = async (): Promise<number[]> => {
  const ids: number[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("verses")
      .select("id")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.log(`[Analytics] Verse fetch failed: ${error.message}`);
      break;
    }

    const rows = (data || []) as Array<{ id: number }>;
    rows.forEach((row) => ids.push(row.id));

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return ids;
};

const fetchEdgeCounts = async (): Promise<Map<number, number>> => {
  const counts = new Map<number, number>();

  for (const table of EDGE_TABLES) {
    console.log(`[Analytics] Reading ${table.label}...`);
    let offset = 0;

    while (true) {
      const query = supabase.from(table.table) as unknown as EdgeQuery;
      const { data, error } = await query
        .select(`id, ${table.fromField}, ${table.toField}`)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.log(`[Analytics] Skipping ${table.label}: ${error.message}`);
        break;
      }

      const rows = (data || []) as Array<Record<string, number>>;
      if (rows.length === 0) break;

      rows.forEach((row) => {
        const fromId = row[table.fromField];
        const toId = row[table.toField];
        if (Number.isFinite(fromId)) incrementCount(counts, fromId);
        if (Number.isFinite(toId)) incrementCount(counts, toId);
      });

      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return counts;
};

const computeScores = (
  verseIds: number[],
  counts: Map<number, number>,
): Array<{
  verse_id: number;
  centrality_score: number;
  pagerank_score: number;
  updated_at: string;
}> => {
  const values = Array.from(counts.values());
  const maxCount = Math.max(1, ...values);
  const rows: Array<{
    verse_id: number;
    centrality_score: number;
    pagerank_score: number;
    updated_at: string;
  }> = [];

  verseIds.forEach((verseId) => {
    const count = counts.get(verseId) ?? 0;
    const rawCentrality = count / maxCount;
    const centrality = count === 0 ? 0.1 : Math.max(0.1, rawCentrality);

    let pagerank = centrality;
    if (pagerankMode === "log") {
      pagerank = count === 0 ? 0.1 : Math.log1p(count) / Math.log1p(maxCount);
      pagerank = Math.max(0.1, pagerank);
    } else if (pagerankMode === "none") {
      pagerank = centrality;
    }

    rows.push({
      verse_id: verseId,
      centrality_score: Number(centrality.toFixed(4)),
      pagerank_score: Number(pagerank.toFixed(4)),
      updated_at: new Date().toISOString(),
    });
  });

  return rows;
};

const insertBatches = async (rows: Array<Record<string, unknown>>) => {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("verse_analytics")
      .upsert(batch, { onConflict: "verse_id" });

    if (error) {
      console.log(`[Analytics] Insert failed: ${error.message}`);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
};

async function main() {
  console.log("=".repeat(60));
  console.log("Populate Verse Analytics");
  console.log("=".repeat(60));
  console.log(`Include LLM edges: ${includeLLM ? "yes" : "no"}`);
  console.log(`PageRank mode: ${pagerankMode}`);
  if (dryRun) console.log("Dry run: no inserts");
  if (shouldReset) console.log("Reset enabled: table will be cleared");
  console.log();

  if (shouldReset && !dryRun) {
    await clearTable();
  }

  const verseIds = await fetchVerseIds();
  console.log(`[Analytics] Loaded ${verseIds.length} verse IDs`);

  const counts = await fetchEdgeCounts();
  console.log(`[Analytics] Counted ${counts.size} verse IDs with edges`);

  const rows = computeScores(verseIds, counts);
  console.log(`[Analytics] Prepared ${rows.length} rows`);

  if (dryRun) {
    console.log("[Analytics] Dry run complete.");
    process.exit(0);
  }

  const inserted = await insertBatches(rows);
  console.log(`[Analytics] Upserted ${inserted} rows`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Populate verse_analytics failed:", error);
  process.exit(1);
});
