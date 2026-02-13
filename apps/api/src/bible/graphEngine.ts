import { supabase } from "../db";
import { ENV } from "../env";
import { makeOpenAI } from "../ai";
import { ensureVersesHaveText } from "./verseText";
import { fetchAllEdges } from "./edgeFetchers";
import {
  buildMirrorLookup,
  fetchCentralityScores,
  type ChiasmStructure,
} from "./networkScience";
import { profileSpan, profileTime } from "../profiling/requestProfiler";
import type { VisualEdge } from "./types";
import { cosineSimilarity, type DbVerse } from "./mathUtils";

export { cosineSimilarity } from "./mathUtils";
export { findAnchorVerse } from "./semanticSearch";

export type Verse = DbVerse;

export interface LightContext {
  anchor: Verse;
  ring0: Verse[];
  connections: Verse[];
  metadata: {
    totalConnectionsFound: number;
    avgSimilarity: number;
    suggestTrace: boolean;
  };
}

export interface GravityConfig {
  edgeWeight: number;
  centralityWeight: number;
  chiasmCenterBonus: number;
  mirrorBonus: number;
  structuralEdgeWeight: number;
}

export const DEFAULT_GRAVITY: GravityConfig = {
  edgeWeight: 1,
  centralityWeight: 0.35,
  chiasmCenterBonus: 0.4,
  mirrorBonus: 0.25,
  structuralEdgeWeight: 0.96,
};

const DEFAULT_CROSS_PERICOPE_THRESHOLD = 0.9;

const DEFAULT_EDGE_OPTIONS = {
  includeDEEPER: true,
  includeROOTS: true,
  includeECHOES: true,
  includePROPHECY: true,
  includeGENEALOGY: true,
  includeDISCOVERED: true,
  useSemanticThreads: true,
};

const LIGHT_EDGE_OPTIONS = {
  includeDEEPER: true,
  includeROOTS: true,
  includeECHOES: true,
  includePROPHECY: false,
  includeGENEALOGY: false,
  includeDISCOVERED: true,
  useSemanticThreads: true,
};

type LayerResult = {
  ids: number[];
  edges: VisualEdge[];
  stats?: {
    maxScore: number;
    strongCount: number;
    threshold: number;
    strongSignalMass?: number;
    avgStrongScore?: number;
  };
};

export type HybridSelectionConfig = {
  mode: "gravity" | "hybrid";
  query?: string;
  queryWeight?: number;
  anchorEmbedding?: number[];
  anchorWeight?: number;
  versePoolSize?: number;
  pericopePoolSize?: number;
  pericopeMaxVerses?: number;
  strongPercentile?: number;
  centralityBonus?: number;
  minStrongSim?: number;
  edgeWeightBonus?: number;
  coherenceSourceIds?: number[];
  coherenceBonus?: number;
  diversityMaxPerBook?: number;
  edgeTypeBonuses?: Partial<Record<VisualEdge["type"], number>>;
  fallbackLimit?: number;
  maxNodes?: number;
  maxDepth?: number;
};

type PericopeConnectionRow = {
  source_pericope_id: number;
  target_pericope_id: number;
  connection_type: string;
  similarity_score: number;
};

const PERICOPE_EDGE_TYPE_MAP: Record<string, VisualEdge["type"]> = {
  NARRATIVE_PARALLEL: "NARRATIVE",
  THEMATIC_ECHO: "PATTERN",
  TYPE_ANTITYPE: "TYPOLOGY",
};

// cosineSimilarity re-exported from mathUtils above

export async function rankByQueryRelevance<T extends { id: number }>(
  items: T[],
  userQuery: string,
  options?: {
    logLabel?: string;
    profileLabel?: string;
  },
): Promise<{
  scoredCount: number;
  similarityMap: Map<number, number>;
}> {
  const profileLabel = options?.profileLabel ?? "rank_similarity";
  const logLabel = options?.logLabel;

  if (!items.length || !ENV.OPENAI_API_KEY) {
    if (logLabel) {
      console.log(`[${logLabel}] Skipping ranking (no items or no API key)`);
    }
    return { scoredCount: 0, similarityMap: new Map() };
  }

  if (logLabel) {
    console.log(
      `[${logLabel}] Ranking ${items.length} verses by similarity to query`,
    );
  }

  try {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("OpenAI client not configured");
    }

    const response = await profileTime(
      `${profileLabel}.embedding_query`,
      () =>
        client.embeddings.create({
          model: "text-embedding-3-small",
          input: userQuery,
          dimensions: 1536,
        }),
      {
        file: "bible/graphEngine.ts",
        fn: "rankByQueryRelevance",
        await: "client.embeddings.create",
        model: "text-embedding-3-small",
      },
    );
    const queryEmbedding = response.data[0].embedding;

    const ids = items.map((item) => item.id);
    const { data: verses, error } = await profileTime(
      `${profileLabel}.fetch_embeddings`,
      () => supabase.from("verses").select("id, embedding").in("id", ids),
      {
        file: "bible/graphEngine.ts",
        fn: "rankByQueryRelevance",
        await: "supabase.verses.select",
      },
    );

    if (error || !verses) {
      console.error(
        "[Relevance Ranking] Failed to fetch verse embeddings:",
        error,
      );
      return { scoredCount: 0, similarityMap: new Map() };
    }

    const embeddingMap = new Map<number, number[]>();
    for (const verse of verses) {
      if (verse.embedding) {
        try {
          const embedding =
            typeof verse.embedding === "string"
              ? JSON.parse(verse.embedding)
              : verse.embedding;
          embeddingMap.set(verse.id, embedding);
        } catch {
          console.error(
            `[Relevance Ranking] Failed to parse embedding for verse ${verse.id}`,
          );
        }
      }
    }

    let scoredCount = 0;
    const similarityMap = new Map<number, number>();
    const computeStart = process.hrtime.bigint();

    for (const item of items) {
      const verseEmbedding = embeddingMap.get(item.id);
      if (verseEmbedding) {
        const similarity = cosineSimilarity(queryEmbedding, verseEmbedding);
        similarityMap.set(item.id, similarity);
        (item as { similarity?: number }).similarity = similarity;
        scoredCount++;
      } else {
        similarityMap.set(item.id, 0);
        (item as { similarity?: number }).similarity = 0;
      }
    }

    profileSpan(
      `${profileLabel}.compute`,
      computeStart,
      process.hrtime.bigint(),
      {
        file: "bible/graphEngine.ts",
        fn: "rankByQueryRelevance",
        await: "cosineSimilarity",
      },
    );

    return { scoredCount, similarityMap };
  } catch (error) {
    console.error("[Relevance Ranking] Ranking failed:", error);
    return { scoredCount: 0, similarityMap: new Map() };
  }
}

export async function getQueryEmbedding(
  userQuery: string,
  profileLabel: string,
): Promise<number[] | null> {
  if (!ENV.OPENAI_API_KEY) return null;

  const client = makeOpenAI();
  if (!client) {
    return null;
  }

  const response = await profileTime(
    `${profileLabel}.embedding_query`,
    () =>
      client.embeddings.create({
        model: "text-embedding-3-small",
        input: userQuery,
        dimensions: 1536,
      }),
    {
      file: "bible/graphEngine.ts",
      fn: "getQueryEmbedding",
      await: "client.embeddings.create",
      model: "text-embedding-3-small",
    },
  );

  return response.data[0].embedding;
}

const buildVerseEmbeddingMap = async (
  ids: number[],
  profileLabel: string,
): Promise<Map<number, number[]>> => {
  if (ids.length === 0) return new Map();

  const { data: verses, error } = await profileTime(
    `${profileLabel}.fetch_embeddings`,
    () => supabase.from("verses").select("id, embedding").in("id", ids),
    {
      file: "bible/graphEngine.ts",
      fn: "buildVerseEmbeddingMap",
      await: "supabase.verses.select",
    },
  );

  if (error || !verses) {
    console.error("[Graph Engine] Failed to fetch verse embeddings:", error);
    return new Map();
  }

  const embeddingMap = new Map<number, number[]>();
  for (const verse of verses) {
    if (!verse.embedding) continue;
    try {
      const embedding =
        typeof verse.embedding === "string"
          ? JSON.parse(verse.embedding)
          : verse.embedding;
      embeddingMap.set(verse.id, embedding);
    } catch {
      console.error(
        `[Graph Engine] Failed to parse embedding for verse ${verse.id}`,
      );
    }
  }

  return embeddingMap;
};

const fetchVerseBooks = async (
  ids: number[],
  profileLabel: string,
): Promise<Map<number, string>> => {
  if (ids.length === 0) return new Map();

  const { data, error } = await profileTime(
    `${profileLabel}.fetch_books`,
    () => supabase.from("verses").select("id, book_abbrev").in("id", ids),
    {
      file: "bible/graphEngine.ts",
      fn: "fetchVerseBooks",
      await: "supabase.verses.select",
    },
  );

  if (error || !data) {
    console.warn("[Graph Engine] Failed to fetch verse books:", error);
    return new Map();
  }

  const bookMap = new Map<number, string>();
  (data as { id: number; book_abbrev: string }[]).forEach((row) => {
    if (row.book_abbrev) {
      bookMap.set(row.id, row.book_abbrev.toLowerCase());
    }
  });

  return bookMap;
};

const scoreVerseIdsByEmbedding = async (
  ids: number[],
  queryEmbedding: number[],
  profileLabel: string,
): Promise<Map<number, number>> => {
  const embeddingMap = await buildVerseEmbeddingMap(ids, profileLabel);
  const similarityMap = new Map<number, number>();

  ids.forEach((id) => {
    const verseEmbedding = embeddingMap.get(id);
    if (!verseEmbedding) {
      similarityMap.set(id, 0);
      return;
    }
    similarityMap.set(id, cosineSimilarity(queryEmbedding, verseEmbedding));
  });

  return similarityMap;
};

const scoreByEmbeddingMap = (
  ids: number[],
  embeddingMap: Map<number, number[]>,
  embedding: number[],
): Map<number, number> => {
  const similarityMap = new Map<number, number>();
  ids.forEach((id) => {
    const verseEmbedding = embeddingMap.get(id);
    if (!verseEmbedding) {
      similarityMap.set(id, 0);
      return;
    }
    similarityMap.set(id, cosineSimilarity(embedding, verseEmbedding));
  });
  return similarityMap;
};

const percentile = (scores: number[], p: number): number => {
  if (scores.length === 0) return 0;
  const sorted = [...scores].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx];
};

const fetchPericopeIdsForVerses = async (
  verseIds: number[],
): Promise<Map<number, number>> => {
  if (verseIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("verse_pericope_map")
    .select("verse_id, pericope_id")
    .in("verse_id", verseIds)
    .eq("source", ENV.PERICOPE_SOURCE || "SIL_AI");

  if (error || !data) {
    console.warn("[Graph Engine] Failed to load pericope mappings:", error);
    return new Map();
  }

  const mapping = new Map<number, number>();
  data.forEach((row) => {
    if (!mapping.has(row.verse_id)) {
      mapping.set(row.verse_id, row.pericope_id);
    }
  });

  return mapping;
};

const fetchPericopeNeighbors = async (
  pericopeIds: number[],
  limit: number,
): Promise<PericopeConnectionRow[]> => {
  if (pericopeIds.length === 0 || limit <= 0) return [];

  const { data, error } = await supabase
    .from("pericope_connections")
    .select(
      "source_pericope_id, target_pericope_id, connection_type, similarity_score",
    )
    .in("source_pericope_id", pericopeIds)
    .order("similarity_score", { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.warn("[Graph Engine] Failed to load pericope connections:", error);
    return [];
  }

  return data as PericopeConnectionRow[];
};

const searchPericopesByEmbedding = async (
  queryEmbedding: number[],
  limit: number,
  threshold: number,
): Promise<{ id: number; similarity: number }[]> => {
  if (limit <= 0) return [];

  const { data, error } = await supabase.rpc("search_pericopes_by_embedding", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: threshold,
    match_count: limit,
    embedding_type_filter: "full_text",
  });

  if (error || !data) {
    console.warn("[Graph Engine] Pericope search failed:", error);
    return [];
  }

  return (data as { pericope_id: number; similarity: number }[]).map((row) => ({
    id: row.pericope_id,
    similarity: row.similarity,
  }));
};

const fetchVerseIdsForPericopes = async (
  pericopeIds: number[],
  maxTotal: number,
): Promise<Array<{ verseId: number; pericopeId: number }>> => {
  if (pericopeIds.length === 0 || maxTotal <= 0) return [];

  const { data, error } = await supabase
    .from("verse_pericope_map")
    .select("verse_id, pericope_id, position_in_pericope")
    .in("pericope_id", pericopeIds)
    .eq("source", ENV.PERICOPE_SOURCE || "SIL_AI")
    .order("pericope_id", { ascending: true })
    .order("position_in_pericope", { ascending: true });

  if (error || !data) {
    console.warn("[Graph Engine] Failed to load pericope verse IDs:", error);
    return [];
  }

  const verseIds: Array<{ verseId: number; pericopeId: number }> = [];
  for (const row of data) {
    if (verseIds.length >= maxTotal) break;
    if (typeof row.verse_id === "number") {
      verseIds.push({ verseId: row.verse_id, pericopeId: row.pericope_id });
    }
  }

  return verseIds;
};

const buildStructuralEdges = (
  sourceIds: number[],
  structure: ChiasmStructure | null,
  gravity: GravityConfig,
): VisualEdge[] => {
  if (!structure || structure.verseIds.length === 0) {
    return [];
  }

  const sourceSet = new Set(sourceIds);
  const structureSet = new Set(structure.verseIds);
  const mirrorLookup = buildMirrorLookup(structure);
  const edges: VisualEdge[] = [];

  sourceSet.forEach((sourceId) => {
    if (!structureSet.has(sourceId)) return;

    const mirror = mirrorLookup.get(sourceId);
    if (mirror && mirror.id !== sourceId) {
      edges.push({
        from: sourceId,
        to: mirror.id,
        weight: gravity.structuralEdgeWeight,
        type: "PATTERN",
        metadata: {
          source: "structure",
          structureId: structure.id,
          mirror: true,
          label: mirror.label,
          mirrorLabel: mirror.mirrorLabel,
        },
      });
    }

    if (structure.centerId && structure.centerId !== sourceId) {
      edges.push({
        from: sourceId,
        to: structure.centerId,
        weight: Math.min(0.98, gravity.structuralEdgeWeight - 0.04),
        type: "PATTERN",
        metadata: {
          source: "structure",
          structureId: structure.id,
          center: true,
        },
      });
    }
  });

  return edges;
};

export async function fetchRing1Connections(
  sourceIds: number[],
  limit: number,
  excludeSet: Set<number>,
  gravity: GravityConfig,
  structure: ChiasmStructure | null,
  signalThreshold?: number,
  scope?: {
    allowedVerseIds?: Set<number>;
    crossThreshold?: number;
  },
  edgeOptions: Parameters<typeof fetchAllEdges>[1] = DEFAULT_EDGE_OPTIONS,
): Promise<LayerResult> {
  if (sourceIds.length === 0) {
    return { ids: [], edges: [] };
  }

  console.log(
    `[Graph Walker]   Fetching weighted neighbors from ${sourceIds.length} source vertices...`,
  );

  const baseEdges = await fetchAllEdges(sourceIds, edgeOptions);
  const structuralEdges = buildStructuralEdges(sourceIds, structure, gravity);
  const allEdges = [...baseEdges, ...structuralEdges];

  const sourceSet = new Set(sourceIds);
  const candidateIds = new Set<number>();
  const allowedVerseIds =
    scope?.allowedVerseIds && scope.allowedVerseIds.size > 0
      ? scope.allowedVerseIds
      : null;
  const crossThreshold =
    typeof scope?.crossThreshold === "number"
      ? scope.crossThreshold
      : DEFAULT_CROSS_PERICOPE_THRESHOLD;

  allEdges.forEach((edge) => {
    const fromIsSource = sourceSet.has(edge.from);
    const toIsSource = sourceSet.has(edge.to);
    if (!fromIsSource && !toIsSource) return;

    const targetId = fromIsSource ? edge.to : edge.from;
    if (excludeSet.has(targetId) || sourceSet.has(targetId)) return;

    const edgeWeight = typeof edge.weight === "number" ? edge.weight : 0.6;
    if (
      allowedVerseIds &&
      !allowedVerseIds.has(targetId) &&
      edgeWeight < crossThreshold
    ) {
      return;
    }

    candidateIds.add(targetId);
  });

  const centralityMap = await fetchCentralityScores([...candidateIds]);
  const mirrorLookup = structure ? buildMirrorLookup(structure) : new Map();

  const candidates = new Map<
    number,
    {
      score: number;
      bestEdge: VisualEdge;
      bestSource: number;
    }
  >();

  allEdges.forEach((edge) => {
    const fromIsSource = sourceSet.has(edge.from);
    const toIsSource = sourceSet.has(edge.to);
    if (!fromIsSource && !toIsSource) return;

    const sourceId = fromIsSource ? edge.from : edge.to;
    const targetId = fromIsSource ? edge.to : edge.from;
    if (excludeSet.has(targetId) || sourceSet.has(targetId)) return;

    const edgeWeight = typeof edge.weight === "number" ? edge.weight : 0.6;
    if (
      allowedVerseIds &&
      !allowedVerseIds.has(targetId) &&
      edgeWeight < crossThreshold
    ) {
      return;
    }
    const centrality = centralityMap.get(targetId) ?? 0.1;

    let score =
      edgeWeight * gravity.edgeWeight + centrality * gravity.centralityWeight;

    if (structure) {
      if (structure.centerId && targetId === structure.centerId) {
        score += gravity.chiasmCenterBonus;
      }
      const mirror = mirrorLookup.get(sourceId);
      if (mirror?.id === targetId) {
        score += gravity.mirrorBonus;
      }
    }

    const existing = candidates.get(targetId);
    if (!existing) {
      candidates.set(targetId, {
        score,
        bestEdge: edge,
        bestSource: sourceId,
      });
      return;
    }

    existing.score += edgeWeight * gravity.edgeWeight;
    if (edgeWeight > (existing.bestEdge.weight ?? 0)) {
      existing.bestEdge = edge;
      existing.bestSource = sourceId;
    }
  });

  const sorted = Array.from(candidates.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  const ids = sorted.map(([id]) => id);
  const edges = sorted.map(([id, info]) => ({
    from: info.bestSource,
    to: id,
    weight: info.bestEdge.weight ?? 0.6,
    type: info.bestEdge.type,
    metadata: {
      ...info.bestEdge.metadata,
      selectionScore: info.score,
      selectionType: "gravity",
    },
  }));

  const threshold = typeof signalThreshold === "number" ? signalThreshold : 0;
  const edgeWeights = sorted.map(([, info]) =>
    typeof info.bestEdge.weight === "number" ? info.bestEdge.weight : 0.6,
  );
  const maxWeight = edgeWeights.length > 0 ? Math.max(...edgeWeights) : 0;
  const strongWeights =
    typeof signalThreshold === "number" && maxWeight > 0
      ? edgeWeights.filter((weight) => weight >= maxWeight * threshold)
      : [];
  const strongCount = strongWeights.length;
  const strongSignalMass = strongWeights.reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const avgStrongScore = strongCount > 0 ? strongSignalMass / strongCount : 0;

  console.log(
    `[Graph Walker]   Weighted scoring: ${candidates.size} candidates, returning top ${ids.length}`,
  );

  return {
    ids,
    edges,
    ...(typeof signalThreshold === "number"
      ? {
          stats: {
            maxScore: maxWeight,
            strongCount,
            threshold,
            strongSignalMass,
            avgStrongScore,
          },
        }
      : {}),
  };
}

export async function fetchHybridLayer(
  sourceIds: number[],
  limit: number,
  excludeSet: Set<number>,
  queryEmbedding: number[],
  selection: HybridSelectionConfig,
  scope?: {
    allowedVerseIds?: Set<number>;
    crossThreshold?: number;
  },
  edgeOptions: Parameters<typeof fetchAllEdges>[1] = DEFAULT_EDGE_OPTIONS,
): Promise<LayerResult> {
  if (sourceIds.length === 0 || limit <= 0) {
    return { ids: [], edges: [] };
  }

  const versePoolSize = selection.versePoolSize ?? 100;
  const pericopePoolSize = selection.pericopePoolSize ?? 30;
  const pericopeMaxVerses = selection.pericopeMaxVerses ?? 300;
  const strongPercentile = selection.strongPercentile ?? 0.85;
  const centralityBonus = selection.centralityBonus ?? 0;
  const minStrongSim = selection.minStrongSim ?? 0;
  const edgeWeightBonus = selection.edgeWeightBonus ?? 0;
  const coherenceBonus = selection.coherenceBonus ?? 0;
  const coherenceSourceIds = selection.coherenceSourceIds ?? [];
  const diversityMaxPerBook = selection.diversityMaxPerBook ?? 0;
  const edgeTypeBonuses = selection.edgeTypeBonuses ?? {};
  const fallbackLimit = selection.fallbackLimit ?? 0;
  const anchorEmbedding = selection.anchorEmbedding;
  const anchorWeight = selection.anchorWeight ?? 0.9;
  const queryWeight = selection.queryWeight ?? 0.35;

  const sourceSet = new Set(sourceIds);
  const allowedVerseIds =
    scope?.allowedVerseIds && scope.allowedVerseIds.size > 0
      ? scope.allowedVerseIds
      : null;
  const crossThreshold =
    typeof scope?.crossThreshold === "number"
      ? scope.crossThreshold
      : DEFAULT_CROSS_PERICOPE_THRESHOLD;

  const baseEdges = await fetchAllEdges(sourceIds, edgeOptions);
  const coherenceSourceSet =
    coherenceSourceIds.length > 0 ? new Set(coherenceSourceIds) : null;
  const coherenceCounts = new Map<number, number>();
  if (coherenceSourceSet) {
    baseEdges.forEach((edge) => {
      const fromIn = coherenceSourceSet.has(edge.from);
      const toIn = coherenceSourceSet.has(edge.to);
      if (fromIn === toIn) return;
      const targetId = fromIn ? edge.to : edge.from;
      coherenceCounts.set(targetId, (coherenceCounts.get(targetId) ?? 0) + 1);
    });
  }

  type CandidateEdge = VisualEdge & { sourceId: number };
  const candidateEdgeMap = new Map<number, CandidateEdge>();
  const edgeCandidateIds = new Set<number>();

  baseEdges.forEach((edge) => {
    const fromIsSource = sourceSet.has(edge.from);
    const toIsSource = sourceSet.has(edge.to);
    if (!fromIsSource && !toIsSource) return;

    const sourceId = fromIsSource ? edge.from : edge.to;
    const targetId = fromIsSource ? edge.to : edge.from;
    if (excludeSet.has(targetId) || sourceSet.has(targetId)) return;

    const edgeWeight = typeof edge.weight === "number" ? edge.weight : 0.6;
    if (
      allowedVerseIds &&
      !allowedVerseIds.has(targetId) &&
      edgeWeight < crossThreshold
    ) {
      return;
    }

    edgeCandidateIds.add(targetId);
    const existing = candidateEdgeMap.get(targetId);
    if (!existing || edgeWeight > (existing.weight ?? 0)) {
      candidateEdgeMap.set(targetId, {
        ...edge,
        from: sourceId,
        to: targetId,
        weight: edgeWeight,
        sourceId,
      });
    }
  });

  const edgeCandidateList = Array.from(edgeCandidateIds);
  const edgeSimilarityMap =
    edgeCandidateList.length > 0
      ? await scoreVerseIdsByEmbedding(
          edgeCandidateList,
          queryEmbedding,
          "hybrid_ring.edge_pool",
        )
      : new Map<number, number>();

  const edgePoolIds = edgeCandidateList
    .sort(
      (a, b) =>
        (edgeSimilarityMap.get(b) ?? 0) - (edgeSimilarityMap.get(a) ?? 0),
    )
    .slice(0, versePoolSize);

  const pericopeMapping = await fetchPericopeIdsForVerses(sourceIds);
  const sourcePericopeIds = new Set<number>(pericopeMapping.values());
  const pericopeToSourceVerse = new Map<number, number>();
  sourceIds.forEach((id) => {
    const pericopeId = pericopeMapping.get(id);
    if (pericopeId && !pericopeToSourceVerse.has(pericopeId)) {
      pericopeToSourceVerse.set(pericopeId, id);
    }
  });

  const pericopeConnections = await fetchPericopeNeighbors(
    Array.from(sourcePericopeIds),
    pericopePoolSize * 3,
  );
  const pericopeConnectionByTarget = new Map<number, PericopeConnectionRow>();
  pericopeConnections.forEach((connection) => {
    if (sourcePericopeIds.has(connection.target_pericope_id)) return;
    const existing = pericopeConnectionByTarget.get(
      connection.target_pericope_id,
    );
    if (!existing || connection.similarity_score > existing.similarity_score) {
      pericopeConnectionByTarget.set(connection.target_pericope_id, connection);
    }
  });

  if (pericopeConnectionByTarget.size < pericopePoolSize) {
    const fallbackCount = pericopePoolSize - pericopeConnectionByTarget.size;
    const fallback = await searchPericopesByEmbedding(
      queryEmbedding,
      fallbackCount,
      0.5,
    );
    const fallbackSource = Array.from(sourcePericopeIds)[0];
    fallback.forEach((row) => {
      if (pericopeConnectionByTarget.size >= pericopePoolSize) return;
      if (sourcePericopeIds.has(row.id)) return;
      if (pericopeConnectionByTarget.has(row.id)) return;
      pericopeConnectionByTarget.set(row.id, {
        source_pericope_id: fallbackSource ?? row.id,
        target_pericope_id: row.id,
        connection_type: "THEMATIC_ECHO",
        similarity_score: row.similarity,
      });
    });
  }

  const pericopeCandidates = Array.from(pericopeConnectionByTarget.values())
    .sort((a, b) => b.similarity_score - a.similarity_score)
    .slice(0, pericopePoolSize);
  const pericopeIds = pericopeCandidates.map(
    (connection) => connection.target_pericope_id,
  );

  const pericopeVerseEntries = await fetchVerseIdsForPericopes(
    pericopeIds,
    pericopeMaxVerses,
  );

  const pericopeVerseIds = new Set<number>();
  pericopeVerseEntries.forEach((entry) => {
    if (excludeSet.has(entry.verseId) || sourceSet.has(entry.verseId)) {
      return;
    }

    const connection = pericopeConnectionByTarget.get(entry.pericopeId);
    const parentPericopeId = connection?.source_pericope_id;
    const parentVerseId = parentPericopeId
      ? pericopeToSourceVerse.get(parentPericopeId)
      : sourceIds[0];
    if (!parentVerseId) return;

    const edgeWeight =
      typeof connection?.similarity_score === "number"
        ? connection.similarity_score
        : 0.6;
    if (
      allowedVerseIds &&
      !allowedVerseIds.has(entry.verseId) &&
      edgeWeight < crossThreshold
    ) {
      return;
    }

    pericopeVerseIds.add(entry.verseId);
    const edgeType =
      connection?.connection_type &&
      PERICOPE_EDGE_TYPE_MAP[connection.connection_type]
        ? PERICOPE_EDGE_TYPE_MAP[connection.connection_type]
        : "DEEPER";

    const existing = candidateEdgeMap.get(entry.verseId);
    if (!existing || edgeWeight > (existing.weight ?? 0)) {
      candidateEdgeMap.set(entry.verseId, {
        from: parentVerseId,
        to: entry.verseId,
        weight: edgeWeight,
        type: edgeType,
        sourceId: parentVerseId,
        metadata: {
          source: "pericope_connection",
          connection_type: connection?.connection_type,
        },
      });
    }
  });

  const candidateIds = new Set<number>(edgePoolIds);
  pericopeVerseIds.forEach((id) => candidateIds.add(id));
  if (allowedVerseIds) {
    Array.from(candidateIds).forEach((id) => {
      if (allowedVerseIds.has(id)) return;
      const candidateEdge = candidateEdgeMap.get(id);
      const edgeWeight =
        typeof candidateEdge?.weight === "number" ? candidateEdge.weight : 0;
      if (edgeWeight < crossThreshold) {
        candidateIds.delete(id);
      }
    });
  }

  const candidateList = Array.from(candidateIds);
  if (candidateList.length === 0) {
    return {
      ids: [],
      edges: [],
      stats: {
        maxScore: 0,
        strongCount: 0,
        threshold: 0,
        strongSignalMass: 0,
        avgStrongScore: 0,
      },
    };
  }

  const embeddingMap = await buildVerseEmbeddingMap(
    candidateList,
    "hybrid_ring.candidate_scores",
  );
  const similarityMap = scoreByEmbeddingMap(
    candidateList,
    embeddingMap,
    queryEmbedding,
  );
  const anchorSimMap = anchorEmbedding
    ? scoreByEmbeddingMap(candidateList, embeddingMap, anchorEmbedding)
    : new Map<number, number>();

  const centralityMap =
    centralityBonus > 0
      ? await fetchCentralityScores(candidateList)
      : new Map<number, number>();
  const maxCoherence =
    coherenceCounts.size > 0 ? Math.max(...coherenceCounts.values()) : 0;

  const scoredCandidates = candidateList
    .map((id) => {
      const similarity = similarityMap.get(id) ?? 0;
      const anchorSimilarity = anchorSimMap.get(id) ?? 0;
      const centrality = centralityMap.get(id) ?? 0.1;
      const edge = candidateEdgeMap.get(id);
      const edgeWeight = typeof edge?.weight === "number" ? edge.weight : 0;
      const edgeTypeBonus = edge?.type ? (edgeTypeBonuses[edge.type] ?? 0) : 0;
      const coherenceScore =
        coherenceBonus > 0 && maxCoherence > 0
          ? ((coherenceCounts.get(id) ?? 0) / maxCoherence) * coherenceBonus
          : 0;
      const priority =
        similarity * queryWeight +
        anchorSimilarity * anchorWeight +
        centrality * centralityBonus +
        edgeWeight * edgeWeightBonus +
        edgeTypeBonus +
        coherenceScore;
      return { id, similarity, anchorSimilarity, priority };
    })
    .sort((a, b) => b.priority - a.priority);

  const primaryScores = scoredCandidates.map((candidate) =>
    anchorEmbedding ? candidate.anchorSimilarity : candidate.similarity,
  );
  const percentileThreshold = percentile(primaryScores, strongPercentile);
  const threshold = Math.max(percentileThreshold, minStrongSim);
  const strongCandidates = scoredCandidates.filter((candidate) =>
    anchorEmbedding
      ? candidate.anchorSimilarity >= threshold
      : candidate.similarity >= threshold,
  );
  const strongCount = strongCandidates.length;
  const strongSignalMass = strongCandidates.reduce((sum, candidate) => {
    const score = anchorEmbedding
      ? candidate.anchorSimilarity
      : candidate.similarity;
    return sum + score;
  }, 0);
  const avgStrongScore = strongCount > 0 ? strongSignalMass / strongCount : 0;
  const targetCount = Math.min(limit, strongCount);

  let selectedCandidates: Array<{
    id: number;
    similarity: number;
    anchorSimilarity: number;
    priority: number;
  }> = [];

  if (strongCount === 0 && fallbackLimit > 0) {
    const fallbackCount = Math.min(
      limit,
      fallbackLimit,
      scoredCandidates.length,
    );
    selectedCandidates = scoredCandidates.slice(0, fallbackCount);
  } else if (diversityMaxPerBook > 0 && targetCount > 0) {
    const bookMap = await fetchVerseBooks(
      strongCandidates.map((candidate) => candidate.id),
      "hybrid_ring.diversity",
    );
    const bookCounts = new Map<string, number>();
    for (const candidate of strongCandidates) {
      if (selectedCandidates.length >= targetCount) break;
      const book = bookMap.get(candidate.id) ?? "unknown";
      const current = bookCounts.get(book) ?? 0;
      if (current >= diversityMaxPerBook) continue;
      bookCounts.set(book, current + 1);
      selectedCandidates.push(candidate);
    }

    if (selectedCandidates.length < targetCount) {
      for (const candidate of strongCandidates) {
        if (selectedCandidates.length >= targetCount) break;
        if (selectedCandidates.find((entry) => entry.id === candidate.id)) {
          continue;
        }
        selectedCandidates.push(candidate);
      }
    }
  } else {
    selectedCandidates = strongCandidates.slice(0, targetCount);
  }

  const ids = selectedCandidates.map((candidate) => candidate.id);
  const edges = selectedCandidates.map((candidate) => {
    const bestEdge = candidateEdgeMap.get(candidate.id);
    return {
      from: bestEdge?.sourceId ?? bestEdge?.from ?? sourceIds[0],
      to: candidate.id,
      weight: bestEdge?.weight ?? 0.6,
      type: bestEdge?.type ?? "DEEPER",
      metadata: {
        ...bestEdge?.metadata,
        selectionScore: candidate.priority,
        selectionType: "hybrid",
        similarity: candidate.similarity,
        anchorSimilarity: candidate.anchorSimilarity,
      },
    };
  });

  const maxScore = primaryScores.length > 0 ? Math.max(...primaryScores) : 0;

  console.log(
    `[Hybrid Selection] pool verses=${edgePoolIds.length}, pericopes=${pericopeCandidates.length}, candidates=${candidateList.length}, selected=${ids.length}, p${Math.round(
      strongPercentile * 100,
    )}=${threshold.toFixed(3)}, strong=${strongCount}, signal=${strongSignalMass.toFixed(2)}`,
  );

  if (strongCount === 0 && selectedCandidates.length === 0) {
    return {
      ids: [],
      edges: [],
      stats: {
        maxScore,
        strongCount,
        threshold,
        strongSignalMass,
        avgStrongScore,
      },
    };
  }

  return {
    ids,
    edges,
    stats: {
      maxScore,
      strongCount,
      threshold,
      strongSignalMass,
      avgStrongScore,
    },
  };
}

const fetchVersesByIds = async (ids: number[]): Promise<Verse[]> => {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("verses")
    .select("*")
    .in("id", ids);

  if (error) {
    console.error("[Graph Engine] Error hydrating verses:", error);
    return [];
  }

  const verses = (data as Verse[]) || [];
  return ensureVersesHaveText(verses, "graph-engine:hydrate");
};

export function shouldSuggestTraceMode(
  prompt: string,
  connectionCount: number,
  threshold: number = 15,
): boolean {
  const traceKeywords = [
    "trace",
    "map",
    "thread",
    "genealogy",
    "lineage",
    "connections",
    "typology",
    "fulfillment",
    "pattern",
    "from",
    "connect",
    "show me how",
  ];

  const lowerPrompt = prompt.toLowerCase();
  const hasTraceIntent = traceKeywords.some((kw) => lowerPrompt.includes(kw));
  const isComplex = connectionCount > threshold;

  return hasTraceIntent || isComplex;
}

export async function buildLightContext(
  anchorId: number,
  userQuery: string,
  options?: {
    ring0Radius?: number;
    limit?: number;
    candidateLimit?: number;
    edgeOptions?: Parameters<typeof fetchAllEdges>[1];
    suggestTraceThreshold?: number;
  },
): Promise<LightContext> {
  const ring0Radius = options?.ring0Radius ?? 3;
  const limit = options?.limit ?? 7;
  const candidateLimit = options?.candidateLimit ?? Math.max(limit * 3, 12);
  const edgeOptions = options?.edgeOptions ?? LIGHT_EDGE_OPTIONS;

  console.log(`[Graph Engine] Building light context for verse ID ${anchorId}`);

  const { data: ring0Data, error: ring0Error } = await supabase
    .from("verses")
    .select("*")
    .gte("id", anchorId - ring0Radius)
    .lte("id", anchorId + ring0Radius)
    .order("id", { ascending: true });

  if (ring0Error) {
    console.error("[Graph Engine] Ring 0 fetch failed:", ring0Error);
    throw new Error(`Failed to fetch Ring 0: ${ring0Error.message}`);
  }

  const ring0 = await ensureVersesHaveText(
    ring0Data as Verse[],
    "graph-engine:ring0",
  );
  const anchor = ring0.find((v) => v.id === anchorId);

  if (!anchor) {
    throw new Error(`Anchor verse ID ${anchorId} not found`);
  }

  const ring0Ids = ring0.map((v) => v.id);
  const ring1Layer = await fetchRing1Connections(
    ring0Ids,
    candidateLimit,
    new Set(ring0Ids),
    DEFAULT_GRAVITY,
    null,
    undefined,
    undefined,
    edgeOptions,
  );

  const allConnections = await fetchVersesByIds(ring1Layer.ids);

  await rankByQueryRelevance(allConnections, userQuery, {
    logLabel: "Light Context Ranking",
    profileLabel: "light_context_rank",
  });

  const rankedConnections = [...allConnections].sort(
    (a, b) => (b.similarity || 0) - (a.similarity || 0),
  );
  const topConnections = rankedConnections.slice(0, limit);

  const avgSimilarity =
    topConnections.length > 0
      ? topConnections.reduce((sum, v) => sum + (v.similarity || 0), 0) /
        topConnections.length
      : 0;

  const suggestTrace = shouldSuggestTraceMode(
    userQuery,
    ring1Layer.ids.length,
    options?.suggestTraceThreshold,
  );

  return {
    anchor,
    ring0,
    connections: topConnections,
    metadata: {
      totalConnectionsFound: ring1Layer.ids.length,
      avgSimilarity,
      suggestTrace,
    },
  };
}
