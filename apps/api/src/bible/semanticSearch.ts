/**
 * Semantic Search for Bible Verses
 *
 * Uses OpenAI embeddings and pgvector for fast, accurate verse retrieval
 */

import { supabase } from "../db";
import { makeEmbeddingClient } from "../ai";
import { ENV } from "../env";
import { cosineSimilarity } from "./mathUtils";

const EMBEDDING_MODEL = ENV.EMBEDDING_MODEL_NAME || "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
const ANCHOR_POOL_FACTOR = 6;
const ANCHOR_POOL_MAX = 50;
const ANCHOR_MMR_LAMBDA = 0.72;
const ANCHOR_MIN_SIMILARITY = 0.45;

interface SearchResult {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  similarity: number;
}

type AnchorCandidate = SearchResult & {
  referenceKey: string;
  pericopeId?: number;
};

// cosineSimilarity imported from mathUtils

const parseEmbedding = (embedding: unknown): number[] | null => {
  if (!embedding) return null;
  try {
    const parsed =
      typeof embedding === "string" ? JSON.parse(embedding) : embedding;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
};

const buildReferenceKey = (row: SearchResult): string =>
  `${row.book_abbrev.toLowerCase()}|${row.chapter}|${row.verse}`;

const fetchEmbeddingsForVerses = async (
  ids: number[],
): Promise<Map<number, number[]>> => {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("verses")
    .select("id, embedding")
    .in("id", ids);

  if (error || !data) {
    console.warn("[Semantic Search] Failed to fetch embeddings for anchors");
    return new Map();
  }

  const embeddingMap = new Map<number, number[]>();
  (data as { id: number; embedding: unknown }[]).forEach((row) => {
    const embedding = parseEmbedding(row.embedding);
    if (embedding) embeddingMap.set(row.id, embedding);
  });

  return embeddingMap;
};

const fetchPericopeIds = async (
  ids: number[],
): Promise<Map<number, number>> => {
  if (ids.length === 0) return new Map();

  const { data, error } = await supabase
    .from("verse_pericope_map")
    .select("verse_id, pericope_id")
    .in("verse_id", ids)
    .eq("source", ENV.PERICOPE_SOURCE || "SIL_AI");

  if (error || !data) {
    console.warn("[Semantic Search] Failed to fetch pericope IDs for anchors");
    return new Map();
  }

  const mapping = new Map<number, number>();
  (data as { verse_id: number; pericope_id: number }[]).forEach((row) => {
    if (!mapping.has(row.verse_id)) {
      mapping.set(row.verse_id, row.pericope_id);
    }
  });
  return mapping;
};

const selectAnchorsMMR = (
  candidates: AnchorCandidate[],
  embeddings: Map<number, number[]>,
  maxAnchors: number,
  options: {
    lambda?: number;
    pericopeMap?: Map<number, number>;
  } = {},
): AnchorCandidate[] => {
  if (candidates.length === 0) return [];
  const lambda = options.lambda ?? ANCHOR_MMR_LAMBDA;
  const pericopeMap = options.pericopeMap ?? new Map();

  const selected: AnchorCandidate[] = [];
  const selectedIds = new Set<number>();
  const selectedPericopes = new Set<number>();

  const sorted = [...candidates].sort((a, b) => b.similarity - a.similarity);
  const selectCandidate = (candidate: AnchorCandidate) => {
    selected.push(candidate);
    selectedIds.add(candidate.id);
    const pericopeId = pericopeMap.get(candidate.id);
    if (pericopeId) selectedPericopes.add(pericopeId);
  };

  const canUse = (candidate: AnchorCandidate, enforcePericope: boolean) => {
    if (selectedIds.has(candidate.id)) return false;
    if (!enforcePericope) return true;
    const pericopeId = pericopeMap.get(candidate.id);
    if (!pericopeId) return true;
    return !selectedPericopes.has(pericopeId);
  };

  const runSelection = (enforcePericope: boolean) => {
    if (selected.length === 0) {
      const first = sorted.find((candidate) =>
        canUse(candidate, enforcePericope),
      );
      if (first) selectCandidate(first);
    }

    while (selected.length < maxAnchors) {
      let best: AnchorCandidate | null = null;
      let bestScore = -Infinity;

      for (const candidate of sorted) {
        if (!canUse(candidate, enforcePericope)) continue;
        const candidateEmbedding = embeddings.get(candidate.id);
        let maxSimToSelected = 0;

        if (candidateEmbedding) {
          for (const picked of selected) {
            const pickedEmbedding = embeddings.get(picked.id);
            if (!pickedEmbedding) continue;
            const sim = cosineSimilarity(candidateEmbedding, pickedEmbedding);
            if (sim > maxSimToSelected) maxSimToSelected = sim;
          }
        }

        const mmrScore =
          lambda * candidate.similarity - (1 - lambda) * maxSimToSelected;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          best = candidate;
        }
      }

      if (!best) break;
      selectCandidate(best);
    }
  };

  runSelection(true);
  if (selected.length < maxAnchors) {
    runSelection(false);
  }

  return selected.slice(0, maxAnchors);
};

/**
 * Search for verses semantically similar to a query
 *
 * @param query - Natural language query (e.g., "Jesus walked on water")
 * @param limit - Number of results to return (default: 5)
 * @param similarityThreshold - Minimum similarity score 0-1 (default: 0.5)
 * @returns Array of matching verses with similarity scores
 */
export async function searchVersesByQuery(
  query: string,
  limit: number = 5,
  similarityThreshold: number = 0.5,
): Promise<SearchResult[]> {
  console.log(`[Semantic Search] Query: "${query}"`);
  console.log(
    `[Semantic Search] Limit: ${limit}, Threshold: ${similarityThreshold}`,
  );

  // Check embedding provider config
  if (!ENV.EMBEDDING_API_KEY || !ENV.EMBEDDING_MODEL_NAME) {
    throw new Error("Embedding provider not configured");
  }

  // Step 1: Generate embedding for the query
  const startTime = Date.now();
  const client = makeEmbeddingClient();
  if (!client) {
    throw new Error("Embedding client not configured");
  }

  let queryEmbedding: number[];
  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
      dimensions: EMBEDDING_DIMENSIONS,
    });

    queryEmbedding = response.data[0].embedding;
    const embeddingTime = Date.now() - startTime;
    console.log(
      `[Semantic Search] Generated query embedding in ${embeddingTime}ms`,
    );
  } catch (error) {
    console.error("[Semantic Search] Failed to generate embedding:", error);
    throw new Error("Failed to generate query embedding");
  }

  // Step 2: Search database using pgvector
  const searchStart = Date.now();

  try {
    const { data, error } = await supabase.rpc("search_verses_by_embedding", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_limit: limit,
      similarity_threshold: similarityThreshold,
    });

    if (error) {
      console.error("[Semantic Search] Database search failed:", error);
      throw new Error(`Database search failed: ${error.message}`);
    }

    const searchTime = Date.now() - searchStart;
    const totalTime = Date.now() - startTime;

    console.log(
      `[Semantic Search] Database search completed in ${searchTime}ms`,
    );
    console.log(`[Semantic Search] Total time: ${totalTime}ms`);
    console.log(`[Semantic Search] Found ${data?.length || 0} results`);

    if (data && data.length > 0) {
      console.log("[Semantic Search] Top result:");
      console.log(
        `   ${data[0].book_name} ${data[0].chapter}:${data[0].verse} (${(data[0].similarity * 100).toFixed(1)}% match)`,
      );
      console.log(`   "${data[0].text.substring(0, 80)}..."`);
    }

    return (data as SearchResult[]) || [];
  } catch (error) {
    console.error("[Semantic Search] Search failed:", error);
    throw error;
  }
}

/**
 * Find the single best anchor verse for a query
 *
 * @param query - Natural language query
 * @returns Verse ID of the best match, or null if no good match found
 */
export async function findAnchorVerse(query: string): Promise<number | null> {
  console.log(`[Semantic Search] Finding anchor verse for: "${query}"`);

  try {
    // Get top 3 candidates with relatively high threshold
    const results = await searchVersesByQuery(query, 3, 0.6);

    if (results.length === 0) {
      console.log("[Semantic Search] No results found above threshold");
      return null;
    }

    // Return the top result
    const best = results[0];
    console.log(
      `[Semantic Search] ✅ Selected anchor: ${best.book_name} ${best.chapter}:${best.verse} (${(best.similarity * 100).toFixed(1)}% confidence)`,
    );

    return best.id;
  } catch (error) {
    console.error("[Semantic Search] Failed to find anchor verse:", error);
    return null;
  }
}

/**
 * Find multiple anchor verses for multi-perspective synthesis
 *
 * @param query - Natural language query
 * @param maxAnchors - Maximum number of anchors to return (default: 3)
 * @returns Array of verse IDs for the best matches
 */
export async function findMultipleAnchorVerses(
  query: string,
  maxAnchors: number = 3,
): Promise<number[]> {
  console.log(
    `[Semantic Search] Finding top ${maxAnchors} anchor verses for: "${query}"`,
  );

  try {
    const poolSize = Math.min(
      ANCHOR_POOL_MAX,
      Math.max(maxAnchors * ANCHOR_POOL_FACTOR, maxAnchors),
    );
    const results = await searchVersesByQuery(
      query,
      poolSize,
      ANCHOR_MIN_SIMILARITY,
    );

    if (results.length === 0) {
      console.log("[Semantic Search] No results found above threshold");
      return [];
    }

    const dedupedByRef = new Map<string, SearchResult>();
    results.forEach((row) => {
      const key = buildReferenceKey(row);
      const existing = dedupedByRef.get(key);
      if (!existing || row.similarity > existing.similarity) {
        dedupedByRef.set(key, row);
      }
    });

    const candidates = Array.from(dedupedByRef.values()).map((row) => ({
      ...row,
      referenceKey: buildReferenceKey(row),
    }));
    const candidateIds = candidates.map((row) => row.id);

    const [embeddingMap, pericopeMap] = await Promise.all([
      fetchEmbeddingsForVerses(candidateIds),
      fetchPericopeIds(candidateIds),
    ]);

    const selected = selectAnchorsMMR(candidates, embeddingMap, maxAnchors, {
      lambda: ANCHOR_MMR_LAMBDA,
      pericopeMap,
    });

    console.log(
      `[Semantic Search] ✅ Selected ${selected.length} anchors for multi-perspective synthesis:`,
    );
    selected.forEach((r, i) => {
      console.log(
        `   ${i + 1}. ${r.book_name} ${r.chapter}:${r.verse} (${(r.similarity * 100).toFixed(1)}% confidence)`,
      );
    });

    return selected.map((r) => r.id);
  } catch (error) {
    console.error("[Semantic Search] Failed to find anchor verses:", error);
    return [];
  }
}

/**
 * Batch generate embeddings for multiple texts
 * Used by the embedding generation script
 *
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateEmbeddingsBatch(
  texts: string[],
): Promise<number[][]> {
  if (!ENV.EMBEDDING_API_KEY || !ENV.EMBEDDING_MODEL_NAME) {
    throw new Error("Embedding provider not configured");
  }

  const client = makeEmbeddingClient();
  if (!client) {
    throw new Error("Embedding client not configured");
  }

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data.map((item) => item.embedding);
}
