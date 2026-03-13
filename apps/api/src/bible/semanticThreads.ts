/**
 * Semantic Thread Detection
 *
 * Uses embeddings to find high-conviction thematic connections
 * Selects edges via adaptive percentile + top-K per anchor set
 */

import { supabase } from "../db";
import type { VisualEdge } from "./types";
import { cosineSimilarity } from "./mathUtils";

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

// cosineSimilarity imported from mathUtils

type VerseEmbeddingRow = {
  id: number;
  book_abbrev: string;
  chapter: number;
  verse: number;
  embedding: unknown;
};

const PERICOPE_WINDOW = 2;

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

const averageEmbeddings = (vectors: number[][]): number[] => {
  if (vectors.length === 0) return [];
  const length = vectors[0].length;
  const sums = new Array<number>(length).fill(0);
  let count = 0;

  vectors.forEach((vector) => {
    if (vector.length !== length) return;
    for (let i = 0; i < length; i++) {
      sums[i] += vector[i];
    }
    count += 1;
  });

  if (count === 0) return [];
  return sums.map((value) => value / count);
};

const buildPericopeEmbeddings = async (
  verseIds: number[],
  windowSize: number,
): Promise<
  Array<{ id: number; book_abbrev: string; isOT: boolean; embedding: number[] }>
> => {
  if (verseIds.length === 0) return [];

  const { data, error } = await supabase
    .from("verses")
    .select("id, book_abbrev, chapter, verse, embedding")
    .in("id", verseIds);

  if (error || !data) {
    console.error("[Semantic Threads] Error fetching verses:", error);
    return [];
  }

  const baseVerses = data as VerseEmbeddingRow[];
  const ranges = new Map<
    string,
    { book_abbrev: string; chapter: number; minVerse: number; maxVerse: number }
  >();

  baseVerses.forEach((verse) => {
    if (
      !verse.book_abbrev ||
      !Number.isFinite(verse.chapter) ||
      !Number.isFinite(verse.verse)
    ) {
      return;
    }
    const key = `${verse.book_abbrev}|${verse.chapter}`;
    const minVerse = Math.max(1, verse.verse - windowSize);
    const maxVerse = verse.verse + windowSize;
    const existing = ranges.get(key);
    if (existing) {
      existing.minVerse = Math.min(existing.minVerse, minVerse);
      existing.maxVerse = Math.max(existing.maxVerse, maxVerse);
    } else {
      ranges.set(key, {
        book_abbrev: verse.book_abbrev,
        chapter: verse.chapter,
        minVerse,
        maxVerse,
      });
    }
  });

  const embeddingsByGroup = new Map<string, Map<number, number[]>>();

  for (const group of ranges.values()) {
    const { data: groupData, error: groupError } = await supabase
      .from("verses")
      .select("book_abbrev, chapter, verse, embedding")
      .eq("book_abbrev", group.book_abbrev)
      .eq("chapter", group.chapter)
      .gte("verse", group.minVerse)
      .lte("verse", group.maxVerse);

    if (groupError || !groupData) {
      console.error(
        "[Semantic Threads] Error fetching pericope window:",
        groupError,
      );
      continue;
    }

    const map = new Map<number, number[]>();
    (groupData as VerseEmbeddingRow[]).forEach((row) => {
      const embedding = parseEmbedding(row.embedding);
      if (!embedding) return;
      map.set(row.verse, embedding);
    });
    embeddingsByGroup.set(`${group.book_abbrev}|${group.chapter}`, map);
  }

  const pericopeEmbeddings: Array<{
    id: number;
    book_abbrev: string;
    isOT: boolean;
    embedding: number[];
  }> = [];

  baseVerses.forEach((verse) => {
    if (
      !verse.book_abbrev ||
      !Number.isFinite(verse.chapter) ||
      !Number.isFinite(verse.verse)
    ) {
      return;
    }
    const groupKey = `${verse.book_abbrev}|${verse.chapter}`;
    const windowEmbeddings: number[][] = [];
    const groupEmbeddings = embeddingsByGroup.get(groupKey);
    if (groupEmbeddings) {
      const startVerse = Math.max(1, verse.verse - windowSize);
      const endVerse = verse.verse + windowSize;
      for (
        let verseNumber = startVerse;
        verseNumber <= endVerse;
        verseNumber++
      ) {
        const embedding = groupEmbeddings.get(verseNumber);
        if (embedding) {
          windowEmbeddings.push(embedding);
        }
      }
    }

    if (windowEmbeddings.length === 0) {
      const baseEmbedding = parseEmbedding(verse.embedding);
      if (baseEmbedding) {
        windowEmbeddings.push(baseEmbedding);
      }
    }

    const averaged = averageEmbeddings(windowEmbeddings);
    if (averaged.length === 0) return;

    pericopeEmbeddings.push({
      id: verse.id,
      book_abbrev: verse.book_abbrev,
      isOT: isOldTestament(verse.book_abbrev),
      embedding: averaged,
    });
  });

  return pericopeEmbeddings;
};

type SimilarityPair = {
  from: number;
  to: number;
  similarity: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const percentile = (values: number[], pct: number): number => {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * pct)),
  );
  return sorted[index];
};

const selectAdaptivePairs = (
  pairs: SimilarityPair[],
  options: {
    baseThreshold: number;
    percentile: number;
    minEdges: number;
    maxEdges: number;
  },
): {
  threshold: number;
  limit: number;
  candidateCount: number;
  selected: SimilarityPair[];
} => {
  if (pairs.length === 0) {
    return { threshold: 1, limit: 0, candidateCount: 0, selected: [] };
  }

  const similarities = pairs.map((pair) => pair.similarity);
  const adaptiveThreshold = Math.max(
    options.baseThreshold,
    percentile(similarities, options.percentile),
  );

  let candidates = pairs.filter((pair) => pair.similarity >= adaptiveThreshold);
  let threshold = adaptiveThreshold;

  if (candidates.length < options.minEdges) {
    candidates = pairs.filter(
      (pair) => pair.similarity >= options.baseThreshold,
    );
    threshold = options.baseThreshold;
  }

  if (candidates.length < options.minEdges) {
    candidates = [...pairs];
  }

  candidates.sort((a, b) => b.similarity - a.similarity);

  const limit = clamp(
    Math.round(Math.sqrt(pairs.length)),
    options.minEdges,
    options.maxEdges,
  );

  return {
    threshold,
    limit,
    candidateCount: candidates.length,
    selected: candidates.slice(0, limit),
  };
};

/**
 * Find GOLD threads: Same-testament, very high lexical similarity
 * These are verses using nearly identical language/concepts
 */
export async function findGoldThreads(
  verseIds: number[],
  baseThreshold: number = 0.88,
): Promise<VisualEdge[]> {
  if (verseIds.length === 0) return [];

  console.log(
    `[Semantic Threads] Finding GOLD threads (same testament, adaptive similarity)...`,
  );

  try {
    const versesWithEmbeddings = await buildPericopeEmbeddings(
      verseIds,
      PERICOPE_WINDOW,
    );

    console.log(
      `[Semantic Threads] Processing ${versesWithEmbeddings.length} pericope embeddings`,
    );

    const pairs: SimilarityPair[] = [];
    const seenPairs = new Set<string>();

    // Compare all pairs within same testament
    for (let i = 0; i < versesWithEmbeddings.length; i++) {
      for (let j = i + 1; j < versesWithEmbeddings.length; j++) {
        const v1 = versesWithEmbeddings[i];
        const v2 = versesWithEmbeddings[j];

        // Only compare verses in same testament
        if (v1.isOT !== v2.isOT) continue;

        const similarity = cosineSimilarity(v1.embedding, v2.embedding);
        const pairKey = `${Math.min(v1.id, v2.id)}-${Math.max(v1.id, v2.id)}`;
        if (!seenPairs.has(pairKey)) {
          const capped = Math.min(similarity, 0.999);
          pairs.push({ from: v1.id, to: v2.id, similarity: capped });
          seenPairs.add(pairKey);
        }
      }
    }

    const { threshold, limit, candidateCount, selected } = selectAdaptivePairs(
      pairs,
      {
        baseThreshold,
        percentile: 0.9,
        minEdges: 4,
        maxEdges: 40,
      },
    );

    const edges: VisualEdge[] = selected.map((pair) => ({
      from: pair.from,
      to: pair.to,
      weight: pair.similarity,
      type: "DEEPER",
      metadata: {
        similarity: pair.similarity,
        thread: "thematic",
        source: "semantic_thread",
        confidence: pair.similarity,
      },
    }));

    console.log(
      `[Semantic Threads] GOLD adaptive: threshold=${threshold.toFixed(3)}, candidates=${candidateCount}, limit=${limit}, selected=${edges.length}`,
    );

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
  baseThreshold: number = 0.85,
): Promise<VisualEdge[]> {
  if (verseIds.length === 0) return [];

  console.log(
    `[Semantic Threads] Finding PURPLE threads (cross-testament, adaptive similarity)...`,
  );

  try {
    const versesWithEmbeddings = await buildPericopeEmbeddings(
      verseIds,
      PERICOPE_WINDOW,
    );

    console.log(
      `[Semantic Threads] Processing ${versesWithEmbeddings.length} pericope embeddings`,
    );

    const pairs: SimilarityPair[] = [];
    const seenPairs = new Set<string>();

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
        const pairKey = `${otVerse.id}-${ntVerse.id}`;
        if (!seenPairs.has(pairKey)) {
          pairs.push({
            from: otVerse.id,
            to: ntVerse.id,
            similarity: Math.min(similarity, 0.999),
          });
          seenPairs.add(pairKey);
        }
      }
    }

    const { threshold, limit, candidateCount, selected } = selectAdaptivePairs(
      pairs,
      {
        baseThreshold,
        percentile: 0.9,
        minEdges: 3,
        maxEdges: 30,
      },
    );

    const edges: VisualEdge[] = selected.map((pair) => ({
      from: pair.from,
      to: pair.to,
      weight: pair.similarity,
      type: "DEEPER",
      metadata: {
        similarity: pair.similarity,
        thread: "thematic_cross_testament",
        source: "semantic_thread",
        confidence: pair.similarity,
      },
    }));

    console.log(
      `[Semantic Threads] PURPLE adaptive: threshold=${threshold.toFixed(3)}, candidates=${candidateCount}, limit=${limit}, selected=${edges.length}`,
    );

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
  baseThreshold: number = 0.8,
): Promise<VisualEdge[]> {
  if (verseIds.length === 0) return [];

  console.log(
    `[Semantic Threads] Finding CYAN threads (prophetic, adaptive similarity)...`,
  );

  try {
    const versesWithEmbeddings = await buildPericopeEmbeddings(
      verseIds,
      PERICOPE_WINDOW,
    );

    const pairs: SimilarityPair[] = [];
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

        const pairKey = `${otVerse.id}-${ntVerse.id}`;
        if (!seenPairs.has(pairKey)) {
          pairs.push({
            from: otVerse.id,
            to: ntVerse.id,
            similarity: Math.min(similarity, 0.999),
          });
          seenPairs.add(pairKey);
        }
      }
    }

    const { threshold, limit, candidateCount, selected } = selectAdaptivePairs(
      pairs,
      {
        baseThreshold,
        percentile: 0.9,
        minEdges: 3,
        maxEdges: 25,
      },
    );

    const edges: VisualEdge[] = selected.map((pair) => ({
      from: pair.from,
      to: pair.to,
      weight: pair.similarity,
      type: "PROPHECY",
      metadata: {
        similarity: pair.similarity,
        thread: "prophetic",
        source: "semantic_thread",
        confidence: pair.similarity,
      },
    }));

    console.log(
      `[Semantic Threads] CYAN adaptive: threshold=${threshold.toFixed(3)}, candidates=${candidateCount}, limit=${limit}, selected=${edges.length}`,
    );

    console.log(`[Semantic Threads] Found ${edges.length} CYAN threads`);
    return edges;
  } catch (error) {
    console.error("[Semantic Threads] Error in findCyanThreads:", error);
    return [];
  }
}
