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
  // STEP 2: Build adjacency map (verse -> verses it references)
  // ========================================
  console.log(`[Reference Tree] Loading cross-reference adjacency map...`);
  console.log(
    `[Reference Tree] Using BATCH FETCHING to load all cross-references...`,
  );

  // Fetch ALL cross-references (Supabase default limit is 1000, we need all ~210k)
  let allRefs: any[] = [];
  let hasMore = true;
  let offset = 0;
  const batchSize = 10000;

  while (hasMore) {
    console.log(
      `[Reference Tree] Fetching batch: offset=${offset}, total accumulated so far: ${allRefs.length}`,
    );

    const {
      data: batch,
      error: refsError,
      count,
    } = await supabase
      .from("cross_references")
      .select("from_verse_id, to_verse_id", { count: "exact" })
      .range(offset, offset + batchSize - 1);

    console.log(
      `[Reference Tree] Received ${batch?.length || 0} rows in this batch (DB total count: ${count})`,
    );

    if (refsError) {
      throw new Error(`Failed to load cross-references: ${refsError.message}`);
    }

    if (!batch || batch.length === 0) {
      console.log(`[Reference Tree] No more data, stopping pagination`);
      hasMore = false;
    } else {
      allRefs = allRefs.concat(batch);
      offset += batch.length; // Use actual returned length, not requested size

      // Stop if we've gotten everything OR if we got fewer rows than the max Supabase limit (1000)
      // Note: Supabase has a max of 1000 rows per query regardless of range()
      if (count && allRefs.length >= count) {
        console.log(
          `[Reference Tree] Retrieved all ${allRefs.length} rows (count: ${count})`,
        );
        hasMore = false;
      } else if (batch.length < 1000) {
        // If we got less than 1000, we've hit the end
        console.log(
          `[Reference Tree] Received ${batch.length} < 1000, this was the last batch`,
        );
        hasMore = false;
      }
    }
  }

  const outEdges = new Map<number, number[]>();
  for (const ref of allRefs) {
    if (!outEdges.has(ref.from_verse_id)) {
      outEdges.set(ref.from_verse_id, []);
    }
    outEdges.get(ref.from_verse_id)!.push(ref.to_verse_id);
  }

  console.log(`[Reference Tree] Loaded ${allRefs.length} cross-references`);

  // ========================================
  // STEP 3: Fetch all verses (for lookup)
  // ========================================
  console.log(`[Reference Tree] Loading verse database...`);

  // Fetch ALL verses (need all ~31k)
  let allVerses: any[] = [];
  hasMore = true;
  offset = 0;

  while (hasMore) {
    console.log(
      `[Reference Tree] Fetching verses batch: offset=${offset}, total accumulated so far: ${allVerses.length}`,
    );

    const {
      data: batch,
      error: versesError,
      count,
    } = await supabase
      .from("verses")
      .select("*", { count: "exact" })
      .range(offset, offset + batchSize - 1);

    console.log(
      `[Reference Tree] Received ${batch?.length || 0} verses in this batch (DB total count: ${count})`,
    );

    if (versesError) {
      throw new Error(`Failed to load verses: ${versesError.message}`);
    }

    if (!batch || batch.length === 0) {
      console.log(`[Reference Tree] No more verses, stopping pagination`);
      hasMore = false;
    } else {
      allVerses = allVerses.concat(batch);
      offset += batch.length; // Use actual returned length

      // Stop if we've gotten everything OR if we got fewer rows than the max Supabase limit (1000)
      if (count && allVerses.length >= count) {
        console.log(
          `[Reference Tree] Retrieved all ${allVerses.length} verses (count: ${count})`,
        );
        hasMore = false;
      } else if (batch.length < 1000) {
        console.log(
          `[Reference Tree] Received ${batch.length} < 1000, this was the last verse batch`,
        );
        hasMore = false;
      }
    }
  }

  const versesById = new Map<number, Verse>();
  for (const v of allVerses) {
    versesById.set(v.id, v as Verse);
  }

  console.log(`[Reference Tree] Loaded ${versesById.size} verses`);

  // ========================================
  // STEP 4: Build tree with level-by-level crawl
  // ========================================
  const visited = new Set<number>();
  let nodeCount = 0;
  const nodes: ThreadNode[] = [];
  const edges: VisualEdge[] = [];
  const depthCounts = new Map<number, number>();

  // Helper to add a node
  const addNode = (verseId: number, depth: number, parentId?: number) => {
    const verse = versesById.get(verseId);
    if (!verse) {
      console.warn(`[Reference Tree] Verse ${verseId} not found in database`);
      return false;
    }

    visited.add(verseId);
    nodeCount++;

    // Track depth statistics
    depthCounts.set(depth, (depthCounts.get(depth) || 0) + 1);

    // Add node to result
    nodes.push({
      ...verse,
      depth,
      parentId,
      isSpine: false,
      isVisible: false, // Will be calculated after spine is determined
      collapsedChildCount: 0, // Will be calculated after visibility is set
      ringSource: `level${depth}`,
    });

    // Add edge from parent
    if (parentId !== undefined) {
      edges.push({
        from: parentId,
        to: verseId,
        weight: 1.0 - depth * 0.15, // Gradual fade per level
      });
    }

    return true;
  };

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
    const nextLevel: Array<{ id: number; parentId: number }> = [];

    // Process all verses at this level
    for (const { id: verseId, parentId } of currentLevel) {
      // Skip if already visited (prevents cycles)
      if (visited.has(verseId)) continue;

      // Add this verse to the tree
      if (!addNode(verseId, depth, parentId)) continue;

      // Don't expand children if we've hit max depth
      if (depth >= maxDepth) continue;

      // Get this verse's references (actual cross-references from database)
      const refs = outEdges.get(verseId) || [];

      // Limit children to prevent explosion
      const limitedRefs = refs.slice(0, maxChildrenPerNode);

      if (refs.length > maxChildrenPerNode) {
        console.log(
          `[Reference Tree] Verse ${verseId} has ${refs.length} refs, limiting to ${maxChildrenPerNode}`,
        );
      }

      // Add all references to next level
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
