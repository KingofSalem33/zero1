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

export { findAnchorVerse } from "./semanticSearch";

export interface Verse {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  similarity?: number;
}

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
  };
};

/**
 * Compute cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

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
  const strongCount =
    typeof signalThreshold === "number" && maxWeight > 0
      ? edgeWeights.filter((weight) => weight >= maxWeight * threshold).length
      : 0;

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
          },
        }
      : {}),
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
