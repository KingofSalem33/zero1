/**
 * Graph Walker: Adaptive Expansion for Expanding Ring Architecture
 *
 * This module walks the Bible cross-reference graph using breadth-first search
 * with hard caps to prevent data explosion.
 *
 * Architecture:
 * - Ring 0: Anchor verse ± 3 verses (immediate context)
 * - Ring 1: Start with a small set (default 3) and score for signal
 * - Ring 2: Expand based on strong connections from Ring 1
 * - Ring 3: Expand based on strong connections from Ring 2
 */

import { supabase } from "../db";
import { ENV } from "../env";
import { matchConcept } from "./conceptMapping";
import { parseExplicitReference } from "./referenceParser";
import { searchVersesByQuery } from "./semanticSearch";
import { getTestament } from "./testamentUtil";
import { ensureVersesHaveText } from "./verseText";
import { fetchAllEdges } from "./edgeFetchers";
import { getPericopeForVerse } from "./pericopeSearch";
import { BOOK_NAMES } from "./bookNames";
import {
  DEFAULT_GRAVITY,
  fetchHybridLayer,
  fetchRing1Connections,
  getQueryEmbedding,
  type GravityConfig,
  type HybridSelectionConfig,
} from "./graphEngine";
import {
  buildMirrorPairs,
  buildMirrorLookup,
  fetchCentralityScores,
  fetchChiasmStructureForVerse,
  type ChiasmStructure,
} from "./networkScience";

type EdgeType = import("./types").EdgeType;

const PERICOPE_VALIDATION = {
  verseWeight: 0.65,
  pericopeWeight: 0.35,
  minSimilarity: 0.35,
};

const PERICOPE_VALIDATION_EXCLUDE = new Set<EdgeType>([
  "GENEALOGY",
  "NARRATIVE",
]);

const CROSS_PERICOPE_RELAXED_MIN = 0.2;
const CROSS_PERICOPE_OVERRIDE_WEIGHT = 0.9;
const CROSS_PERICOPE_ALLOWLIST = new Set<EdgeType>([
  "ECHOES",
  "PROPHECY",
  "FULFILLMENT",
  "TYPOLOGY",
  "PATTERN",
  "CONTRAST",
  "PROGRESSION",
]);

const UNDIRECTED_EDGE_TYPES = new Set<EdgeType>(["CONTRAST", "PATTERN"]);

const EDGE_SOURCE_WEIGHTS: Record<string, number> = {
  canonical: 1.1,
  llm: 0.95,
  semantic_thread: 0.9,
  pericope_connection: 1.05,
  structure: 1.05,
};

const MIN_ADDITIONAL_EDGE_WEIGHT = 0.25;

export interface Verse {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface ContextBundle {
  anchor: Verse;
  ring0: Verse[]; // Surrounding passage (±3 verses)
  ring1: Verse[]; // Direct cross-refs
  ring2: Verse[]; // Refs of refs
  ring3: Verse[]; // Deep links
  ring1Edges?: import("./types").VisualEdge[];
  ring2Edges?: import("./types").VisualEdge[];
  ring3Edges?: import("./types").VisualEdge[];
  structure?: ChiasmStructure | null;
}

export interface RingConfig {
  ring0Radius: number; // How many verses before/after anchor (default: 3)
  ring1Limit: number; // Max direct refs (cap)
  ring2Limit: number; // Max secondary refs (cap)
  ring3Limit: number; // Max tertiary refs (cap)
  gravity?: Partial<GravityConfig>;
  selection?: HybridSelectionConfig;
  adaptive?: {
    enabled?: boolean;
    startLimit?: number;
    minLimit?: number;
    multiplier?: number;
    signalThreshold?: number;
  };
  scope?: {
    pericopeIds?: number[];
    allowedVerseIds?: Set<number>;
    crossThreshold?: number;
  };
}

const DEFAULT_CONFIG: RingConfig = {
  ring0Radius: 3,
  ring1Limit: 20,
  ring2Limit: 30,
  ring3Limit: 40,
  adaptive: {
    enabled: true,
    startLimit: 3,
    minLimit: 2,
    multiplier: 2,
    signalThreshold: 0.8,
  },
};

const normalizeConceptReference = (reference: string): string =>
  reference.replace(/^Psalm\b/i, "Psalms");

const fetchVerseIdsForPericopes = async (
  pericopeIds: number[],
  source: string,
): Promise<Set<number>> => {
  if (pericopeIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("verse_pericope_map")
    .select("verse_id")
    .in("pericope_id", pericopeIds)
    .eq("source", source);

  if (error || !data) {
    console.warn(
      "[Graph Walker] Failed to load pericope scope verse IDs:",
      error?.message,
    );
    return new Set();
  }

  const verseIds = new Set<number>();
  data.forEach((row) => {
    if (typeof row.verse_id === "number") {
      verseIds.add(row.verse_id);
    }
  });
  return verseIds;
};

const fetchVerseByReference = async (
  bookAbbrev: string,
  chapter: number,
  verse: number,
): Promise<Verse | null> => {
  const { data, error } = await supabase
    .from("verses")
    .select("id, book_abbrev, book_name, chapter, verse, text")
    .eq("book_abbrev", bookAbbrev)
    .eq("chapter", chapter)
    .eq("verse", verse)
    .single();

  if (error || !data) {
    console.error(
      `[Graph Walker] Bridge verse lookup failed: ${bookAbbrev} ${chapter}:${verse}`,
      error,
    );
    return null;
  }

  const ensured = await ensureVersesHaveText(
    [data as Verse],
    "graph-walker:bridge",
  );

  return ensured[0] ?? null;
};

const findBridgeVerses = async (
  anchor: Verse,
  existingIds: Set<number>,
): Promise<Verse[]> => {
  const bridges: Verse[] = [];
  const anchorTestament = getTestament(anchor.book_abbrev.toLowerCase());

  const conceptRef = matchConcept(anchor.text);
  if (conceptRef) {
    const parsed = parseExplicitReference(
      normalizeConceptReference(conceptRef),
    );
    if (parsed && getTestament(parsed.book) !== anchorTestament) {
      const conceptVerse = await fetchVerseByReference(
        parsed.book,
        parsed.chapter,
        parsed.verse,
      );
      if (conceptVerse && !existingIds.has(conceptVerse.id)) {
        bridges.push(conceptVerse);
        existingIds.add(conceptVerse.id);
      }
    }
  }

  if (bridges.length >= 2 || !ENV.OPENAI_API_KEY) {
    return bridges;
  }

  try {
    const results = await searchVersesByQuery(anchor.text, 6, 0.5);
    for (const result of results) {
      if (bridges.length >= 2) break;
      if (existingIds.has(result.id)) continue;
      const testament = getTestament(result.book_abbrev.toLowerCase());
      if (testament === anchorTestament) continue;
      bridges.push({
        id: result.id,
        book_abbrev: result.book_abbrev,
        book_name: result.book_name,
        chapter: result.chapter,
        verse: result.verse,
        text: result.text,
      });
      existingIds.add(result.id);
    }
  } catch (error) {
    console.error("[Graph Walker] Bridge semantic search failed:", error);
  }

  return await ensureVersesHaveText(bridges, "graph-walker:bridge");
};

const buildNarrativeEdges = (
  nodes: import("./types").ThreadNode[],
  existingEdges: import("./types").VisualEdge[],
): import("./types").VisualEdge[] => {
  const existingPairs = new Set<string>();
  existingEdges.forEach((edge) => {
    existingPairs.add(`${edge.from}->${edge.to}`);
    existingPairs.add(`${edge.to}->${edge.from}`);
  });

  const nodesByChapter = new Map<string, import("./types").ThreadNode[]>();
  nodes.forEach((node) => {
    const key = `${node.book_abbrev}|${node.chapter}`;
    const group = nodesByChapter.get(key) || [];
    group.push(node);
    nodesByChapter.set(key, group);
  });

  const narrativeEdges: import("./types").VisualEdge[] = [];

  nodesByChapter.forEach((group) => {
    group.sort((a, b) => a.verse - b.verse);
    for (let i = 0; i < group.length - 1; i++) {
      const current = group[i];
      const next = group[i + 1];
      if (next.verse !== current.verse + 1) continue;

      const edgeKey = `${current.id}->${next.id}`;
      if (existingPairs.has(edgeKey)) continue;

      narrativeEdges.push({
        from: current.id,
        to: next.id,
        weight: 0.2,
        type: "NARRATIVE",
        metadata: {
          thread: "narrative",
        },
      });
      existingPairs.add(edgeKey);
      existingPairs.add(`${next.id}->${current.id}`);
    }
  });

  return narrativeEdges;
};

/**
 * Build context bundle using budgeted BFS graph traversal
 */
export async function buildContextBundle(
  anchorId: number,
  config: Partial<RingConfig> = {},
): Promise<ContextBundle> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const adaptive = cfg.adaptive;
  const selection = cfg.selection;
  const clampLimit = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const scopeConfig = cfg.scope;
  let scopedVerseIds: Set<number> | null = null;

  if (scopeConfig?.allowedVerseIds && scopeConfig.allowedVerseIds.size > 0) {
    scopedVerseIds = scopeConfig.allowedVerseIds;
  } else if (scopeConfig?.pericopeIds && scopeConfig.pericopeIds.length > 0) {
    scopedVerseIds = await fetchVerseIdsForPericopes(
      scopeConfig.pericopeIds,
      ENV.PERICOPE_SOURCE || "SIL_AI",
    );
  }

  const scope =
    scopedVerseIds && scopedVerseIds.size > 0
      ? {
          allowedVerseIds: scopedVerseIds,
          crossThreshold: scopeConfig?.crossThreshold,
        }
      : undefined;

  console.log(
    `[Graph Walker] Building context bundle for verse ID ${anchorId}`,
  );
  console.log(`[Graph Walker] Config:`, cfg);
  if (scope?.allowedVerseIds) {
    console.log(
      `[Graph Walker] Scoped to ${scope.allowedVerseIds.size} verse IDs`,
    );
  }

  // ========================================
  // RING 0: Anchor + Surrounding Context
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 0 (±${cfg.ring0Radius} verses)...`);

  const { data: ring0Data, error: ring0Error } = await supabase
    .from("verses")
    .select("*")
    .gte("id", anchorId - cfg.ring0Radius)
    .lte("id", anchorId + cfg.ring0Radius)
    .order("id", { ascending: true });

  if (ring0Error) {
    console.error("[Graph Walker] Ring 0 fetch failed:", ring0Error);
    throw new Error(`Failed to fetch Ring 0: ${ring0Error.message}`);
  }

  const ring0 = await ensureVersesHaveText(
    ring0Data as Verse[],
    "graph-walker:ring0",
  );
  const anchor = ring0.find((v) => v.id === anchorId);

  if (!anchor) {
    throw new Error(`Anchor verse ID ${anchorId} not found`);
  }

  const ring0Scoped = ring0.filter(
    (verse) => verse.book_abbrev === anchor.book_abbrev,
  );

  console.log(`[Graph Walker] Ring 0: ${ring0Scoped.length} verses`);
  console.log(
    `[Graph Walker] Anchor: ${anchor.book_name} ${anchor.chapter}:${anchor.verse}`,
  );

  // Extract IDs for next layer
  const ring0Ids = ring0Scoped.map((v) => v.id);

  const gravity = { ...DEFAULT_GRAVITY, ...(cfg.gravity ?? {}) };
  const structure = await fetchChiasmStructureForVerse(anchorId);
  const isHybridRequested =
    selection?.mode === "hybrid" && typeof selection.query === "string";
  const maxDepth =
    typeof selection?.maxDepth === "number" ? selection.maxDepth : undefined;
  const maxNodes =
    typeof selection?.maxNodes === "number" ? selection.maxNodes : undefined;
  let queryEmbedding: number[] | null = null;
  let anchorEmbedding: number[] | null = null;

  if (structure) {
    console.log(
      `[Graph Walker] Structural lens: ${structure.type ?? "chiasm"} ${structure.id} (${structure.verseIds.length} verses)`,
    );
  }

  if (isHybridRequested) {
    const queryText = selection?.query?.trim();
    if (queryText) {
      queryEmbedding = await getQueryEmbedding(
        queryText,
        "graph_walker.hybrid",
      );
    }
    if (!queryEmbedding) {
      console.warn(
        "[Graph Walker] Hybrid selection requested but query embedding unavailable. Falling back to gravity scoring.",
      );
    }
  }

  const useHybrid = isHybridRequested && !!queryEmbedding;
  if (useHybrid) {
    anchorEmbedding = await fetchVerseEmbedding(anchorId);
  }
  const selectionWithAnchor = selection
    ? {
        ...selection,
        anchorEmbedding: anchorEmbedding ?? selection.anchorEmbedding,
      }
    : selection;
  const selectionForRing1 =
    selectionWithAnchor && ring0Ids.length > 0
      ? {
          ...selectionWithAnchor,
          coherenceSourceIds: ring0Ids,
        }
      : selectionWithAnchor;

  // ========================================
  // RING 1: Direct Cross-References
  // ========================================
  const adaptiveEnabled = !!adaptive?.enabled;
  const adaptiveThreshold =
    typeof adaptive?.signalThreshold === "number"
      ? adaptive.signalThreshold
      : 0.8;
  const adaptiveMultiplier =
    typeof adaptive?.multiplier === "number" ? adaptive.multiplier : 2;
  const adaptiveMin =
    typeof adaptive?.minLimit === "number" ? adaptive.minLimit : 2;
  const adaptiveStart =
    typeof adaptive?.startLimit === "number" ? adaptive.startLimit : 3;

  let ring1Limit = cfg.ring1Limit;
  let ring2Limit = cfg.ring2Limit;
  let ring3Limit = cfg.ring3Limit;
  let totalNodes = 1;

  if (adaptiveEnabled) {
    ring1Limit = clampLimit(adaptiveStart, adaptiveMin, cfg.ring1Limit);
  }

  if (typeof maxDepth === "number" && maxDepth < 1) {
    ring1Limit = 0;
    ring2Limit = 0;
    ring3Limit = 0;
  }

  if (typeof maxNodes === "number") {
    const remaining = Math.max(maxNodes - totalNodes, 0);
    ring1Limit = Math.min(ring1Limit, remaining);
    if (remaining <= 0) {
      ring2Limit = 0;
      ring3Limit = 0;
    }
  }

  console.log(`[Graph Walker] Fetching Ring 1 (max ${ring1Limit})...`);

  const ring1Layer = useHybrid
    ? await fetchHybridLayer(
        ring0Ids,
        ring1Limit,
        new Set(ring0Ids),
        queryEmbedding!,
        selectionForRing1!,
        scope,
      )
    : await fetchRing1Connections(
        ring0Ids,
        ring1Limit,
        new Set(ring0Ids),
        gravity,
        structure,
        adaptiveEnabled ? adaptiveThreshold : undefined,
        scope,
      );
  const ring1Ids = ring1Layer.ids;
  let ring1 = await hydrateVerses(ring1Ids);
  let ring1Edges = ring1Layer.edges;

  console.log(`[Graph Walker] Ring 1: ${ring1.length} verses`);
  totalNodes += ring1Ids.length;

  // ========================================
  // RING 2: References of References
  // ========================================
  if (adaptiveEnabled) {
    const strongCount = ring1Layer.stats?.strongCount ?? 0;
    const signalMass = ring1Layer.stats?.strongSignalMass ?? strongCount;
    if (signalMass <= 0) {
      ring2Limit = 0;
      ring3Limit = 0;
    } else {
      ring2Limit = clampLimit(
        Math.round(signalMass * adaptiveMultiplier),
        adaptiveMin,
        cfg.ring2Limit,
      );
    }
    const adaptiveLabel = ring1Layer.stats?.threshold ?? adaptiveThreshold;
    console.log(
      `[Graph Walker] Adaptive Ring 2 limit set to ${ring2Limit} (strong: ${strongCount}, signal: ${signalMass.toFixed(2)}, threshold: ${adaptiveLabel})`,
    );
  }

  if (typeof maxDepth === "number" && maxDepth < 2) {
    ring2Limit = 0;
    ring3Limit = 0;
  }

  if (typeof maxNodes === "number") {
    const remaining = Math.max(maxNodes - totalNodes, 0);
    ring2Limit = Math.min(ring2Limit, remaining);
    if (remaining <= 0) {
      ring2Limit = 0;
      ring3Limit = 0;
    }
  }

  console.log(`[Graph Walker] Fetching Ring 2 (max ${ring2Limit})...`);

  const excludeSet = new Set([...ring0Ids, ...ring1Ids]);
  const ring2Layer =
    ring2Limit > 0
      ? useHybrid
        ? await fetchHybridLayer(
            ring1Ids,
            ring2Limit,
            excludeSet,
            queryEmbedding!,
            selectionWithAnchor!,
            scope,
          )
        : await fetchRing1Connections(
            ring1Ids,
            ring2Limit,
            excludeSet,
            gravity,
            structure,
            adaptiveEnabled ? adaptiveThreshold : undefined,
            scope,
          )
      : { ids: [], edges: [] };
  const ring2Ids = ring2Layer.ids;
  const ring2 = await hydrateVerses(ring2Ids);
  const ring2Edges = ring2Layer.edges;

  console.log(`[Graph Walker] Ring 2: ${ring2.length} verses`);
  totalNodes += ring2Ids.length;

  // ========================================
  // RING 3: Deep Thematic Links
  // ========================================
  if (adaptiveEnabled && ring3Limit > 0) {
    const strongCount = ring2Layer.stats?.strongCount ?? 0;
    const signalMass = ring2Layer.stats?.strongSignalMass ?? strongCount;
    if (signalMass <= 0) {
      ring3Limit = 0;
    } else {
      ring3Limit = clampLimit(
        Math.round(signalMass * adaptiveMultiplier),
        adaptiveMin,
        cfg.ring3Limit,
      );
    }
    const adaptiveLabel = ring2Layer.stats?.threshold ?? adaptiveThreshold;
    console.log(
      `[Graph Walker] Adaptive Ring 3 limit set to ${ring3Limit} (strong: ${strongCount}, signal: ${signalMass.toFixed(2)}, threshold: ${adaptiveLabel})`,
    );
  }

  if (typeof maxDepth === "number" && maxDepth < 3) {
    ring3Limit = 0;
  }

  if (typeof maxNodes === "number") {
    const remaining = Math.max(maxNodes - totalNodes, 0);
    ring3Limit = Math.min(ring3Limit, remaining);
    if (remaining <= 0) {
      ring3Limit = 0;
    }
  }

  console.log(`[Graph Walker] Fetching Ring 3 (max ${ring3Limit})...`);

  ring2Ids.forEach((id) => excludeSet.add(id));
  const ring3Layer =
    ring3Limit > 0
      ? useHybrid
        ? await fetchHybridLayer(
            ring2Ids,
            ring3Limit,
            excludeSet,
            queryEmbedding!,
            selectionWithAnchor!,
            scope,
          )
        : await fetchRing1Connections(
            ring2Ids,
            ring3Limit,
            excludeSet,
            gravity,
            structure,
            adaptiveEnabled ? adaptiveThreshold : undefined,
            scope,
          )
      : { ids: [], edges: [] };
  const ring3Ids = ring3Layer.ids;
  const ring3 = await hydrateVerses(ring3Ids);
  const ring3Edges = ring3Layer.edges;

  console.log(`[Graph Walker] Ring 3: ${ring3.length} verses`);

  // ========================================
  // Bridge Verses: Cross-testament continuity
  // ========================================
  const existingIds = new Set([
    ...ring0Ids,
    ...ring1Ids,
    ...ring2Ids,
    ...ring3Ids,
  ]);
  const bridgeVerses = await findBridgeVerses(anchor, existingIds);
  const scopedBridges =
    scope?.allowedVerseIds && scope.allowedVerseIds.size > 0
      ? bridgeVerses.filter((verse) => scope.allowedVerseIds!.has(verse.id))
      : bridgeVerses;
  if (scopedBridges.length > 0) {
    ring1 = [...ring1, ...scopedBridges];
    const bridgeEdges = scopedBridges.map((verse) => ({
      from: anchor.id,
      to: verse.id,
      weight: 0.72,
      type: "ECHOES" as const,
      metadata: {
        source: "bridge",
      },
    }));
    ring1Edges = [...ring1Edges, ...bridgeEdges];
    console.log(
      `[Graph Walker] Added ${scopedBridges.length} bridge verse(s) for ${anchor.book_name} ${anchor.chapter}:${anchor.verse}`,
    );
  }

  // ========================================
  // Summary
  // ========================================
  const totalVerses = ring0.length + ring1.length + ring2.length + ring3.length;
  console.log(`[Graph Walker] Bundle complete: ${totalVerses} total verses`);
  console.log(
    `[Graph Walker] Breakdown: R0=${ring0.length}, R1=${ring1.length}, R2=${ring2.length}, R3=${ring3.length}`,
  );

  return {
    anchor,
    ring0: ring0Scoped,
    ring1,
    ring2,
    ring3,
    ring1Edges,
    ring2Edges,
    ring3Edges,
    structure,
  };
}

/**
 * Hydrate verse IDs into full Verse objects
 */
async function hydrateVerses(ids: number[]): Promise<Verse[]> {
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("verses")
    .select("*")
    .in("id", ids);

  if (error) {
    console.error("[Graph Walker] Error hydrating verses:", error);
    return [];
  }

  const verses = (data as Verse[]) || [];
  return await ensureVersesHaveText(verses, "graph-walker:hydrate");
}

/**
 * Get verse ID by reference (book, chapter, verse)
 */
export async function getVerseId(
  book: string,
  chapter: number,
  verse: number,
): Promise<number | null> {
  console.log(
    `[Graph Walker] getVerseId: book="${book}", ch=${chapter}, v=${verse}`,
  );

  const { data, error } = await supabase
    .from("verses")
    .select("id")
    .eq("book_abbrev", book.toLowerCase())
    .eq("chapter", chapter)
    .eq("verse", verse)
    .single();

  if (error) {
    console.error(`[Graph Walker] getVerseId ERROR:`, error);
    return null;
  }

  if (!data) {
    console.error(
      `[Graph Walker] getVerseId: No data returned for ${book} ${chapter}:${verse}`,
    );
    return null;
  }

  console.log(
    `[Graph Walker] getVerseId: Found ID ${data.id} for ${book} ${chapter}:${verse}`,
  );
  return data.id;
}

/**
 * Format verse reference as string
 */
export function formatVerseRef(verse: Verse): string {
  return `${verse.book_name} ${verse.chapter}:${verse.verse}`;
}

/**
 * Format verse with text
 */
export function formatVerse(verse: Verse): string {
  return `[${formatVerseRef(verse)}] ${verse.text}`;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const applyGravityMetrics = async (
  nodes: import("./types").ThreadNode[],
  structure: ChiasmStructure | null | undefined,
): Promise<void> => {
  if (nodes.length === 0) return;
  const centralityMap = await fetchCentralityScores(
    nodes.map((node) => node.id),
  );
  const mirrorLookup = structure ? buildMirrorLookup(structure) : new Map();
  const structureSet = structure
    ? new Set(structure.verseIds)
    : new Set<number>();

  nodes.forEach((node) => {
    const centrality = centralityMap.get(node.id) ?? 0.1;
    const mirror = mirrorLookup.get(node.id);
    const isCenter = structure?.centerId === node.id;
    const inStructure = structureSet.has(node.id);

    let mass = 1 + centrality * 2;
    let structureRole: "center" | "mirror" | "member" | undefined;

    // Sprint 1: Exponential scaling for super-hubs to amplify visual prominence
    if (centrality > 0.9) {
      mass *= 1.5; // Top 10%: 50% boost (e.g., Luke 24:44)
    } else if (centrality > 0.8) {
      mass *= 1.3; // Top 20%: 30% boost (e.g., Isaiah 59:21)
    }

    if (isCenter) {
      mass += 3;
      structureRole = "center";
    }
    if (mirror) {
      mass += 0.6;
      structureRole = structureRole ?? "mirror";
    }
    if (!structureRole && inStructure) {
      structureRole = "member";
    }

    node.centrality = centrality;
    node.mass = clamp(mass, 1, 8); // Sprint 1: Increased ceiling from 6 to 8
    node.structureId = structure?.id;
    node.structureRole = structureRole;
    node.mirrorOf = mirror?.id;
  });
};

const buildStructuralMirrorEdges = (
  nodes: import("./types").ThreadNode[],
  structure: ChiasmStructure | null | undefined,
): import("./types").VisualEdge[] => {
  if (!structure) return [];

  const nodeIds = new Set(nodes.map((node) => node.id));
  const pairs = buildMirrorPairs(structure);

  return pairs
    .filter((pair) => nodeIds.has(pair.leftId) && nodeIds.has(pair.rightId))
    .map((pair) => ({
      from: pair.leftId,
      to: pair.rightId,
      weight: 1,
      type: "PATTERN" as const,
      metadata: {
        source: "structure",
        structureId: structure.id,
        mirror: true,
        label: pair.leftLabel,
        mirrorLabel: pair.rightLabel,
      },
    }));
};

const scoreEdgeForDedupe = (edge: import("./types").VisualEdge): number => {
  const weight = typeof edge.weight === "number" ? edge.weight : 0.6;
  const source =
    typeof edge.metadata?.source === "string"
      ? edge.metadata.source
      : "unknown";
  const confidence =
    typeof edge.metadata?.confidence === "number"
      ? edge.metadata.confidence
      : 1;
  const sourceWeight = EDGE_SOURCE_WEIGHTS[source] ?? 1;
  return weight * sourceWeight * confidence;
};

const dedupeEdges = (
  edges: import("./types").VisualEdge[],
): import("./types").VisualEdge[] => {
  const bestByKey = new Map<string, import("./types").VisualEdge>();

  edges.forEach((edge) => {
    const directed = !UNDIRECTED_EDGE_TYPES.has(edge.type);
    const key = directed
      ? `${edge.from}|${edge.to}|${edge.type}`
      : edge.from < edge.to
        ? `${edge.from}|${edge.to}|${edge.type}`
        : `${edge.to}|${edge.from}|${edge.type}`;
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, edge);
      return;
    }
    if (scoreEdgeForDedupe(edge) > scoreEdgeForDedupe(existing)) {
      bestByKey.set(key, edge);
    }
  });

  return Array.from(bestByKey.values());
};

const buildReferenceKey = (node: import("./types").ThreadNode): string => {
  const rawBook =
    node.book_name ||
    BOOK_NAMES[node.book_abbrev?.toLowerCase?.() || ""] ||
    node.book_abbrev ||
    "";
  const normalizedBook = rawBook.toLowerCase().trim().replace(/\s+/g, " ");
  return `${normalizedBook} ${node.chapter}:${node.verse}`;
};

const collapseDuplicateReferences = (
  nodes: import("./types").ThreadNode[],
  edges: import("./types").VisualEdge[],
  anchorId: number,
): {
  nodes: import("./types").ThreadNode[];
  edges: import("./types").VisualEdge[];
  collapsedCount: number;
} => {
  const nodeById = new Map<number, import("./types").ThreadNode>();
  nodes.forEach((node) => nodeById.set(node.id, node));

  const degreeMap = new Map<number, number>();
  edges.forEach((edge) => {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
  });

  const groups = new Map<string, number[]>();
  nodes.forEach((node) => {
    const key = node.referenceKey || buildReferenceKey(node);
    const group = groups.get(key) || [];
    group.push(node.id);
    groups.set(key, group);
  });

  const collapseMap = new Map<number, number>();

  groups.forEach((ids) => {
    if (ids.length <= 1) return;

    let canonicalId = ids.includes(anchorId) ? anchorId : ids[0];
    if (canonicalId !== anchorId) {
      canonicalId = ids.reduce((best, current) => {
        const bestNode = nodeById.get(best);
        const currentNode = nodeById.get(current);
        if (!bestNode || !currentNode) return best;

        if (currentNode.depth < bestNode.depth) return current;
        if (currentNode.depth > bestNode.depth) return best;

        const bestDegree = degreeMap.get(best) ?? 0;
        const currentDegree = degreeMap.get(current) ?? 0;
        if (currentDegree > bestDegree) return current;
        if (currentDegree < bestDegree) return best;

        const bestCentrality = bestNode.centrality ?? 0;
        const currentCentrality = currentNode.centrality ?? 0;
        if (currentCentrality > bestCentrality) return current;

        return best;
      }, canonicalId);
    }

    ids.forEach((id) => {
      if (id !== canonicalId) collapseMap.set(id, canonicalId);
    });
  });

  if (collapseMap.size === 0) {
    return { nodes, edges, collapsedCount: 0 };
  }

  const filteredNodes = nodes
    .filter((node) => !collapseMap.has(node.id))
    .map((node) => ({
      ...node,
      parentId: collapseMap.has(node.parentId ?? -1)
        ? collapseMap.get(node.parentId ?? -1)
        : node.parentId,
    }));

  const remappedEdges = dedupeEdges(
    edges
      .map((edge) => ({
        ...edge,
        from: collapseMap.get(edge.from) ?? edge.from,
        to: collapseMap.get(edge.to) ?? edge.to,
      }))
      .filter((edge) => edge.from !== edge.to),
  );

  return {
    nodes: filteredNodes,
    edges: remappedEdges,
    collapsedCount: collapseMap.size,
  };
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

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

const fetchVerseEmbedding = async (
  verseId: number,
): Promise<number[] | null> => {
  const { data, error } = await supabase
    .from("verses")
    .select("embedding")
    .eq("id", verseId)
    .single();

  if (error || !data) {
    console.warn("[Graph Walker] Failed to fetch anchor embedding:", error);
    return null;
  }

  return parseEmbedding(data.embedding);
};

const tuneAdditionalEdges = (
  edges: import("./types").VisualEdge[],
  nodeMap: Map<number, import("./types").ThreadNode>,
): import("./types").VisualEdge[] => {
  if (edges.length === 0) return edges;
  const depthById = new Map<number, number>();
  nodeMap.forEach((node, id) => depthById.set(id, node.depth));

  const tuned: import("./types").VisualEdge[] = [];
  edges.forEach((edge) => {
    const fromDepth = depthById.get(edge.from);
    const toDepth = depthById.get(edge.to);
    if (fromDepth === undefined || toDepth === undefined) {
      return;
    }

    const minDepth = Math.min(fromDepth, toDepth);
    const maxDepth = Math.max(fromDepth, toDepth);
    const weight = typeof edge.weight === "number" ? edge.weight : 0.6;
    const source =
      typeof edge.metadata?.source === "string"
        ? edge.metadata.source
        : "unknown";
    const sourceWeight = EDGE_SOURCE_WEIGHTS[source] ?? 1;
    const confidence =
      typeof edge.metadata?.confidence === "number"
        ? edge.metadata.confidence
        : 1;
    const depthWeight = 1 - Math.min(minDepth, 3) * 0.1;
    let adjustedWeight = weight * sourceWeight * confidence * depthWeight;
    if (maxDepth >= 3 && minDepth >= 2) {
      adjustedWeight *= 0.9;
    }
    if (adjustedWeight < MIN_ADDITIONAL_EDGE_WEIGHT) {
      return;
    }

    tuned.push({
      ...edge,
      weight: adjustedWeight,
      metadata: {
        ...edge.metadata,
        anchorDepthPenalty: depthWeight,
        sourceWeight,
        confidence,
      },
    });
  });

  return tuned;
};

const applyPericopeValidation = async (
  edges: import("./types").VisualEdge[],
  nodes: import("./types").ThreadNode[],
  anchorId: number,
): Promise<{
  edges: import("./types").VisualEdge[];
  nodes: import("./types").ThreadNode[];
  pericopeValidation?: {
    droppedEdges: number;
    minSimilarity: number;
  };
}> => {
  if (edges.length === 0) {
    return { edges, nodes };
  }

  const verseIds = new Set<number>();
  edges.forEach((edge) => {
    verseIds.add(edge.from);
    verseIds.add(edge.to);
  });

  if (verseIds.size === 0) {
    return { edges, nodes };
  }

  const source = ENV.PERICOPE_SOURCE || "SIL_AI";
  const { data: verseMap, error: verseMapError } = await supabase
    .from("verse_pericope_map")
    .select("verse_id, pericope_id")
    .in("verse_id", Array.from(verseIds))
    .eq("source", source);

  if (verseMapError || !verseMap) {
    console.warn(
      "[Pericope Validation] Failed to load pericope map:",
      verseMapError?.message,
    );
    return { edges, nodes };
  }

  const pericopeIdByVerse = new Map<number, number>();
  verseMap.forEach((row) => {
    if (!pericopeIdByVerse.has(row.verse_id)) {
      pericopeIdByVerse.set(row.verse_id, row.pericope_id);
    }
  });

  const updatedNodes = nodes.map((node) => {
    const pericopeId = pericopeIdByVerse.get(node.id);
    if (!pericopeId) return node;
    return {
      ...node,
      pericopeId,
    };
  });

  const pericopeIds = Array.from(
    new Set(Array.from(pericopeIdByVerse.values())),
  );

  if (pericopeIds.length === 0) {
    console.warn("[Pericope Validation] No pericope IDs found for edges");
    return { edges, nodes: updatedNodes };
  }

  const { data: embeddingRows, error: embeddingError } = await supabase
    .from("pericope_embeddings")
    .select("pericope_id, embedding")
    .in("pericope_id", pericopeIds)
    .eq("embedding_type", "full_text");

  if (embeddingError || !embeddingRows) {
    console.warn(
      "[Pericope Validation] Failed to load pericope embeddings:",
      embeddingError?.message,
    );
    return { edges, nodes: updatedNodes };
  }

  const embeddingMap = new Map<number, number[]>();
  embeddingRows.forEach((row) => {
    const embedding = parseEmbedding(row.embedding);
    if (embedding) {
      embeddingMap.set(row.pericope_id, embedding);
    }
  });

  const validatedEdges: import("./types").VisualEdge[] = [];
  let dropped = 0;

  for (const edge of edges) {
    if (PERICOPE_VALIDATION_EXCLUDE.has(edge.type)) {
      validatedEdges.push(edge);
      continue;
    }

    const fromPericope = pericopeIdByVerse.get(edge.from);
    const toPericope = pericopeIdByVerse.get(edge.to);
    const baseWeight = typeof edge.weight === "number" ? edge.weight : 0.6;

    if (!fromPericope || !toPericope) {
      validatedEdges.push({
        ...edge,
        weight: baseWeight * PERICOPE_VALIDATION.verseWeight,
        metadata: {
          ...edge.metadata,
          pericopeSimilarity: null,
          pericopeValidated: false,
          pericopeSource: source,
          pericopeReason: "missing_pericope",
        },
      });
      continue;
    }

    const fromEmbedding = embeddingMap.get(fromPericope);
    const toEmbedding = embeddingMap.get(toPericope);
    if (!fromEmbedding || !toEmbedding) {
      validatedEdges.push({
        ...edge,
        weight: baseWeight * PERICOPE_VALIDATION.verseWeight,
        metadata: {
          ...edge.metadata,
          pericopeSimilarity: null,
          pericopeValidated: false,
          pericopeSource: source,
          pericopeReason: "missing_embedding",
        },
      });
      continue;
    }

    const pericopeSimilarity =
      fromPericope === toPericope
        ? 1
        : cosineSimilarity(fromEmbedding, toEmbedding);

    if (pericopeSimilarity < PERICOPE_VALIDATION.minSimilarity) {
      const isCrossPericope = fromPericope !== toPericope;
      const llmConfidence =
        typeof edge.metadata?.confidence === "number"
          ? edge.metadata.confidence
          : 0;
      const isHighTrust =
        isCrossPericope &&
        (CROSS_PERICOPE_ALLOWLIST.has(edge.type) ||
          edge.metadata?.source === "canonical" ||
          (edge.metadata?.source === "llm" && llmConfidence >= 0.9));

      if (!isHighTrust) {
        dropped += 1;
        continue;
      }

      if (
        pericopeSimilarity < CROSS_PERICOPE_RELAXED_MIN &&
        baseWeight < CROSS_PERICOPE_OVERRIDE_WEIGHT
      ) {
        dropped += 1;
        continue;
      }

      const relaxedWeight =
        PERICOPE_VALIDATION.verseWeight * baseWeight +
        PERICOPE_VALIDATION.pericopeWeight *
          Math.max(pericopeSimilarity, CROSS_PERICOPE_RELAXED_MIN);

      validatedEdges.push({
        ...edge,
        weight: relaxedWeight,
        metadata: {
          ...edge.metadata,
          pericopeSimilarity,
          pericopeValidated: true,
          pericopeSource: source,
          pericopeReason: "cross_override",
        },
      });
      continue;
    }

    const combinedWeight =
      PERICOPE_VALIDATION.verseWeight * baseWeight +
      PERICOPE_VALIDATION.pericopeWeight * pericopeSimilarity;

    validatedEdges.push({
      ...edge,
      weight: combinedWeight,
      metadata: {
        ...edge.metadata,
        pericopeSimilarity,
        pericopeValidated: true,
        pericopeSource: source,
      },
    });
  }

  const connectedIds = new Set<number>([anchorId]);
  validatedEdges.forEach((edge) => {
    connectedIds.add(edge.from);
    connectedIds.add(edge.to);
  });

  const filteredNodes = updatedNodes.filter((node) =>
    connectedIds.has(node.id),
  );

  console.log(
    `[Pericope Validation] Kept ${validatedEdges.length}/${edges.length} edges (dropped ${dropped})`,
  );

  return {
    edges: validatedEdges,
    nodes: filteredNodes,
    pericopeValidation: {
      droppedEdges: dropped,
      minSimilarity: PERICOPE_VALIDATION.minSimilarity,
    },
  };
};

/**
 * Build visual context bundle with parent-child relationships for graph visualization
 * This is used by the Golden Thread UI to render the hierarchical tree
 *
 * @param anchorId - The verse ID to build the bundle around
 * @param config - Ring configuration (radius, limits)
 * @param edgeOptions - Which edge types to include (DEEPER, ROOTS, ECHOES, etc.)
 */
export async function buildVisualBundle(
  anchorId: number,
  config: Partial<RingConfig> = {},
  edgeOptions: {
    includeDEEPER?: boolean;
    includeROOTS?: boolean;
    includeECHOES?: boolean;
    includePROPHECY?: boolean;
    includeGENEALOGY?: boolean;
  } = { includeDEEPER: true, includeROOTS: true, includeECHOES: true },
): Promise<import("./types").VisualContextBundle> {
  console.log(
    `[Visual Bundle] Building visual bundle for verse ID ${anchorId}`,
  );
  console.log(`[Visual Bundle] Edge options:`, edgeOptions);

  // ========================================
  // STEP 1: Build standard context bundle
  // ========================================
  const bundle = await buildContextBundle(anchorId, config);

  // ========================================
  // STEP 2: Create node and edge structures
  // ========================================
  const nodes: import("./types").ThreadNode[] = [];
  const edges: import("./types").VisualEdge[] = [];
  const nodeMap = new Map<number, import("./types").ThreadNode>();

  // ========================================
  // STEP 3: Add anchor node (depth 0)
  // ========================================
  const anchorNode: import("./types").ThreadNode = {
    ...bundle.anchor,
    depth: 0,
    isSpine: true, // Anchor is always part of the spine
    ringSource: "ring0",
    isVisible: true, // Anchor is always visible
    collapsedChildCount: 0, // Will be calculated later
  };
  nodes.push(anchorNode);
  nodeMap.set(bundle.anchor.id, anchorNode);

  const ring0ContextIds = new Set(
    bundle.ring0
      .map((verse) => verse.id)
      .filter((verseId) => verseId !== anchorId),
  );

  // ========================================
  // STEP 4: Ring 0 context verses are excluded from the visual bundle to
  // avoid duplicating the anchor in the map UI.
  // ========================================
  // (Ring 0 still informs edge selection, but the context nodes themselves
  // are not emitted in the bundle.)

  // ========================================
  // STEP 5: Add Ring 1 (direct cross-references, depth 1)
  // ========================================
  const ring1Edges = bundle.ring1Edges ?? [];
  const ring1EdgeMap = new Map<number, import("./types").VisualEdge>();
  ring1Edges.forEach((edge) => {
    const existing = ring1EdgeMap.get(edge.to);
    if (!existing || (edge.weight ?? 0) > (existing.weight ?? 0)) {
      ring1EdgeMap.set(edge.to, edge);
    }
  });

  bundle.ring1.forEach((v) => {
    if (v.id === anchorId) return; // Skip the anchor itself

    const selectedEdge = ring1EdgeMap.get(v.id);
    const rawParentId = selectedEdge?.from || bundle.anchor.id;
    const parentId = ring0ContextIds.has(rawParentId)
      ? bundle.anchor.id
      : rawParentId;
    const node: import("./types").ThreadNode = {
      ...v,
      depth: 1,
      parentId,
      isSpine: false,
      ringSource: "ring1",
      isVisible: false, // Ring 1 verses not on spine
      collapsedChildCount: 0, // Will be calculated later
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    edges.push({
      from: parentId,
      to: v.id,
      weight: selectedEdge?.weight ?? 0.8,
      type: selectedEdge?.type ?? "DEEPER",
      metadata: selectedEdge?.metadata,
    });
  });

  // ========================================
  // STEP 6: Add Ring 2 (depth 2)
  // ========================================
  const ring2Edges = bundle.ring2Edges ?? [];
  const ring2EdgeMap = new Map<number, import("./types").VisualEdge>();
  ring2Edges.forEach((edge) => {
    const existing = ring2EdgeMap.get(edge.to);
    if (!existing || (edge.weight ?? 0) > (existing.weight ?? 0)) {
      ring2EdgeMap.set(edge.to, edge);
    }
  });

  bundle.ring2.forEach((v) => {
    if (v.id === anchorId) return; // Skip the anchor itself

    const selectedEdge = ring2EdgeMap.get(v.id);
    const parentId = selectedEdge?.from || bundle.anchor.id;
    const node: import("./types").ThreadNode = {
      ...v,
      depth: 2,
      parentId,
      isSpine: false,
      ringSource: "ring2",
      isVisible: false, // Ring 2 verses not on spine
      collapsedChildCount: 0, // Will be calculated later
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    edges.push({
      from: parentId,
      to: v.id,
      weight: selectedEdge?.weight ?? 0.6,
      type: selectedEdge?.type ?? "DEEPER",
      metadata: selectedEdge?.metadata,
    });
  });

  // ========================================
  // STEP 7: Add Ring 3 (depth 3)
  // ========================================
  const ring3Edges = bundle.ring3Edges ?? [];
  const ring3EdgeMap = new Map<number, import("./types").VisualEdge>();
  ring3Edges.forEach((edge) => {
    const existing = ring3EdgeMap.get(edge.to);
    if (!existing || (edge.weight ?? 0) > (existing.weight ?? 0)) {
      ring3EdgeMap.set(edge.to, edge);
    }
  });

  bundle.ring3.forEach((v) => {
    if (v.id === anchorId) return; // Skip the anchor itself

    const selectedEdge = ring3EdgeMap.get(v.id);
    const parentId = selectedEdge?.from || bundle.anchor.id;
    const node: import("./types").ThreadNode = {
      ...v,
      depth: 3,
      parentId,
      isSpine: false,
      ringSource: "ring3",
      isVisible: false, // Ring 3 verses not on spine
      collapsedChildCount: 0, // Will be calculated later
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    edges.push({
      from: parentId,
      to: v.id,
      weight: selectedEdge?.weight ?? 0.5,
      type: selectedEdge?.type ?? "DEEPER",
      metadata: selectedEdge?.metadata,
    });
  });

  // ========================================
  // STEP 7.5: Hydrate pericope metadata for anchor and ring0 nodes
  // ========================================
  const anchorPericopeMap = new Map<
    number,
    Awaited<ReturnType<typeof getPericopeForVerse>>
  >();

  for (const node of nodes.filter((n) => n.depth === 0)) {
    const pericope = await getPericopeForVerse(
      node.id,
      ENV.PERICOPE_SOURCE || "SIL_AI",
    );

    if (pericope) {
      // Attach pericope metadata to node
      node.pericopeId = pericope.id;
      node.pericopeTitle = pericope.title_generated || pericope.title;
      node.pericopeType = pericope.pericope_type || undefined;
      node.pericopeThemes = pericope.themes || undefined;
      node.isPericopeAnchor = node.id === pericope.verseIds[0];

      // Cache for return value
      anchorPericopeMap.set(pericope.id, pericope);
    }
  }

  await applyGravityMetrics(nodes, bundle.structure);

  // ========================================
  // STEP 8: Calculate "spine" heuristic
  // ========================================
  // Find the highest-weighted path from anchor to deepest ring
  calculateSpinePath(nodes, edges, bundle.anchor.id);

  const narrativeEdges = buildNarrativeEdges(nodes, edges);
  if (narrativeEdges.length > 0) {
    console.log(
      `[Visual Bundle] Added ${narrativeEdges.length} narrative chain edges`,
    );
  }

  const structuralMirrorEdges = buildStructuralMirrorEdges(
    nodes,
    bundle.structure,
  );
  if (structuralMirrorEdges.length > 0) {
    console.log(
      `[Visual Bundle] Added ${structuralMirrorEdges.length} structural mirror edge(s)`,
    );
  }

  console.log(
    `[Visual Bundle] Standard edges complete: ${nodes.length} nodes, ${edges.length} edges`,
  );

  // ========================================
  // STEP 9: Add Multi-Strand Edges (ROOTS, ECHOES, etc.)
  // ========================================

  // Get all verse IDs from the bundle
  const allVerseIds = nodes.map((n) => n.id);

  // Fetch additional edge types
  const additionalEdges = await fetchAllEdges(allVerseIds, {
    includeDEEPER: false, // Already have these from cross_references
    includeROOTS: edgeOptions.includeROOTS,
    includeECHOES: edgeOptions.includeECHOES,
    includePROPHECY: edgeOptions.includePROPHECY,
    includeGENEALOGY: edgeOptions.includeGENEALOGY,
  });
  const tunedAdditionalEdges = tuneAdditionalEdges(additionalEdges, nodeMap);

  // Merge all edges
  const allEdges = dedupeEdges([
    ...edges,
    ...narrativeEdges,
    ...structuralMirrorEdges,
    ...tunedAdditionalEdges,
  ]);

  const pericopeValidated = await applyPericopeValidation(
    allEdges,
    nodes,
    bundle.anchor.id,
  );
  let finalEdges = pericopeValidated.edges;
  let finalNodes = pericopeValidated.nodes;
  const pericopeValidation = pericopeValidated.pericopeValidation;

  const collapsed = collapseDuplicateReferences(
    finalNodes,
    finalEdges,
    bundle.anchor.id,
  );
  finalNodes = collapsed.nodes;
  finalEdges = collapsed.edges;
  if (collapsed.collapsedCount > 0) {
    console.warn(
      `[Visual Bundle] Collapsed ${collapsed.collapsedCount} duplicate reference node(s)`,
    );
  }

  const duplicateRefs = new Map<string, number[]>();
  finalNodes.forEach((node) => {
    const key = node.referenceKey || buildReferenceKey(node);
    const list = duplicateRefs.get(key) || [];
    list.push(node.id);
    duplicateRefs.set(key, list);
  });
  const remainingDuplicates = Array.from(duplicateRefs.entries()).filter(
    ([, ids]) => ids.length > 1,
  );
  if (remainingDuplicates.length > 0) {
    console.warn(
      "[Visual Bundle] Duplicate references remain after collapse:",
      remainingDuplicates.map(([key, ids]) => `${key} (${ids.join(",")})`),
    );
  }

  console.log(
    `[Visual Bundle] Complete with multi-strand: ${nodes.length} nodes, ${allEdges.length} total edges`,
  );
  console.log(
    `[Visual Bundle] Pericope validated: ${finalNodes.length} nodes, ${finalEdges.length} edges`,
  );
  console.log(`[Visual Bundle] Edge breakdown:`, {
    DEEPER: finalEdges.filter((e) => e.type === "DEEPER").length,
    ROOTS: finalEdges.filter((e) => e.type === "ROOTS").length,
    ECHOES: finalEdges.filter((e) => e.type === "ECHOES").length,
    PROPHECY: finalEdges.filter((e) => e.type === "PROPHECY").length,
    GENEALOGY: finalEdges.filter((e) => e.type === "GENEALOGY").length,
    NARRATIVE: finalEdges.filter((e) => e.type === "NARRATIVE").length,
    PATTERN: finalEdges.filter((e) => e.type === "PATTERN").length,
  });

  finalNodes = finalNodes.map((node) => ({
    ...node,
    referenceKey: node.referenceKey || buildReferenceKey(node),
  }));

  // Get first pericope from cache if available
  const firstPericope =
    anchorPericopeMap.size > 0
      ? Array.from(anchorPericopeMap.values())[0]
      : null;

  return {
    nodes: finalNodes,
    edges: finalEdges,
    rootId: bundle.anchor.id,
    lens: "NONE",
    pericopeValidation,
    // Include pericope context if anchor is part of one
    pericopeContext: firstPericope
      ? {
          id: firstPericope.id,
          title: firstPericope.title_generated || firstPericope.title,
          summary: firstPericope.summary || "",
          themes: firstPericope.themes || [],
          archetypes: firstPericope.archetypes || [],
          shadows: firstPericope.shadows || [],
          rangeRef: firstPericope.rangeRef,
        }
      : undefined,
    resolutionType: undefined, // Will be set by calling code in Phase 3
  };
}

/**
 * Calculate the "spine" path - the most likely theological path through the graph
 * This provides an initial visual focus before the AI starts citing verses
 */
function calculateSpinePath(
  nodes: import("./types").ThreadNode[],
  edges: import("./types").VisualEdge[],
  anchorId: number,
): void {
  // Simple heuristic: Mark the highest-weighted edge at each depth
  const depthGroups = new Map<number, import("./types").ThreadNode[]>();

  nodes.forEach((node) => {
    const group = depthGroups.get(node.depth) || [];
    group.push(node);
    depthGroups.set(node.depth, group);
  });

  // Start from anchor and traverse to deepest node
  let currentId = anchorId;

  for (let depth = 1; depth <= 3; depth++) {
    const childEdges = edges.filter((e) => e.from === currentId);

    if (childEdges.length === 0) break;

    // Pick the highest-weighted child
    const bestEdge = childEdges.reduce((best, current) =>
      current.weight > best.weight ? current : best,
    );

    const bestNode = nodes.find((n) => n.id === bestEdge.to);
    if (bestNode) {
      bestNode.isSpine = true;
      currentId = bestNode.id;
    }
  }
}
