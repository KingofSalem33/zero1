/**
 * Semantic Search for Bible Verses
 *
 * Uses OpenAI embeddings and pgvector for fast, accurate verse retrieval
 */

import { supabase } from "../db";
import OpenAI from "openai";
import { ENV } from "../env";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface SearchResult {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  similarity: number;
}

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

  // Check OpenAI API key
  if (!ENV.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  // Step 1: Generate embedding for the query
  const startTime = Date.now();
  const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

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
    // Get top N candidates with moderate threshold (lower than single anchor)
    const results = await searchVersesByQuery(query, maxAnchors, 0.5);

    if (results.length === 0) {
      console.log("[Semantic Search] No results found above threshold");
      return [];
    }

    const anchorIds = results.map((r) => r.id);

    console.log(
      `[Semantic Search] ✅ Selected ${anchorIds.length} anchors for multi-perspective synthesis:`,
    );
    results.forEach((r, i) => {
      console.log(
        `   ${i + 1}. ${r.book_name} ${r.chapter}:${r.verse} (${(r.similarity * 100).toFixed(1)}% confidence)`,
      );
    });

    return anchorIds;
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
  if (!ENV.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });

  return response.data.map((item) => item.embedding);
}
