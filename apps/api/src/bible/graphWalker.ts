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
}

export interface RingConfig {
  ring0Radius: number; // How many verses before/after anchor (default: 3)
  ring1Limit: number; // Max direct refs (default: 20)
  ring2Limit: number; // Max secondary refs (default: 30)
  ring3Limit: number; // Max tertiary refs (default: 40)
}

const DEFAULT_CONFIG: RingConfig = {
  ring0Radius: 3,
  ring1Limit: 20,
  ring2Limit: 30,
  ring3Limit: 40,
};

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

  const ring0 = ring0Data as Verse[];
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

  // ========================================
  // RING 1: Direct Cross-References
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 1 (max ${cfg.ring1Limit})...`);

  const ring1Ids = await fetchLayer(ring0Ids, cfg.ring1Limit, new Set());
  const ring1 = await hydrateVerses(ring1Ids);

  console.log(`[Graph Walker] Ring 1: ${ring1.length} verses`);

  // ========================================
  // RING 2: References of References
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 2 (max ${cfg.ring2Limit})...`);

  const excludeSet = new Set([...ring0Ids, ...ring1Ids]);
  const ring2IdsRaw = await fetchLayer(ring1Ids, cfg.ring2Limit, excludeSet);
  const ring2Ids = ring2IdsRaw.filter((id) => !excludeSet.has(id));
  const ring2 = await hydrateVerses(ring2Ids);

  console.log(`[Graph Walker] Ring 2: ${ring2.length} verses`);

  // ========================================
  // RING 3: Deep Thematic Links
  // ========================================
  console.log(`[Graph Walker] Fetching Ring 3 (max ${cfg.ring3Limit})...`);

  ring2Ids.forEach((id) => excludeSet.add(id));
  const ring3IdsRaw = await fetchLayer(ring2Ids, cfg.ring3Limit, excludeSet);
  const ring3Ids = ring3IdsRaw.filter((id) => !excludeSet.has(id));
  const ring3 = await hydrateVerses(ring3Ids);

  console.log(`[Graph Walker] Ring 3: ${ring3.length} verses`);

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
  };
}

/**
 * Fetch next layer of cross-references with budgeting
 *
 * Strategy:
 * - Get all outgoing cross-refs from source IDs
 * - Group by target verse
 * - Sort by "relevance" (how many sources point to each target)
 * - Take top N (limit)
 * - Exclude already-seen vertices
 */
async function fetchLayer(
  sourceIds: number[],
  limit: number,
  excludeSet: Set<number>,
): Promise<number[]> {
  if (sourceIds.length === 0) {
    return [];
  }

  console.log(
    `[Graph Walker]   Fetching refs from ${sourceIds.length} source vertices...`,
  );

  // Query: Get all cross-refs from source IDs, grouped by target
  const { data, error } = await supabase
    .from("cross_references")
    .select("to_verse_id")
    .in("from_verse_id", sourceIds);

  if (error) {
    console.error("[Graph Walker]   Error fetching layer:", error);
    return [];
  }

  if (!data || data.length === 0) {
    console.log(`[Graph Walker]   No cross-references found`);
    return [];
  }

  // Count frequency of each target (relevance scoring)
  const frequencyMap = new Map<number, number>();
  for (const row of data) {
    const toId = row.to_verse_id;

    // Skip if already seen
    if (excludeSet.has(toId)) {
      continue;
    }

    frequencyMap.set(toId, (frequencyMap.get(toId) || 0) + 1);
  }

  // Sort by frequency (descending) and take top N
  const sortedTargets = Array.from(frequencyMap.entries())
    .sort((a, b) => b[1] - a[1]) // Sort by count descending
    .slice(0, limit)
    .map(([id, _count]) => id);

  console.log(
    `[Graph Walker]   Found ${data.length} total refs, returning top ${sortedTargets.length}`,
  );

  return sortedTargets;
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

  return (data as Verse[]) || [];
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

/**
 * Build visual context bundle with parent-child relationships for graph visualization
 * This is used by the Golden Thread UI to render the hierarchical tree
 */
export async function buildVisualBundle(
  anchorId: number,
  config: Partial<RingConfig> = {},
): Promise<import("./types").VisualContextBundle> {
  console.log(
    `[Visual Bundle] Building visual bundle for verse ID ${anchorId}`,
  );

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
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    // Add edge from anchor to context verse
    edges.push({
      from: bundle.anchor.id,
      to: v.id,
      weight: 0.9, // High weight for immediate context
    });
  });

  // ========================================
  // STEP 5: Add Ring 1 (direct cross-references, depth 1)
  // ========================================
  // Fetch the actual cross-reference data to determine parents
  const { data: ring1Refs } = await supabase
    .from("cross_references")
    .select("from_verse_id, to_verse_id")
    .in("from_verse_id", [anchorId, ...bundle.ring0.map((v) => v.id)])
    .in(
      "to_verse_id",
      bundle.ring1.map((v) => v.id),
    );

  // Create a map of verse -> parent for Ring 1
  const ring1ParentMap = new Map<number, number>();
  if (ring1Refs) {
    for (const ref of ring1Refs) {
      if (!ring1ParentMap.has(ref.to_verse_id)) {
        // Prefer anchor as parent if it directly links
        if (ref.from_verse_id === anchorId) {
          ring1ParentMap.set(ref.to_verse_id, anchorId);
        } else {
          ring1ParentMap.set(ref.to_verse_id, ref.from_verse_id);
        }
      }
    }
  }

  bundle.ring1.forEach((v) => {
    const parentId = ring1ParentMap.get(v.id) || bundle.anchor.id;
    const node: import("./types").ThreadNode = {
      ...v,
      depth: 1,
      parentId,
      isSpine: false,
      ringSource: "ring1",
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    edges.push({
      from: parentId,
      to: v.id,
      weight: 0.8,
    });
  });

  // ========================================
  // STEP 6: Add Ring 2 (depth 2)
  // ========================================
  const ring1Ids = bundle.ring1.map((v) => v.id);
  const { data: ring2Refs } = await supabase
    .from("cross_references")
    .select("from_verse_id, to_verse_id")
    .in("from_verse_id", ring1Ids)
    .in(
      "to_verse_id",
      bundle.ring2.map((v) => v.id),
    );

  const ring2ParentMap = new Map<number, number>();
  if (ring2Refs) {
    for (const ref of ring2Refs) {
      if (!ring2ParentMap.has(ref.to_verse_id)) {
        ring2ParentMap.set(ref.to_verse_id, ref.from_verse_id);
      }
    }
  }

  bundle.ring2.forEach((v) => {
    const parentId = ring2ParentMap.get(v.id) || bundle.anchor.id;
    const node: import("./types").ThreadNode = {
      ...v,
      depth: 2,
      parentId,
      isSpine: false,
      ringSource: "ring2",
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    edges.push({
      from: parentId,
      to: v.id,
      weight: 0.6,
    });
  });

  // ========================================
  // STEP 7: Add Ring 3 (depth 3)
  // ========================================
  const ring2Ids = bundle.ring2.map((v) => v.id);
  const { data: ring3Refs } = await supabase
    .from("cross_references")
    .select("from_verse_id, to_verse_id")
    .in("from_verse_id", ring2Ids)
    .in(
      "to_verse_id",
      bundle.ring3.map((v) => v.id),
    );

  const ring3ParentMap = new Map<number, number>();
  if (ring3Refs) {
    for (const ref of ring3Refs) {
      if (!ring3ParentMap.has(ref.to_verse_id)) {
        ring3ParentMap.set(ref.to_verse_id, ref.from_verse_id);
      }
    }
  }

  bundle.ring3.forEach((v) => {
    const parentId = ring3ParentMap.get(v.id) || bundle.anchor.id;
    const node: import("./types").ThreadNode = {
      ...v,
      depth: 3,
      parentId,
      isSpine: false,
      ringSource: "ring3",
    };
    nodes.push(node);
    nodeMap.set(v.id, node);

    edges.push({
      from: parentId,
      to: v.id,
      weight: 0.5,
    });
  });

  // ========================================
  // STEP 8: Calculate "spine" heuristic
  // ========================================
  // Find the highest-weighted path from anchor to deepest ring
  calculateSpinePath(nodes, edges, bundle.anchor.id);

  console.log(
    `[Visual Bundle] Complete: ${nodes.length} nodes, ${edges.length} edges`,
  );

  return {
    nodes,
    edges,
    rootId: bundle.anchor.id,
    lens: "NONE",
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
