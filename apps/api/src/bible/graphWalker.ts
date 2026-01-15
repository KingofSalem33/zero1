/**
 * Graph Walker: Budgeted BFS for Expanding Ring Architecture
 *
 * This module walks the Bible cross-reference graph using breadth-first search
 * with hard caps to prevent data explosion.
 *
 * Architecture:
 * - Ring 0: Anchor verse ± 3 verses (immediate context)
 * - Ring 1: Direct cross-references (max 20)
 * - Ring 2: References of references (max 30)
 * - Ring 3: Deep thematic links (max 40)
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
import {
  buildMirrorPairs,
  buildMirrorLookup,
  fetchCentralityScores,
  fetchChiasmStructureForVerse,
  type ChiasmStructure,
} from "./networkScience";

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
  ring1Limit: number; // Max direct refs (default: 20)
  ring2Limit: number; // Max secondary refs (default: 30)
  ring3Limit: number; // Max tertiary refs (default: 40)
  gravity?: Partial<GravityConfig>;
}

const DEFAULT_CONFIG: RingConfig = {
  ring0Radius: 3,
  ring1Limit: 20,
  ring2Limit: 30,
  ring3Limit: 40,
};

interface GravityConfig {
  edgeWeight: number;
  centralityWeight: number;
  chiasmCenterBonus: number;
  mirrorBonus: number;
  structuralEdgeWeight: number;
}

const DEFAULT_GRAVITY: GravityConfig = {
  edgeWeight: 1,
  centralityWeight: 0.35,
  chiasmCenterBonus: 0.4,
  mirrorBonus: 0.25,
  structuralEdgeWeight: 0.96,
};

type LayerResult = {
  ids: number[];
  edges: import("./types").VisualEdge[];
};

const normalizeConceptReference = (reference: string): string =>
  reference.replace(/^Psalm\b/i, "Psalms");

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

const buildStructuralEdges = (
  sourceIds: number[],
  structure: ChiasmStructure | null,
  gravity: GravityConfig,
): import("./types").VisualEdge[] => {
  if (!structure || structure.verseIds.length === 0) {
    return [];
  }

  const sourceSet = new Set(sourceIds);
  const structureSet = new Set(structure.verseIds);
  const mirrorLookup = buildMirrorLookup(structure);
  const edges: import("./types").VisualEdge[] = [];

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

async function fetchPriorityLayer(
  sourceIds: number[],
  limit: number,
  excludeSet: Set<number>,
  gravity: GravityConfig,
  structure: ChiasmStructure | null,
): Promise<LayerResult> {
  if (sourceIds.length === 0) {
    return { ids: [], edges: [] };
  }

  console.log(
    `[Graph Walker]   Fetching weighted neighbors from ${sourceIds.length} source vertices...`,
  );

  const baseEdges = await fetchAllEdges(sourceIds, {
    includeDEEPER: true,
    includeROOTS: true,
    includeECHOES: true,
    includePROPHECY: true,
    includeGENEALOGY: true,
    includeDISCOVERED: true,
    useSemanticThreads: true,
  });
  const structuralEdges = buildStructuralEdges(sourceIds, structure, gravity);
  const allEdges = [...baseEdges, ...structuralEdges];

  const sourceSet = new Set(sourceIds);
  const candidateIds = new Set<number>();

  allEdges.forEach((edge) => {
    const fromIsSource = sourceSet.has(edge.from);
    const toIsSource = sourceSet.has(edge.to);
    if (!fromIsSource && !toIsSource) return;

    const targetId = fromIsSource ? edge.to : edge.from;
    if (excludeSet.has(targetId) || sourceSet.has(targetId)) return;
    candidateIds.add(targetId);
  });

  const centralityMap = await fetchCentralityScores([...candidateIds]);
  const mirrorLookup = structure ? buildMirrorLookup(structure) : new Map();

  const candidates = new Map<
    number,
    {
      score: number;
      bestEdge: import("./types").VisualEdge;
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

  console.log(
    `[Graph Walker]   Weighted scoring: ${candidates.size} candidates, returning top ${ids.length}`,
  );

  return { ids, edges };
}

/**
 * Build context bundle using budgeted BFS graph traversal
 */
export async function buildContextBundle(
  anchorId: number,
  config: Partial<RingConfig> = {},
): Promise<ContextBundle> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  console.log(
    `[Graph Walker] Building context bundle for verse ID ${anchorId}`,
  );
  console.log(`[Graph Walker] Config:`, cfg);

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

  console.log(`[Graph Walker] Ring 0: ${ring0.length} verses`);
  console.log(
    `[Graph Walker] Anchor: ${anchor.book_name} ${anchor.chapter}:${anchor.verse}`,
  );

  // Extract IDs for next layer
  const ring0Ids = ring0.map((v) => v.id);

  const gravity = { ...DEFAULT_GRAVITY, ...(cfg.gravity ?? {}) };
  const structure = await fetchChiasmStructureForVerse(anchorId);

  if (structure) {
    console.log(
      `[Graph Walker] Structural lens: ${structure.type ?? "chiasm"} ${structure.id} (${structure.verseIds.length} verses)`,
    );
  }

  // ========================================
  // RING 1: Direct Cross-References
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 1 (max ${cfg.ring1Limit})...`);

  const ring1Layer = await fetchPriorityLayer(
    ring0Ids,
    cfg.ring1Limit,
    new Set(ring0Ids),
    gravity,
    structure,
  );
  const ring1Ids = ring1Layer.ids;
  let ring1 = await hydrateVerses(ring1Ids);
  let ring1Edges = ring1Layer.edges;

  console.log(`[Graph Walker] Ring 1: ${ring1.length} verses`);

  // ========================================
  // RING 2: References of References
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 2 (max ${cfg.ring2Limit})...`);

  const excludeSet = new Set([...ring0Ids, ...ring1Ids]);
  const ring2Layer = await fetchPriorityLayer(
    ring1Ids,
    cfg.ring2Limit,
    excludeSet,
    gravity,
    structure,
  );
  const ring2Ids = ring2Layer.ids;
  const ring2 = await hydrateVerses(ring2Ids);
  const ring2Edges = ring2Layer.edges;

  console.log(`[Graph Walker] Ring 2: ${ring2.length} verses`);

  // ========================================
  // RING 3: Deep Thematic Links
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 3 (max ${cfg.ring3Limit})...`);

  ring2Ids.forEach((id) => excludeSet.add(id));
  const ring3Layer = await fetchPriorityLayer(
    ring2Ids,
    cfg.ring3Limit,
    excludeSet,
    gravity,
    structure,
  );
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
  if (bridgeVerses.length > 0) {
    ring1 = [...ring1, ...bridgeVerses];
    const bridgeEdges = bridgeVerses.map((verse) => ({
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
      `[Graph Walker] Added ${bridgeVerses.length} bridge verse(s) for ${anchor.book_name} ${anchor.chapter}:${anchor.verse}`,
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
    ring0,
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

const dedupeEdges = (
  edges: import("./types").VisualEdge[],
): import("./types").VisualEdge[] => {
  const seen = new Set<string>();
  const deduped: import("./types").VisualEdge[] = [];

  edges.forEach((edge) => {
    const key =
      edge.from < edge.to
        ? `${edge.from}|${edge.to}|${edge.type}`
        : `${edge.to}|${edge.from}|${edge.type}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(edge);
  });

  return deduped;
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

  // ========================================
  // STEP 4: Add Ring 0 context verses (same depth as anchor)
  // ========================================
  bundle.ring0.forEach((v) => {
    if (v.id === anchorId) return; // Skip the anchor itself

    const node: import("./types").ThreadNode = {
      ...v,
      depth: 0,
      parentId: bundle.anchor.id,
      isSpine: false,
      ringSource: "ring0",
      isVisible: false, // Context verses not on spine
      collapsedChildCount: 0, // Will be calculated later
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    // Add edge from anchor to context verse
    edges.push({
      from: bundle.anchor.id,
      to: v.id,
      weight: 0.9, // High weight for immediate context
      type: "DEEPER",
    });
  });

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
    const parentId = selectedEdge?.from || bundle.anchor.id;
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

  // Merge all edges
  const allEdges = dedupeEdges([
    ...edges,
    ...narrativeEdges,
    ...structuralMirrorEdges,
    ...additionalEdges,
  ]);

  console.log(
    `[Visual Bundle] Complete with multi-strand: ${nodes.length} nodes, ${allEdges.length} total edges`,
  );
  console.log(`[Visual Bundle] Edge breakdown:`, {
    DEEPER: allEdges.filter((e) => e.type === "DEEPER").length,
    ROOTS: allEdges.filter((e) => e.type === "ROOTS").length,
    ECHOES: allEdges.filter((e) => e.type === "ECHOES").length,
    PROPHECY: allEdges.filter((e) => e.type === "PROPHECY").length,
    GENEALOGY: allEdges.filter((e) => e.type === "GENEALOGY").length,
    NARRATIVE: allEdges.filter((e) => e.type === "NARRATIVE").length,
    PATTERN: allEdges.filter((e) => e.type === "PATTERN").length,
  });

  // Get first pericope from cache if available
  const firstPericope =
    anchorPericopeMap.size > 0
      ? Array.from(anchorPericopeMap.values())[0]
      : null;

  return {
    nodes,
    edges: allEdges,
    rootId: bundle.anchor.id,
    lens: "NONE",
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
