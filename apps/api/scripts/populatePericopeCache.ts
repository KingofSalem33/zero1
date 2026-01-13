/**
 * Populate pericope_connections cache using embedding similarity.
 *
 * Usage:
 *   npx tsx apps/api/scripts/populatePericopeCache.ts [--start N] [--limit N]
 */

import "dotenv/config";

import { supabase } from "../src/db";

type PericopeEmbeddingRow = {
  pericope_id: number;
  embedding: unknown;
};

const EMBEDDING_TYPE = "full_text";
const MATCH_THRESHOLD = 0.4;
const MATCH_COUNT = 21;
const PAGE_SIZE = 1000;

const getNumberArg = (flag: string): number | null => {
  const withEquals = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (withEquals) {
    const value = Number.parseInt(withEquals.split("=")[1] ?? "", 10);
    return Number.isFinite(value) ? value : null;
  }
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  const value = Number.parseInt(process.argv[idx + 1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
};

const parseEmbedding = (embedding: unknown): number[] | null => {
  if (!embedding) return null;
  try {
    const parsed =
      typeof embedding === "string" ? JSON.parse(embedding) : embedding;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (
      !parsed.every(
        (value) => typeof value === "number" && Number.isFinite(value),
      )
    ) {
      return null;
    }
    return parsed as number[];
  } catch {
    return null;
  }
};

const determineRingDepth = (similarity: number) => {
  if (similarity >= 0.7) return 1;
  if (similarity >= 0.55) return 2;
  return 3;
};

async function fetchEmbeddingCount(): Promise<number> {
  const { count, error } = await supabase
    .from("pericope_embeddings")
    .select("pericope_id", { count: "exact", head: true })
    .eq("embedding_type", EMBEDDING_TYPE);

  if (error) {
    throw new Error(
      `Failed to fetch embedding count: ${error.message || "unknown"}`,
    );
  }

  return count || 0;
}

async function fetchEmbeddingsPage(
  startIndex: number,
  limit: number,
): Promise<PericopeEmbeddingRow[]> {
  const { data, error } = await supabase
    .from("pericope_embeddings")
    .select("pericope_id, embedding")
    .eq("embedding_type", EMBEDDING_TYPE)
    .order("pericope_id", { ascending: true })
    .range(startIndex, startIndex + limit - 1);

  if (error || !data) {
    throw new Error(
      `Failed to fetch embeddings: ${error?.message || "unknown"}`,
    );
  }

  return data as PericopeEmbeddingRow[];
}

async function populatePericopeCache() {
  const startIndex = getNumberArg("--start") ?? 0;
  const total = await fetchEmbeddingCount();
  const limitArg = getNumberArg("--limit") ?? 0;
  const windowCount =
    limitArg > 0 ? Math.min(limitArg, Math.max(0, total - startIndex)) : total;

  if (windowCount === 0) {
    console.log("No pericope embeddings to process.");
    return;
  }

  console.log(`Found ${total} pericope embeddings; processing ${windowCount}`);

  const processBatch = async (embeddings: PericopeEmbeddingRow[]) => {
    for (const source of embeddings) {
      const parsedEmbedding = parseEmbedding(source.embedding);
      if (!parsedEmbedding) continue;

      const { data: similar, error } = await supabase.rpc(
        "search_pericopes_by_embedding",
        {
          query_embedding: JSON.stringify(parsedEmbedding),
          match_threshold: MATCH_THRESHOLD,
          match_count: MATCH_COUNT,
          embedding_type_filter: EMBEDDING_TYPE,
        },
      );

      if (error) {
        console.error(
          `Similarity search failed for ${source.pericope_id}: ${error.message}`,
        );
        if (error.details) {
          console.error(`Details: ${error.details}`);
        }
        continue;
      }
      if (!similar) {
        console.error(
          `Similarity search returned no data for ${source.pericope_id}`,
        );
        continue;
      }

      const connections = (
        similar as Array<{ pericope_id: number; similarity: number }>
      )
        .filter((row) => row.pericope_id !== source.pericope_id)
        .slice(0, MATCH_COUNT - 1)
        .map((row) => ({
          source_pericope_id: source.pericope_id,
          target_pericope_id: row.pericope_id,
          connection_type: "NARRATIVE_PARALLEL",
          similarity_score: row.similarity,
          ring_depth: determineRingDepth(row.similarity),
        }));

      if (connections.length === 0) continue;

      const { error: insertError } = await supabase
        .from("pericope_connections")
        .upsert(connections, {
          onConflict: "source_pericope_id,target_pericope_id,connection_type",
        });

      if (insertError) {
        console.error(
          `Insert failed for ${source.pericope_id}: ${insertError.message}`,
        );
        if (insertError.details) {
          console.error(`Details: ${insertError.details}`);
        }
      }
    }
  };

  if (limitArg > 0) {
    const embeddings = await fetchEmbeddingsPage(startIndex, windowCount);
    await processBatch(embeddings);
    return;
  }

  for (let offset = startIndex; offset < total; offset += PAGE_SIZE) {
    const pageSize = Math.min(PAGE_SIZE, total - offset);
    const embeddings = await fetchEmbeddingsPage(offset, pageSize);
    if (embeddings.length === 0) break;
    await processBatch(embeddings);
  }
}

populatePericopeCache().catch((error) => {
  console.error(error);
  process.exit(1);
});
