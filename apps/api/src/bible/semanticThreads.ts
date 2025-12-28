/**
 * Semantic Thread Detection
 *
 * Uses embeddings to find high-conviction thematic connections
 * Only creates edges where semantic similarity is very high (0.85+)
 */

import { supabase } from "../db";
import type { VisualEdge } from "./types";

// Helper: Determine if book is Old Testament
function isOldTestament(bookAbbrev: string): boolean {
  const otBooks = [
    "gen",
    "exo",
    "lev",
    "num",
    "deu",
    "jos",
    "jdg",
    "rth",
    "1sa",
    "2sa",
    "1ki",
    "2ki",
    "1ch",
    "2ch",
    "ezr",
    "neh",
    "est",
    "job",
    "psa",
    "pro",
    "ecc",
    "sng",
    "isa",
    "jer",
    "lam",
    "eze",
    "dan",
    "hos",
    "joe",
    "amo",
    "oba",
    "jon",
    "mic",
    "nah",
    "hab",
    "zep",
    "hag",
    "zec",
    "mal",
  ];
  return otBooks.includes(bookAbbrev.toLowerCase());
}

// Helper: Cosine similarity between two embeddings
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Find GOLD threads: Same-testament, very high lexical similarity
 * These are verses using nearly identical language/concepts
 */
export async function findGoldThreads(
  verseIds: number[],
  threshold: number = 0.88,
): Promise<VisualEdge[]> {
  if (verseIds.length === 0) return [];

  console.log(
    `[Semantic Threads] Finding GOLD threads (same testament, ${threshold}+ similarity)...`,
  );

  try {
    // Fetch verses with embeddings
    const { data: verses, error } = await supabase
      .from("verses")
      .select("id, book_abbrev, embedding")
      .in("id", verseIds);

    if (error || !verses) {
      console.error("[Semantic Threads] Error fetching verses:", error);
      return [];
    }

    const versesWithEmbeddings = verses
      .filter((v) => v.embedding)
      .map((v) => ({
        id: v.id,
        book_abbrev: v.book_abbrev,
        isOT: isOldTestament(v.book_abbrev),
        embedding:
          typeof v.embedding === "string"
            ? JSON.parse(v.embedding)
            : v.embedding,
      }));

    console.log(
      `[Semantic Threads] Processing ${versesWithEmbeddings.length} verses with embeddings`,
    );

    const edges: VisualEdge[] = [];
    const seenPairs = new Set<string>();
    const similarities: number[] = []; // Track all similarities for debugging

    // Compare all pairs within same testament
    for (let i = 0; i < versesWithEmbeddings.length; i++) {
      for (let j = i + 1; j < versesWithEmbeddings.length; j++) {
        const v1 = versesWithEmbeddings[i];
        const v2 = versesWithEmbeddings[j];

        // Only compare verses in same testament
        if (v1.isOT !== v2.isOT) continue;

        const similarity = cosineSimilarity(v1.embedding, v2.embedding);
        similarities.push(similarity);

        // Very high similarity = GOLD thread
        if (similarity >= threshold && similarity < 0.95) {
          // Cap at 0.95 to avoid near-duplicates
          const pairKey = `${Math.min(v1.id, v2.id)}-${Math.max(v1.id, v2.id)}`;
          if (!seenPairs.has(pairKey)) {
            edges.push({
              from: v1.id,
              to: v2.id,
              weight: similarity,
              type: "ROOTS",
              metadata: {
                similarity,
                thread: "lexical",
              },
            });
            seenPairs.add(pairKey);
          }
        }
      }
    }

    // Debug: Show similarity distribution
    if (similarities.length > 0) {
      const maxSim = Math.max(...similarities);
      const avgSim =
        similarities.reduce((a, b) => a + b, 0) / similarities.length;
      const aboveThreshold = similarities.filter((s) => s >= threshold).length;
      console.log(
        `[Semantic Threads] GOLD stats: max=${maxSim.toFixed(3)}, avg=${avgSim.toFixed(3)}, ${aboveThreshold}/${similarities.length} above ${threshold}`,
      );
    }

    console.log(`[Semantic Threads] Found ${edges.length} GOLD threads`);
    return edges;
  } catch (error) {
    console.error("[Semantic Threads] Error in findGoldThreads:", error);
    return [];
  }
}

/**
 * Find PURPLE threads: Cross-testament theological connections
 * High semantic similarity between OT and NT expressing same truth
 */
export async function findPurpleThreads(
  verseIds: number[],
  threshold: number = 0.85,
): Promise<VisualEdge[]> {
  if (verseIds.length === 0) return [];

  console.log(
    `[Semantic Threads] Finding PURPLE threads (cross-testament, ${threshold}+ similarity)...`,
  );

  try {
    // Fetch verses with embeddings
    const { data: verses, error } = await supabase
      .from("verses")
      .select("id, book_abbrev, embedding")
      .in("id", verseIds);

    if (error || !verses) {
      console.error("[Semantic Threads] Error fetching verses:", error);
      return [];
    }

    const versesWithEmbeddings = verses
      .filter((v) => v.embedding)
      .map((v) => ({
        id: v.id,
        book_abbrev: v.book_abbrev,
        isOT: isOldTestament(v.book_abbrev),
        embedding:
          typeof v.embedding === "string"
            ? JSON.parse(v.embedding)
            : v.embedding,
      }));

    console.log(
      `[Semantic Threads] Processing ${versesWithEmbeddings.length} verses with embeddings`,
    );

    const edges: VisualEdge[] = [];
    const seenPairs = new Set<string>();
    const similarities: number[] = []; // Track all similarities for debugging

    // Compare OT and NT pairs
    const otVerses = versesWithEmbeddings.filter((v) => v.isOT);
    const ntVerses = versesWithEmbeddings.filter((v) => !v.isOT);

    console.log(
      `[Semantic Threads] PURPLE comparison: ${otVerses.length} OT verses x ${ntVerses.length} NT verses`,
    );

    for (const otVerse of otVerses) {
      for (const ntVerse of ntVerses) {
        const similarity = cosineSimilarity(
          otVerse.embedding,
          ntVerse.embedding,
        );
        similarities.push(similarity);

        // High similarity = PURPLE thread (theological connection)
        if (similarity >= threshold && similarity < 0.92) {
          const pairKey = `${otVerse.id}-${ntVerse.id}`;
          if (!seenPairs.has(pairKey)) {
            edges.push({
              from: otVerse.id,
              to: ntVerse.id,
              weight: similarity,
              type: "ECHOES", // Maps to GOLD visually, but represents quotation
              metadata: {
                similarity,
                thread: "theological",
              },
            });
            seenPairs.add(pairKey);
          }
        }
      }
    }

    // Debug: Show similarity distribution
    if (similarities.length > 0) {
      const maxSim = Math.max(...similarities);
      const avgSim =
        similarities.reduce((a, b) => a + b, 0) / similarities.length;
      const aboveThreshold = similarities.filter((s) => s >= threshold).length;
      console.log(
        `[Semantic Threads] PURPLE stats: max=${maxSim.toFixed(3)}, avg=${avgSim.toFixed(3)}, ${aboveThreshold}/${similarities.length} above ${threshold}`,
      );
    }

    console.log(`[Semantic Threads] Found ${edges.length} PURPLE threads`);
    return edges;
  } catch (error) {
    console.error("[Semantic Threads] Error in findPurpleThreads:", error);
    return [];
  }
}

/**
 * Find CYAN threads: Prophetic patterns (OT prophecy → NT fulfillment)
 * Moderate-high similarity suggesting prophetic relationship
 */
export async function findCyanThreads(
  verseIds: number[],
  threshold: number = 0.8,
): Promise<VisualEdge[]> {
  if (verseIds.length === 0) return [];

  console.log(
    `[Semantic Threads] Finding CYAN threads (prophetic, ${threshold}+ similarity)...`,
  );

  try {
    // Fetch verses with embeddings
    const { data: verses, error } = await supabase
      .from("verses")
      .select("id, book_abbrev, embedding")
      .in("id", verseIds);

    if (error || !verses) {
      console.error("[Semantic Threads] Error fetching verses:", error);
      return [];
    }

    const versesWithEmbeddings = verses
      .filter((v) => v.embedding)
      .map((v) => ({
        id: v.id,
        book_abbrev: v.book_abbrev,
        isOT: isOldTestament(v.book_abbrev),
        embedding:
          typeof v.embedding === "string"
            ? JSON.parse(v.embedding)
            : v.embedding,
      }));

    const edges: VisualEdge[] = [];
    const seenPairs = new Set<string>();

    // Only OT → NT direction for prophecy
    const otVerses = versesWithEmbeddings.filter((v) => v.isOT);
    const ntVerses = versesWithEmbeddings.filter((v) => !v.isOT);

    // Focus on prophetic books
    const propheticBooks = [
      "isa",
      "jer",
      "eze",
      "dan",
      "hos",
      "joe",
      "amo",
      "mic",
      "zec",
      "mal",
      "psa",
    ];
    const propheticVerses = otVerses.filter((v) =>
      propheticBooks.includes(v.book_abbrev.toLowerCase()),
    );

    for (const otVerse of propheticVerses) {
      for (const ntVerse of ntVerses) {
        const similarity = cosineSimilarity(
          otVerse.embedding,
          ntVerse.embedding,
        );

        // Moderate-high similarity = CYAN thread (prophetic)
        if (similarity >= threshold && similarity < 0.88) {
          const pairKey = `${otVerse.id}-${ntVerse.id}`;
          if (!seenPairs.has(pairKey)) {
            edges.push({
              from: otVerse.id,
              to: ntVerse.id,
              weight: similarity,
              type: "PROPHECY",
              metadata: {
                similarity,
                thread: "prophetic",
              },
            });
            seenPairs.add(pairKey);
          }
        }
      }
    }

    console.log(`[Semantic Threads] Found ${edges.length} CYAN threads`);
    return edges;
  } catch (error) {
    console.error("[Semantic Threads] Error in findCyanThreads:", error);
    return [];
  }
}
