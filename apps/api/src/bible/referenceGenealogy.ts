/**
 * Reference Genealogy Tree Builder
 *
 * Builds a pure hierarchical tree following verse-to-verse references
 * from an anchor downward through citation chains until depth/node limits.
 *
 * This replaces the "ring" abstraction with a clearer "genealogy" model:
 * - Anchor at top
 * - Verses it references below
 * - Verses those verses reference below that
 * - Continue until no more references or limits hit
 */

import { supabase } from "../db";
import type { Verse } from "./graphWalker";
import type { ThreadNode, VisualEdge, VisualContextBundle } from "./types";

interface BuildTreeOptions {
  maxDepth?: number; // How many levels deep to traverse (default: 6)
  maxNodes?: number; // Total node limit (default: 100)
  maxChildrenPerNode?: number; // Limit children per verse to prevent explosion (default: 5)
}

/**
 * Build a reference genealogy tree starting from an anchor verse.
 * Uses depth-first search to follow reference chains.
 */
export async function buildReferenceTree(
  anchorId: number,
  options: BuildTreeOptions = {},
): Promise<VisualContextBundle> {
  const { maxDepth = 6, maxNodes = 100, maxChildrenPerNode = 5 } = options;

  console.log(`[Reference Tree] Building genealogy from verse ${anchorId}`);
  console.log(
    `[Reference Tree] Limits: depth=${maxDepth}, nodes=${maxNodes}, children/node=${maxChildrenPerNode}`,
  );

  const startTime = Date.now();

  // ========================================
  // STEP 1: Fetch anchor verse
  // ========================================
  const { data: anchorData, error: anchorError } = await supabase
    .from("verses")
    .select("*")
    .eq("id", anchorId)
    .single();

  if (anchorError || !anchorData) {
    throw new Error(
      `Anchor verse ${anchorId} not found: ${anchorError?.message}`,
    );
  }

  const anchor = anchorData as Verse;
  console.log(
    `[Reference Tree] Anchor: ${anchor.book_name} ${anchor.chapter}:${anchor.verse}`,
  );

  // ========================================
  // STEP 2: Helper function to fetch cross-references for specific verses
  // ========================================
  const fetchCrossReferencesForVerses = async (
    verseIds: number[],
  ): Promise<Map<number, number[]>> => {
    if (verseIds.length === 0) return new Map();

    console.log(
      `[Reference Tree] Fetching cross-refs for ${verseIds.length} verses...`,
    );

    const { data, error } = await supabase
      .from("cross_references")
      .select("from_verse_id, to_verse_id")
      .in("from_verse_id", verseIds);

    if (error) {
      throw new Error(`Failed to load cross-references: ${error.message}`);
    }

    const outEdges = new Map<number, number[]>();
    if (data) {
      for (const ref of data) {
        if (!outEdges.has(ref.from_verse_id)) {
          outEdges.set(ref.from_verse_id, []);
        }
        outEdges.get(ref.from_verse_id)!.push(ref.to_verse_id);
      }
    }

    console.log(
      `[Reference Tree] Fetched ${data?.length || 0} cross-refs for ${verseIds.length} verses`,
    );
    return outEdges;
  };

  // ========================================
  // STEP 3: Helper function to fetch specific verses by ID
  // ========================================
  const fetchVersesByIds = async (
    verseIds: number[],
  ): Promise<Map<number, Verse>> => {
    if (verseIds.length === 0) return new Map();

    console.log(`[Reference Tree] Fetching ${verseIds.length} verses...`);

    const { data, error } = await supabase
      .from("verses")
      .select("*")
      .in("id", verseIds);

    if (error) {
      throw new Error(`Failed to load verses: ${error.message}`);
    }

    const versesById = new Map<number, Verse>();
    if (data) {
      for (const v of data) {
        versesById.set(v.id, v as Verse);
      }
    }

    console.log(`[Reference Tree] Fetched ${versesById.size} verses`);
    return versesById;
  };

  // ========================================
  // STEP 4: Build tree with level-by-level crawl (fetch data on-demand)
  // ========================================
  const visited = new Set<number>();
  let nodeCount = 0;
  const nodes: ThreadNode[] = [];
  const edges: VisualEdge[] = [];
  const depthCounts = new Map<number, number>();
  const versesById = new Map<number, Verse>(); // Cache verses we've fetched

  console.log(`[Reference Tree] Starting level-by-level crawl from anchor...`);

  // Start with anchor at level 0
  let currentLevel: Array<{ id: number; parentId?: number }> = [
    { id: anchorId },
  ];
  let depth = 0;

  while (depth <= maxDepth && currentLevel.length > 0 && nodeCount < maxNodes) {
    console.log(
      `[Reference Tree] Processing level ${depth} with ${currentLevel.length} verses...`,
    );

    // Fetch all verses we need for this level
    const verseIdsToFetch = currentLevel
      .map((v) => v.id)
      .filter((id) => !versesById.has(id));
    if (verseIdsToFetch.length > 0) {
      const fetchedVerses = await fetchVersesByIds(verseIdsToFetch);
      for (const [id, verse] of fetchedVerses.entries()) {
        versesById.set(id, verse);
      }
    }

    // Add all verses at this level to the tree (but stop if we hit maxNodes)
    for (const { id: verseId, parentId } of currentLevel) {
      // Stop if we've reached the node limit
      if (nodeCount >= maxNodes) {
        console.log(
          `[Reference Tree] Hit maxNodes limit (${maxNodes}), stopping at depth ${depth}`,
        );
        break;
      }

      if (visited.has(verseId)) continue; // Skip cycles

      const verse = versesById.get(verseId);
      if (!verse) {
        console.warn(`[Reference Tree] Verse ${verseId} not found in database`);
        continue;
      }

      visited.add(verseId);
      nodeCount++;
      depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);

      nodes.push({
        ...verse,
        depth,
        parentId,
        isSpine: false,
        isVisible: false,
        collapsedChildCount: 0,
        ringSource: `level${depth}`,
      });

      if (parentId !== undefined) {
        edges.push({
          from: parentId,
          to: verseId,
          weight: 1.0 - depth * 0.15,
        });
      }
    }

    // If we've hit max depth or max nodes, stop
    if (depth >= maxDepth || nodeCount >= maxNodes) {
      console.log(
        `[Reference Tree] Stopping: depth=${depth}, nodeCount=${nodeCount}`,
      );
      break;
    }

    // Fetch cross-references for all verses at this level
    const verseIdsAtThisLevel = currentLevel
      .map((v) => v.id)
      .filter((id) => visited.has(id)); // Only for verses we actually added
    const crossRefs = await fetchCrossReferencesForVerses(verseIdsAtThisLevel);

    // Build next level
    const nextLevel: Array<{ id: number; parentId: number }> = [];
    for (const { id: verseId } of currentLevel) {
      if (!visited.has(verseId)) continue;

      const refs = crossRefs.get(verseId) || [];
      const limitedRefs = refs.slice(0, maxChildrenPerNode);

      if (refs.length > maxChildrenPerNode) {
        console.log(
          `[Reference Tree] Verse ${verseId} has ${refs.length} refs, limiting to ${maxChildrenPerNode}`,
        );
      }

      for (const refId of limitedRefs) {
        if (!visited.has(refId) && nodeCount < maxNodes) {
          nextLevel.push({ id: refId, parentId: verseId });
        }
      }
    }

    currentLevel = nextLevel;
    depth++;
  }

  console.log(`[Reference Tree] Crawl complete. Processed ${depth} levels.`);

  // ========================================
  // STEP 5: Calculate "spine" path (most likely path through tree)
  // ========================================
  // Mark the first path from anchor to deepest leaf as the "spine"
  calculateSpinePath(nodes, edges, anchorId);

  // ========================================
  // STEP 6: Calculate visibility and collapsed child counts
  // ========================================
  calculateVisibility(nodes, edges);

  // ========================================
  // STEP 7: Summary statistics
  // ========================================
  const maxDepthReached = Math.max(...nodes.map((n) => n.depth));
  const elapsed = Date.now() - startTime;

  console.log(`[Reference Tree] ✓ Tree built in ${elapsed}ms`);
  console.log(`[Reference Tree] Total nodes: ${nodes.length}`);
  console.log(`[Reference Tree] Total edges: ${edges.length}`);
  console.log(`[Reference Tree] Max depth: ${maxDepthReached}`);
  console.log(
    `[Reference Tree] Depth distribution:`,
    Object.fromEntries(depthCounts),
  );

  return {
    nodes,
    edges,
    rootId: anchorId,
    lens: "GENEALOGY",
  };
}

/**
 * Calculate the "spine" - a highlighted path from root to a deep leaf.
 * This gives users an initial visual guide through the tree.
 */
function calculateSpinePath(
  nodes: ThreadNode[],
  edges: VisualEdge[],
  rootId: number,
): void {
  // Safety check
  if (nodes.length === 0) {
    console.warn(`[Reference Tree] Cannot calculate spine: no nodes`);
    return;
  }

  // Find the deepest node
  const deepestNode = nodes.reduce(
    (deepest, node) => (node.depth > deepest.depth ? node : deepest),
    nodes[0],
  );

  // Mark the anchor as spine
  const rootNode = nodes.find((n) => n.id === rootId);
  if (rootNode) {
    rootNode.isSpine = true;
  }

  // Trace back from deepest to root, marking spine
  let currentId = deepestNode.id;
  const spineNodes = new Set<number>();

  while (currentId !== rootId) {
    spineNodes.add(currentId);

    // Find parent
    const edge = edges.find((e) => e.to === currentId);
    if (!edge) break;

    currentId = edge.from;
  }

  // Mark all spine nodes
  for (const node of nodes) {
    if (spineNodes.has(node.id)) {
      node.isSpine = true;
    }
  }

  console.log(
    `[Reference Tree] Spine path: ${spineNodes.size + 1} nodes (root to depth ${deepestNode.depth})`,
  );
}

/**
 * Calculate visibility flags and collapsed child counts.
 *
 * Strategy:
 * 1. Mark all spine nodes as visible
 * 2. All non-spine nodes are hidden by default
 * 3. Calculate how many children each node has that are hidden
 */
function calculateVisibility(nodes: ThreadNode[], edges: VisualEdge[]): void {
  // Step 1: Mark spine nodes as visible
  let visibleCount = 0;
  for (const node of nodes) {
    if (node.isSpine) {
      node.isVisible = true;
      visibleCount++;
    }
  }

  console.log(
    `[Reference Tree] Visibility: ${visibleCount} spine nodes visible, ${nodes.length - visibleCount} collapsed`,
  );

  // Step 2: Calculate collapsed child counts for each node
  for (const node of nodes) {
    // Find all children of this node
    const childEdges = edges.filter((e) => e.from === node.id);
    const childIds = childEdges.map((e) => e.to);

    // Count how many children are NOT visible
    const hiddenChildren = childIds.filter((childId) => {
      const childNode = nodes.find((n) => n.id === childId);
      return childNode && !childNode.isVisible;
    });

    node.collapsedChildCount = hiddenChildren.length;
  }

  // Log stats for debugging
  const nodesWithCollapsed = nodes.filter((n) => n.collapsedChildCount > 0);
  console.log(
    `[Reference Tree] ${nodesWithCollapsed.length} nodes have collapsed children`,
  );

  if (nodesWithCollapsed.length > 0) {
    const examples = nodesWithCollapsed
      .slice(0, 3)
      .map(
        (n) =>
          `${n.book_abbrev} ${n.chapter}:${n.verse} (+${n.collapsedChildCount})`,
      )
      .join(", ");
    console.log(`[Reference Tree] Examples: ${examples}`);
  }
}
