/**
 * Expanding Ring Exegesis / Reference Genealogy
 * KJV-only exegesis over a Bible graph, optimized for user clarity (not graph order).
 */

import { runModelStream } from "../ai/runModelStream";
import { runModel } from "../ai/runModel";
import type { Response } from "express";
import { getVerseId, buildVisualBundle, type Verse } from "./graphWalker";
import { searchVerses } from "./bibleService";
import {
  parseExplicitReference,
  type ParsedReference,
} from "./referenceParser";
import { matchConcept } from "./conceptMapping";
import { BOOK_NAMES } from "./bookNames";
import {
  findMultipleAnchorVerses,
  searchVersesByQuery,
} from "./semanticSearch";
import { supabase } from "../db";
import { ENV } from "../env";
import type {
  ParallelPassage,
  PericopeBundle,
  VisualContextBundle,
  VisualEdge,
} from "./types";
import { areSameTestament } from "./testamentUtil";
import { cosineSimilarity, rankByQueryRelevance } from "./graphEngine";
import {
  type PromptMode,
  buildResponseStrategy,
  buildSystemPrompt,
} from "../prompts/system/systemPrompts";
import { profileSpan, profileTime } from "../profiling/requestProfiler";
import { checkUserInput } from "../ai/guardrails";
import { generateRequestId } from "../feedback";
import {
  searchPericopesByQuery,
  getPericopeById,
  type PericopeDetail,
} from "./pericopeSearch";
import { buildPericopeScopeForVerse } from "./pericopeGraphWalker";
import {
  discoverConnections,
  selectCoreVerses,
  type DiscoveredConnection,
} from "./connectionDiscovery";
import { ensureVersesHaveText } from "./verseText";

const ANCHOR_NOT_FOUND_MESSAGE =
  "I could not find specific KJV verses matching your question. Please try rephrasing with more specific biblical terms or include a verse reference (e.g., 'John 3:16').";

const EMPTY_VERSE: Verse = {
  id: 0,
  book_abbrev: "",
  book_name: "",
  chapter: 0,
  verse: 0,
  text: "",
};

const DISCOVERY_TYPES = new Set<DiscoveredConnection["type"]>([
  "TYPOLOGY",
  "FULFILLMENT",
  "CONTRAST",
  "PROGRESSION",
  "PATTERN",
]);
const DISCOVERY_PERSIST_MIN = 0.9;

type IntentProfile =
  | "narrative"
  | "doctrinal"
  | "prophetic"
  | "ethical"
  | "identity"
  | "general";

const inferIntentProfile = (prompt: string): IntentProfile => {
  const text = prompt.toLowerCase();
  const scores: Record<IntentProfile, number> = {
    narrative: 0,
    doctrinal: 0,
    prophetic: 0,
    ethical: 0,
    identity: 0,
    general: 0,
  };

  const bump = (profile: IntentProfile, patterns: RegExp[]) => {
    patterns.forEach((pattern) => {
      if (pattern.test(text)) scores[profile] += 1;
    });
  };

  bump("narrative", [
    /\bstory\b/,
    /\bnarrative\b/,
    /\bscene\b/,
    /\bjourney\b/,
    /\bmiracle\b/,
    /\bparable\b/,
    /\bchronicle\b/,
  ]);
  bump("doctrinal", [
    /\bdoctrine\b/,
    /\btheology\b/,
    /\bteaching\b/,
    /\bbelieve\b/,
    /\bfaith\b/,
    /\bgospel\b/,
    /\bcovenant\b/,
    /\bjustification\b/,
    /\bsalvation\b/,
  ]);
  bump("prophetic", [
    /\bprophecy\b/,
    /\bfulfill\b/,
    /\bfulfillment\b/,
    /\bmessiah\b/,
    /\bchrist\b/,
    /\bpromise\b/,
    /\btype\b/,
    /\bantitype\b/,
  ]);
  bump("ethical", [
    /\bethic\b/,
    /\bmoral\b/,
    /\bcommand\b/,
    /\bobey\b/,
    /\brighteous\b/,
    /\bholy\b/,
    /\bsin\b/,
    /\blaw\b/,
  ]);
  bump("identity", [
    /\bidentity\b/,
    /\bimage of god\b/,
    /\bpeople of god\b/,
    /\bchurch\b/,
    /\bkingdom\b/,
    /\bson of\b/,
    /\bchildren of\b/,
  ]);

  let best: IntentProfile = "general";
  let bestScore = 0;
  (Object.keys(scores) as IntentProfile[]).forEach((profile) => {
    if (profile === "general") return;
    if (scores[profile] > bestScore) {
      bestScore = scores[profile];
      best = profile;
    }
  });

  return bestScore > 0 ? best : "general";
};

const buildEdgeTypeBonuses = (
  profile: IntentProfile,
): Partial<Record<VisualEdge["type"], number>> => {
  switch (profile) {
    case "narrative":
      return { NARRATIVE: 0.08, DEEPER: 0.04 };
    case "doctrinal":
      return { ROOTS: 0.07, PATTERN: 0.06, PROGRESSION: 0.05, DEEPER: 0.04 };
    case "prophetic":
      return { PROPHECY: 0.1, FULFILLMENT: 0.1, TYPOLOGY: 0.08 };
    case "ethical":
      return { PROGRESSION: 0.06, CONTRAST: 0.05 };
    case "identity":
      return { ROOTS: 0.08, PATTERN: 0.06 };
    default:
      return {};
  }
};

const buildEdgeKey = (type: string, fromId: number, toId: number) => {
  const a = Math.min(fromId, toId);
  const b = Math.max(fromId, toId);
  return `${type}:${a}-${b}`;
};

const mergeDiscoveredEdges = (
  bundle: ReferenceVisualBundle,
  connections: DiscoveredConnection[],
  source: "llm_cached" | "llm_discovered",
) => {
  if (!connections.length) return bundle;
  const existing = new Set(
    bundle.edges.map((edge) =>
      buildEdgeKey(edge.type || "DEEPER", edge.from, edge.to),
    ),
  );
  const nextEdges = [...bundle.edges];
  connections.forEach((conn) => {
    const key = buildEdgeKey(conn.type, conn.from, conn.to);
    if (existing.has(key)) return;
    existing.add(key);
    nextEdges.push({
      from: conn.from,
      to: conn.to,
      type: conn.type,
      weight: conn.confidence,
      metadata: {
        explanation: conn.explanation,
        confidence: conn.confidence,
        source,
      },
    });
  });
  return { ...bundle, edges: nextEdges };
};

const fetchPersistedConnections = async (
  verseIds: number[],
): Promise<DiscoveredConnection[]> => {
  if (verseIds.length === 0) return [];
  const { data, error } = await supabase
    .from("llm_connections")
    .select(
      "from_verse_id, to_verse_id, connection_type, explanation, confidence",
    )
    .in("from_verse_id", verseIds)
    .in("to_verse_id", verseIds);

  if (error || !data) {
    console.warn("[Connection Discovery] Failed to load cached connections");
    return [];
  }

  return data
    .filter((row) => DISCOVERY_TYPES.has(row.connection_type))
    .map((row) => ({
      from: row.from_verse_id,
      to: row.to_verse_id,
      type: row.connection_type as DiscoveredConnection["type"],
      explanation: row.explanation,
      confidence: row.confidence,
    }));
};

const persistDiscoveredConnections = async (
  connections: DiscoveredConnection[],
) => {
  const toPersist = connections.filter(
    (conn) =>
      DISCOVERY_TYPES.has(conn.type) &&
      conn.confidence >= DISCOVERY_PERSIST_MIN,
  );
  if (toPersist.length === 0) return;

  const rows = toPersist.map((conn) => ({
    from_verse_id: conn.from,
    to_verse_id: conn.to,
    connection_type: conn.type,
    explanation: conn.explanation,
    confidence: conn.confidence,
  }));

  const { error } = await supabase.from("llm_connections").upsert(rows, {
    onConflict: "from_verse_id,to_verse_id,connection_type",
  });
  if (error) {
    console.warn("[Connection Discovery] Failed to persist connections");
  }
};

export interface ReferenceTreeNode {
  id: number;
  depth: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
  similarity?: number; // Semantic similarity to user query (0-1)
  parallelPassages?: ParallelPassage[]; // Parallel accounts (synoptic parallels, etc.)
  isStackedWith?: number; // If this node is hidden due to being a parallel, points to the representative node ID
  referenceKey?: string; // Canonical normalized reference (e.g., "john 1:1")
  parentId?: number; // ID of parent node in tree
  isSpine?: boolean;
  centrality?: number;
  pericopeId?: number;
}

export interface ReferenceTreeEdge {
  from: number;
  to: number;
  weight?: number;
  type?: string;
  metadata?: Record<string, unknown>;
}

export interface ReferenceVisualBundle {
  nodes: ReferenceTreeNode[];
  edges: ReferenceTreeEdge[];
  rootId?: number; // Anchor verse ID for circular layout
  lens?: string; // Lens type (e.g., "NONE", "MESSIANIC")
  pericopeValidation?: {
    droppedEdges: number;
    minSimilarity: number;
  };
  // Pericope metadata if resolution was pericope-first
  pericopeContext?: {
    id: number;
    title: string;
    summary: string;
    themes: string[];
    archetypes: string[];
    shadows: string[];
    rangeRef: string;
  };
  resolutionType?: "pericope_first" | "verse_first";
  pericopeBundle?: PericopeBundle;
}

interface TreeStats {
  totalNodes: number;
  maxDepth: number;
  depthDistribution: Record<number, number>;
}

type MapSession = {
  cluster?: {
    baseId: number;
    verseIds: number[];
    connectionType: string;
  };
  currentConnection?: {
    fromId: number;
    toId: number;
    connectionType: string;
  };
  previousConnection?: {
    fromId: number;
    toId: number;
    connectionType: string;
  };
  nextConnection?: {
    fromId: number;
    toId: number;
    connectionType: string;
  } | null;
  visitedEdgeKeys?: string[];
  offMapReferences?: string[];
  exhausted?: boolean;
};

const EMPTY_TREE_STATS: TreeStats = {
  totalNodes: 0,
  maxDepth: 0,
  depthDistribution: {},
};

const normalizeReferenceKey = (node: ReferenceTreeNode): string => {
  const book = (node.book_name || node.book_abbrev || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return `${book} ${node.chapter}:${node.verse}`;
};

const collapseDuplicateReferencesInBundle = (
  bundle: ReferenceVisualBundle,
): ReferenceVisualBundle => {
  const nodes = bundle.nodes || [];
  const edges = bundle.edges || [];
  if (nodes.length < 2) return bundle;

  const degreeMap = new Map<number, number>();
  edges.forEach((edge) => {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
  });

  const groups = new Map<string, number[]>();
  nodes.forEach((node) => {
    const key = node.referenceKey || normalizeReferenceKey(node);
    const list = groups.get(key) || [];
    list.push(node.id);
    groups.set(key, list);
  });

  const anchorId = bundle.rootId;
  const collapseMap = new Map<number, number>();
  groups.forEach((ids) => {
    if (ids.length <= 1) return;

    let canonicalId = anchorId && ids.includes(anchorId) ? anchorId : ids[0];

    if (canonicalId !== anchorId) {
      canonicalId = ids.reduce((best, current) => {
        const bestNode = nodes.find((n) => n.id === best);
        const currentNode = nodes.find((n) => n.id === current);
        if (!bestNode || !currentNode) return best;

        if (currentNode.depth < bestNode.depth) return current;
        if (currentNode.depth > bestNode.depth) return best;

        const bestDegree = degreeMap.get(best) ?? 0;
        const currentDegree = degreeMap.get(current) ?? 0;
        if (currentDegree > bestDegree) return current;
        if (currentDegree < bestDegree) return best;

        const bestCentrality = bestNode.similarity ?? 0;
        const currentCentrality = currentNode.similarity ?? 0;
        if (currentCentrality > bestCentrality) return current;

        return best;
      }, canonicalId);
    }

    ids.forEach((id) => {
      if (id !== canonicalId) collapseMap.set(id, canonicalId);
    });
  });

  if (collapseMap.size === 0) return bundle;

  const filteredNodes = nodes
    .filter((node) => !collapseMap.has(node.id))
    .map((node) => ({
      ...node,
      referenceKey: node.referenceKey || normalizeReferenceKey(node),
      parentId: collapseMap.has(node.parentId ?? -1)
        ? collapseMap.get(node.parentId ?? -1)
        : node.parentId,
    }));

  const edgeSet = new Set<string>();
  const remappedEdges = edges
    .map((edge) => ({
      ...edge,
      from: collapseMap.get(edge.from) ?? edge.from,
      to: collapseMap.get(edge.to) ?? edge.to,
    }))
    .filter((edge) => edge.from !== edge.to)
    .filter((edge) => {
      const key =
        edge.from < edge.to
          ? `${edge.from}|${edge.to}`
          : `${edge.to}|${edge.from}`;
      if (edgeSet.has(key)) return false;
      edgeSet.add(key);
      return true;
    });

  return {
    ...bundle,
    nodes: filteredNodes,
    edges: remappedEdges,
  };
};

/**
 * Rank verses in the reference tree by semantic similarity to user query.
 * Adds similarity scores to each node and sorts within depth levels.
 *
 * @param visualBundle - The reference tree to rank
 * @param userQuery - The user's original question
 * @returns The same bundle with similarity scores added and nodes sorted by relevance
 */
export async function rankVersesBySimilarity(
  visualBundle: ReferenceVisualBundle,
  userQuery: string,
): Promise<ReferenceVisualBundle> {
  if (!visualBundle.nodes.length || !ENV.OPENAI_API_KEY) {
    console.log("[Verse Ranking] Skipping ranking (no nodes or no API key)");
    return visualBundle;
  }

  const startTime = Date.now();
  console.log(
    `[Verse Ranking] Ranking ${visualBundle.nodes.length} verses by similarity to query`,
  );

  try {
    const { scoredCount } = await rankByQueryRelevance(
      visualBundle.nodes,
      userQuery,
      {
        profileLabel: "rank_similarity",
      },
    );

    // Step 4: Sort nodes within each depth level by similarity (highest first)
    // This preserves the tree structure while prioritizing relevant verses
    const nodesByDepth: Record<number, ReferenceTreeNode[]> = {};
    for (const node of visualBundle.nodes) {
      (nodesByDepth[node.depth] ??= []).push(node);
    }

    const sortStart = process.hrtime.bigint();
    for (const depth in nodesByDepth) {
      nodesByDepth[depth].sort(
        (a, b) => (b.similarity || 0) - (a.similarity || 0),
      );
    }
    profileSpan("rank_similarity.sort", sortStart, process.hrtime.bigint(), {
      file: "bible/expandingRingExegesis.ts",
      fn: "rankVersesBySimilarity",
      await: "sort_by_similarity",
    });

    // Reconstruct nodes array with sorted nodes
    visualBundle.nodes = Object.values(nodesByDepth).flat();

    const elapsed = Date.now() - startTime;
    console.log(
      `[Verse Ranking] ✅ Ranked ${scoredCount}/${visualBundle.nodes.length} verses in ${elapsed}ms`,
    );

    if (visualBundle.nodes.length > 0) {
      const topNode = visualBundle.nodes[0];
      console.log(
        `[Verse Ranking] Top verse: ${topNode.book_name} ${topNode.chapter}:${topNode.verse} (${((topNode.similarity || 0) * 100).toFixed(1)}% match)`,
      );
    }

    return visualBundle;
  } catch (error) {
    console.error("[Verse Ranking] Ranking failed:", error);
    return visualBundle; // Return unranked on error
  }
}

/**
 * Stack parallel passages instead of removing them.
 * Detects verses with high semantic similarity (>92%) in the same testament
 * and attaches parallels to the most relevant representative node.
 *
 * @param visualBundle - The reference tree to process
 * @returns The bundle with parallels stacked
 */
export async function deduplicateVerses(
  visualBundle: ReferenceVisualBundle,
): Promise<ReferenceVisualBundle> {
  if (visualBundle.nodes.length < 2) {
    return visualBundle; // Nothing to stack
  }

  const startTime = Date.now();
  console.log(
    `[Parallel Stacking] Checking ${visualBundle.nodes.length} verses for parallels...`,
  );

  const DUPLICATE_THRESHOLD = 0.92; // 92% similarity = likely parallel passage
  const stackedNodeIds = new Set<number>(); // Track which nodes are stacked under others

  // Fetch embeddings for all verses
  const verseIds = visualBundle.nodes.map((n) => n.id);
  const { data: verses, error } = await profileTime(
    "dedupe.fetch_embeddings",
    () => supabase.from("verses").select("id, embedding").in("id", verseIds),
    {
      file: "bible/expandingRingExegesis.ts",
      fn: "deduplicateVerses",
      await: "supabase.verses.select",
    },
  );

  if (error || !verses) {
    console.error("[Parallel Stacking] Failed to fetch embeddings:", error);
    return visualBundle; // Return unchanged on error
  }

  // Build embedding map
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
        // Skip if embedding parse fails
      }
    }
  }

  // Create node map for easy lookup
  const nodeMap = new Map<number, ReferenceTreeNode>();
  for (const node of visualBundle.nodes) {
    nodeMap.set(node.id, node);
  }

  // Compare all pairs and build parallel stacks
  const compareStart = process.hrtime.bigint();
  for (let i = 0; i < visualBundle.nodes.length; i++) {
    if (stackedNodeIds.has(visualBundle.nodes[i].id)) continue;

    const node1 = visualBundle.nodes[i];
    const emb1 = embeddingMap.get(node1.id);
    if (!emb1) continue;

    for (let j = i + 1; j < visualBundle.nodes.length; j++) {
      if (stackedNodeIds.has(visualBundle.nodes[j].id)) continue;

      const node2 = visualBundle.nodes[j];
      const emb2 = embeddingMap.get(node2.id);
      if (!emb2) continue;

      const similarity = cosineSimilarity(emb1, emb2);

      // Only stack same-testament parallels (avoid cross-testament echoes)
      if (
        similarity >= DUPLICATE_THRESHOLD &&
        areSameTestament(node1.book_abbrev, node2.book_abbrev)
      ) {
        // Choose representative: highest query similarity (or first if no scores)
        const representative =
          (node1.similarity || 0) >= (node2.similarity || 0) ? node1 : node2;
        const parallel = representative === node1 ? node2 : node1;
        const representativeKey = `${representative.book_abbrev}:${representative.chapter}:${representative.verse}`;
        const parallelKey = `${parallel.book_abbrev}:${parallel.chapter}:${parallel.verse}`;

        if (representative.id === parallel.id) {
          continue;
        }
        if (representativeKey === parallelKey) {
          continue;
        }

        // Initialize parallelPassages array if needed
        if (!representative.parallelPassages) {
          representative.parallelPassages = [];
        }
        const existingParallelKeys = new Set(
          representative.parallelPassages.map(
            (entry) => `${entry.book_abbrev}:${entry.chapter}:${entry.verse}`,
          ),
        );
        if (existingParallelKeys.has(parallelKey)) {
          continue;
        }

        // Add parallel to representative's stack
        representative.parallelPassages.push({
          id: parallel.id,
          reference: `${parallel.book_name} ${parallel.chapter}:${parallel.verse}`,
          text: parallel.text,
          similarity: similarity,
          book_abbrev: parallel.book_abbrev,
          book_name: parallel.book_name,
          chapter: parallel.chapter,
          verse: parallel.verse,
        });

        // Mark parallel as stacked
        parallel.isStackedWith = representative.id;
        stackedNodeIds.add(parallel.id);

        console.log(
          `[Parallel Stacking] Stacked: ${parallel.book_name} ${parallel.chapter}:${parallel.verse} → ` +
            `${representative.book_name} ${representative.chapter}:${representative.verse} ` +
            `(${(similarity * 100).toFixed(1)}% similar)`,
        );
      }
    }

    // Sort parallel passages by similarity (highest first)
    if (node1.parallelPassages && node1.parallelPassages.length > 0) {
      node1.parallelPassages.sort((a, b) => b.similarity - a.similarity);
    }
  }
  profileSpan("dedupe.compare_pairs", compareStart, process.hrtime.bigint(), {
    file: "bible/expandingRingExegesis.ts",
    fn: "deduplicateVerses",
    await: "cosineSimilarity",
  });

  // Filter out stacked nodes (but keep them in data structure for potential future use)
  const originalCount = visualBundle.nodes.length;
  visualBundle.nodes = visualBundle.nodes.filter(
    (n) => !stackedNodeIds.has(n.id),
  );

  // Also remove edges that reference stacked nodes
  visualBundle.edges = visualBundle.edges.filter(
    (e) => !stackedNodeIds.has(e.from) && !stackedNodeIds.has(e.to),
  );

  const elapsed = Date.now() - startTime;
  const stackedCount = originalCount - visualBundle.nodes.length;
  const nodesWithParallels = visualBundle.nodes.filter(
    (n) => n.parallelPassages && n.parallelPassages.length > 0,
  ).length;

  if (stackedCount > 0) {
    console.log(
      `[Parallel Stacking] ✅ Stacked ${stackedCount} parallel(s) under ${nodesWithParallels} representative node(s) in ${elapsed}ms ` +
        `(${visualBundle.nodes.length} verses remaining)`,
    );
  } else {
    console.log(`[Parallel Stacking] No parallels found (${elapsed}ms)`);
  }

  return visualBundle;
}

/**
 * Resolve multiple anchor verses from the user prompt for multi-perspective synthesis.
 * Returns top N semantically similar verses when no explicit reference is given.
 */
export async function resolveMultipleAnchors(
  userPrompt: string,
  maxAnchors: number = 3,
): Promise<number[]> {
  // Step 0: Check for structured "go deeper" prompt with explicit anchors
  const sourceAnchorMatch = userPrompt.match(/\[SOURCE ANCHOR\]\s*([^:]+:\d+)/);
  const targetConnectionMatch = userPrompt.match(
    /\[TARGET CONNECTION\]\s*([^:]+:\d+)/,
  );

  if (sourceAnchorMatch && targetConnectionMatch) {
    const sourceRef = parseExplicitReference(sourceAnchorMatch[1]);
    const targetRef = parseExplicitReference(targetConnectionMatch[1]);

    const anchorIds: number[] = [];

    if (sourceRef) {
      const sourceId = await profileTime(
        "anchor.resolve.getVerseId",
        () => getVerseId(sourceRef.book, sourceRef.chapter, sourceRef.verse),
        {
          file: "bible/graphWalker.ts",
          fn: "getVerseId",
          await: "getVerseId",
        },
      );
      if (sourceId) anchorIds.push(sourceId);
    }

    if (targetRef) {
      const targetId = await profileTime(
        "anchor.resolve.getVerseId",
        () => getVerseId(targetRef.book, targetRef.chapter, targetRef.verse),
        {
          file: "bible/graphWalker.ts",
          fn: "getVerseId",
          await: "getVerseId",
        },
      );
      if (targetId) anchorIds.push(targetId);
    }

    if (anchorIds.length > 0) {
      console.log(
        `[Multi-Anchor] ✅ Extracted ${anchorIds.length} anchors from structured prompt`,
      );
      return anchorIds;
    }
  }

  // Step 1: Check for explicit reference (e.g., "John 3:16")
  const explicitRef = parseExplicitReference(userPrompt);
  if (explicitRef) {
    const anchorId = await profileTime(
      "anchor.resolve.getVerseId",
      () =>
        getVerseId(explicitRef.book, explicitRef.chapter, explicitRef.verse),
      {
        file: "bible/graphWalker.ts",
        fn: "getVerseId",
        await: "getVerseId",
      },
    );
    if (anchorId) {
      console.log(
        `[Multi-Anchor] ✅ Using explicit reference: ${explicitRef.book} ${explicitRef.chapter}:${explicitRef.verse}`,
      );
      return [anchorId]; // Explicit reference = single anchor
    }
  }

  // Step 2: Check for known concept references
  const conceptRef = matchConcept(userPrompt);
  if (conceptRef) {
    const parsedConcept = parseExplicitReference(conceptRef);
    if (parsedConcept) {
      const anchorId = await profileTime(
        "anchor.resolve.getVerseId",
        () =>
          getVerseId(
            parsedConcept.book,
            parsedConcept.chapter,
            parsedConcept.verse,
          ),
        {
          file: "bible/graphWalker.ts",
          fn: "getVerseId",
          await: "getVerseId",
        },
      );
      if (anchorId) {
        console.log(
          `[Multi-Anchor] ✅ Using concept mapping: ${parsedConcept.book} ${parsedConcept.chapter}:${parsedConcept.verse}`,
        );
        return [anchorId]; // Concept mapping = single anchor
      }
    }
  }

  // Step 3: Use semantic search to find multiple relevant verses
  console.log(
    `[Multi-Anchor] Using semantic search for top ${maxAnchors} anchor verses: "${userPrompt}"`,
  );

  try {
    const anchorIds = await profileTime(
      "anchor.resolve.semantic_multi",
      () => findMultipleAnchorVerses(userPrompt, maxAnchors),
      {
        file: "bible/semanticSearch.ts",
        fn: "findMultipleAnchorVerses",
        await: "findMultipleAnchorVerses",
      },
    );

    if (anchorIds.length > 0) {
      console.log(
        `[Multi-Anchor] ✅ Found ${anchorIds.length} anchors via semantic search`,
      );
      return anchorIds;
    }

    console.warn(
      `[Multi-Anchor] ⚠️  Semantic search found no results, falling back to single anchor`,
    );
  } catch (error) {
    console.error("[Multi-Anchor] Semantic search failed:", error);
  }

  // Step 4: Fallback - use single anchor resolution
  const singleAnchor = await profileTime(
    "anchor.resolve.fallback_single",
    () => resolveAnchor(userPrompt),
    {
      file: "bible/expandingRingExegesis.ts",
      fn: "resolveAnchor",
      await: "resolveAnchor",
    },
  );
  return singleAnchor ? [singleAnchor] : [];
}

const ANCHOR_REF_MAX = 5;
const ANCHOR_RANGE_CAP = 6;
const SEMANTIC_STRICT_MIN = 0.9;
const ANCHOR_REF_SYSTEM = `You are a Bible reference resolver for KJV-only study.
Return a JSON object with a single field "references" (array of 0-5 strings).
Each string must be a specific reference like "Genesis 22:1-18" or "John 3:16".
Prefer the primary narrative passage for story requests. No commentary.`;

const ANCHOR_REF_SCHEMA = {
  type: "object",
  properties: {
    references: {
      type: "array",
      items: { type: "string" },
      maxItems: ANCHOR_REF_MAX,
    },
  },
  required: ["references"],
  additionalProperties: false,
} as const;

type LlmAnchorResponse = { references: string[] };

const STOPWORDS = new Set([
  "the",
  "and",
  "but",
  "for",
  "nor",
  "yet",
  "so",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "at",
  "by",
  "from",
  "with",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "he",
  "she",
  "they",
  "them",
  "his",
  "her",
  "their",
  "you",
  "your",
  "i",
  "we",
  "our",
  "my",
  "me",
  "us",
  "what",
  "which",
  "who",
  "whom",
  "when",
  "where",
  "why",
  "how",
  "tell",
  "show",
  "explain",
  "about",
  "does",
  "did",
  "do",
  "said",
  "say",
  "says",
  "ask",
  "asked",
]);

const normalizeTokens = (text: string): Set<string> => {
  const cleaned = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
  return new Set(cleaned);
};

const scoreOverlap = (prompt: string, verseText: string): number => {
  const promptTokens = normalizeTokens(prompt);
  if (promptTokens.size === 0) return 0;
  const verseTokens = normalizeTokens(verseText);
  if (verseTokens.size === 0) return 0;
  let overlap = 0;
  promptTokens.forEach((token) => {
    if (verseTokens.has(token)) overlap += 1;
  });
  return overlap / promptTokens.size;
};

const sanitizeReferences = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, ANCHOR_REF_MAX);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, ANCHOR_REF_MAX);
  }
  return [];
};

const extractReferencesFromText = (text: string): string[] => {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as LlmAnchorResponse | string[];
    if (Array.isArray(parsed)) {
      return sanitizeReferences(parsed);
    }
    if (parsed && typeof parsed === "object" && "references" in parsed) {
      return sanitizeReferences((parsed as LlmAnchorResponse).references);
    }
  } catch {
    // Fall through to heuristic parsing
  }
  return sanitizeReferences(cleaned);
};

const suggestAnchorReferences = async (prompt: string): Promise<string[]> => {
  if (!ENV.OPENAI_API_KEY) return [];
  const response = await runModel(
    [
      { role: "system", content: ANCHOR_REF_SYSTEM },
      { role: "user", content: prompt },
    ],
    {
      taskType: "classification",
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "bible_reference_candidates",
          strict: true,
          schema: ANCHOR_REF_SCHEMA,
        },
      },
      verbosity: "medium",
    },
  );
  return extractReferencesFromText(response.text || "");
};

const resolveAnchorFromReferences = async (
  prompt: string,
  references: string[],
): Promise<number | null> => {
  const parsedReferences: ParsedReference[] = [];
  for (const reference of references) {
    const parsed = parseExplicitReference(reference);
    if (parsed) parsedReferences.push(parsed);
  }

  if (parsedReferences.length === 0) return null;

  const candidates: Array<{
    id: number;
    ref: ParsedReference;
    order: number;
  }> = [];

  for (const [index, ref] of parsedReferences.entries()) {
    const startVerse = ref.verse;
    const endVerse =
      typeof ref.endVerse === "number" && ref.endVerse >= ref.verse
        ? ref.endVerse
        : ref.verse;
    const cappedEnd = Math.min(endVerse, startVerse + ANCHOR_RANGE_CAP - 1);

    for (let verseNum = startVerse; verseNum <= cappedEnd; verseNum += 1) {
      const anchorId = await profileTime(
        "anchor.resolve.llm.getVerseId",
        () => getVerseId(ref.book, ref.chapter, verseNum),
        {
          file: "bible/graphWalker.ts",
          fn: "getVerseId",
          await: "getVerseId",
        },
      );
      if (anchorId) {
        const offset = verseNum - startVerse;
        candidates.push({
          id: anchorId,
          ref: { ...ref, verse: verseNum },
          order: index * ANCHOR_RANGE_CAP + offset,
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  const { data, error } = await supabase
    .from("verses")
    .select("id, book_name, book_abbrev, chapter, verse, text")
    .in(
      "id",
      candidates.map((candidate) => candidate.id),
    );

  const verses = await ensureVersesHaveText(
    ((data || []) as Verse[]).filter((row) =>
      candidates.find((candidate) => candidate.id === row.id),
    ),
    "anchor.resolve.llm",
  );

  if (error) {
    console.warn("[Expanding Ring] LLM anchor fetch failed:", error);
  }

  const verseById = new Map<number, Verse>();
  verses.forEach((verse) => verseById.set(verse.id, verse));

  const scored = candidates
    .map((candidate) => {
      const verse = verseById.get(candidate.id);
      const overlapScore =
        verse && verse.text ? scoreOverlap(prompt, verse.text) : 0;
      return { ...candidate, score: overlapScore };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    });

  const best = scored[0];
  if (!best) return null;

  return best.id ?? null;
};

const resolveAnchorWithLLM = async (prompt: string): Promise<number | null> => {
  try {
    const references = await profileTime(
      "anchor.resolve.llm.suggest",
      () => suggestAnchorReferences(prompt),
      {
        file: "bible/expandingRingExegesis.ts",
        fn: "suggestAnchorReferences",
        await: "runModel",
      },
    );
    if (!references.length) return null;
    return resolveAnchorFromReferences(prompt, references);
  } catch (error) {
    console.warn("[Expanding Ring] LLM anchor fallback failed:", error);
    return null;
  }
};

/**
 * Resolve the anchor verse from the user prompt.
 * Order: explicit reference → concept mapping → semantic search → LLM fallback → keyword search fallback.
 */
export async function resolveAnchor(
  userPrompt: string,
): Promise<number | null> {
  // Step 1: Check for explicit reference (e.g., "John 3:16")
  const explicitRef = parseExplicitReference(userPrompt);
  if (explicitRef) {
    const anchorId = await profileTime(
      "anchor.resolve.getVerseId",
      () =>
        getVerseId(explicitRef.book, explicitRef.chapter, explicitRef.verse),
      {
        file: "bible/graphWalker.ts",
        fn: "getVerseId",
        await: "getVerseId",
      },
    );
    if (anchorId) {
      console.log(
        `[Expanding Ring] ✅ Using explicit reference: ${explicitRef.book} ${explicitRef.chapter}:${explicitRef.verse}`,
      );
      return anchorId;
    }
  }

  // Step 2: Check for known concept references
  const conceptRef = matchConcept(userPrompt);
  if (conceptRef) {
    const parsedConcept = parseExplicitReference(conceptRef);
    if (parsedConcept) {
      const anchorId = await profileTime(
        "anchor.resolve.getVerseId",
        () =>
          getVerseId(
            parsedConcept.book,
            parsedConcept.chapter,
            parsedConcept.verse,
          ),
        {
          file: "bible/graphWalker.ts",
          fn: "getVerseId",
          await: "getVerseId",
        },
      );
      if (anchorId) {
        console.log(
          `[Expanding Ring] ✅ Using concept mapping: ${parsedConcept.book} ${parsedConcept.chapter}:${parsedConcept.verse}`,
        );
        return anchorId;
      }
    }
  }

  // Step 3: Use semantic search (embeddings) for best match
  console.log(
    `[Expanding Ring] Using semantic search for anchor verse: "${userPrompt}"`,
  );

  try {
    const results = await profileTime(
      "anchor.resolve.semantic_candidates",
      () => searchVersesByQuery(userPrompt, 3, 0.6),
      {
        file: "bible/semanticSearch.ts",
        fn: "searchVersesByQuery",
        await: "searchVersesByQuery",
      },
    );

    if (results.length > 0) {
      const best = results[0];
      if (best.similarity >= SEMANTIC_STRICT_MIN) {
        console.log(
          `[Expanding Ring] ✅ Found anchor via semantic search (${(best.similarity * 100).toFixed(1)}% confidence)`,
        );
        return best.id;
      }
      console.warn(
        `[Expanding Ring] ⚠️  Semantic match below threshold (${(best.similarity * 100).toFixed(1)}% < ${(SEMANTIC_STRICT_MIN * 100).toFixed(1)}%), trying LLM fallback`,
      );
    } else {
      console.warn(
        `[Expanding Ring] ⚠️  Semantic search found no results, trying LLM fallback`,
      );
    }
  } catch (error) {
    console.error("[Expanding Ring] Semantic search failed:", error);
    console.log("[Expanding Ring] Falling back to LLM/keyword");
  }

  const llmAnchorId = await resolveAnchorWithLLM(userPrompt);
  if (llmAnchorId) {
    console.log(`[Expanding Ring] ✅ Using LLM reference fallback`);
    return llmAnchorId;
  }

  // Step 4: Fallback - Use keyword search
  const keywords = userPrompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (!keywords.length) return null;

  const candidates = await profileTime(
    "anchor.resolve.keyword_search",
    () => searchVerses(keywords, 1),
    {
      file: "bible/bibleService.ts",
      fn: "searchVerses",
      await: "searchVerses",
    },
  );
  if (!candidates.length) return null;

  const best = candidates[0];
  let bookAbbrev = best.book.toLowerCase();

  for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
    if (typeof fullName === "string" && fullName.toLowerCase() === bookAbbrev) {
      console.log(
        `[Expanding Ring] Matched full name "${fullName}" to abbrev "${abbrev}"`,
      );
      bookAbbrev = abbrev.toLowerCase();
      break;
    }
  }

  if (bookAbbrev === best.book.toLowerCase()) {
    const validAbbrev = Object.keys(BOOK_NAMES).find(
      (k) => k.toLowerCase() === bookAbbrev,
    );
    if (validAbbrev) bookAbbrev = validAbbrev.toLowerCase();
  }

  console.log(
    `[Expanding Ring] Looking up in DB: book="${bookAbbrev}", chapter=${best.chapter}, verse=${best.verse}`,
  );
  const anchorId = await profileTime(
    "anchor.resolve.getVerseId",
    () => getVerseId(bookAbbrev, best.chapter, best.verse),
    {
      file: "bible/graphWalker.ts",
      fn: "getVerseId",
      await: "getVerseId",
    },
  );

  if (anchorId) {
    console.log(`[Expanding Ring] ✅ Using keyword search fallback`);
  }

  return anchorId ?? null;
}

/**
 * Detect if query is conceptual (story-level) vs specific (verse-level)
 */
function isConceptualQuery(query: string): boolean {
  const conceptualKeywords = [
    "stories about",
    "passages about",
    "narratives about",
    "tell me about",
    "explain",
    "what does the bible say",
    "theme of",
    "examples of",
    "when jesus",
    "where god",
    "how did",
    "why did",
  ];

  const lowerQuery = query.toLowerCase();
  return conceptualKeywords.some((kw) => lowerQuery.includes(kw));
}

/**
 * Try to resolve query to a pericope FIRST (for conceptual queries)
 * Falls back gracefully if no pericope match found
 */
export async function resolvePericopeFirst(userPrompt: string): Promise<{
  pericopeId: number;
  anchorVerseId: number;
  allVerseIds: number[];
  resolutionSource: "pericope_semantic";
} | null> {
  // Skip pericope search for structured "go deeper" prompts - we already have explicit verses
  if (
    userPrompt.includes("[SOURCE ANCHOR]") &&
    userPrompt.includes("[TARGET CONNECTION]")
  ) {
    return null;
  }

  // Only try pericope resolution for conceptual queries
  if (!isConceptualQuery(userPrompt)) {
    return null;
  }

  // Search pericope embeddings
  const pericopes = await profileTime(
    "pericope.resolve.search",
    () =>
      searchPericopesByQuery(userPrompt, {
        limit: 1,
        similarityThreshold: 0.55, // Slightly lower than verse threshold
      }),
    {
      file: "bible/pericopeSearch.ts",
      fn: "searchPericopesByQuery",
      await: "searchPericopesByQuery",
    },
  );

  if (pericopes.length === 0) {
    return null;
  }

  // Get full pericope details
  const pericope = await profileTime(
    "pericope.resolve.getById",
    () => getPericopeById(pericopes[0].id),
    {
      file: "bible/pericopeSearch.ts",
      fn: "getPericopeById",
      await: "getPericopeById",
    },
  );
  if (!pericope) {
    return null;
  }

  return {
    pericopeId: pericope.id,
    anchorVerseId: pericope.verseIds[0], // First verse as anchor
    allVerseIds: pericope.verseIds,
    resolutionSource: "pericope_semantic",
  };
}

/**
 * Genealogy tree context for the LLM.
 * Depth is informative, not prescriptive for order.
 */
function generateGenealogyUserMessage(
  userPrompt: string,
  visualBundle: ReferenceVisualBundle,
): string {
  if (!visualBundle.nodes.length) {
    return `USER QUERY: "${userPrompt}"

=== THE CLOUD OF WITNESSES (Available Data) ===

No cross-reference data was found for this anchor.`;
  }

  const nodesByDepth: Record<number, ReferenceTreeNode[]> = {};
  for (const node of visualBundle.nodes) {
    (nodesByDepth[node.depth] ??= []).push(node);
  }

  const depths = Object.keys(nodesByDepth).map(Number);
  const maxDepth = depths.length ? Math.max(...depths) : 0;

  const formatBlock = (label: string, verses: ReferenceTreeNode[]) =>
    verses.length
      ? `${label}\n${verses
          .map((v) => {
            const similarityTier =
              v.similarity !== undefined
                ? v.similarity >= 0.75
                  ? "HIGH"
                  : v.similarity >= 0.55
                    ? "MID"
                    : "LOW"
                : "";
            const similarity =
              v.similarity !== undefined
                ? ` [${similarityTier} ${(v.similarity * 100).toFixed(0)}%]`
                : "";
            const parallels =
              v.parallelPassages && v.parallelPassages.length > 0
                ? v.parallelPassages
                    .slice(0, 2)
                    .map(
                      (p) =>
                        `${p.book_name} ${p.chapter}:${p.verse} (${Math.round(
                          p.similarity * 100,
                        )}%)`,
                    )
                    .join("; ")
                : "";
            const parallelNote = parallels ? ` (Parallels: ${parallels})` : "";
            return `ID:${v.id} [${v.book_name} ${v.chapter}:${v.verse}]${similarity} "${v.text}"${parallelNote}`;
          })
          .join("\n")}\n\n`
      : "";

  let genealogyData = "";

  genealogyData += formatBlock("[ANCHOR (Depth 0)]", nodesByDepth[0] ?? []);
  genealogyData += formatBlock(
    `[CLOSE WITNESSES (Depth 1 - ${(nodesByDepth[1] ?? []).length} verses)]`,
    nodesByDepth[1] ?? [],
  );
  genealogyData += formatBlock(
    `[EXTENDED WITNESSES (Depth 2 - ${(nodesByDepth[2] ?? []).length} verses)]`,
    nodesByDepth[2] ?? [],
  );

  const deeper: ReferenceTreeNode[] = [];
  for (let depth = 3; depth <= maxDepth; depth++) {
    deeper.push(...(nodesByDepth[depth] ?? []));
  }
  if (deeper.length) {
    genealogyData += formatBlock(
      `[BROADER CANONICAL ECHOES (Depth 3+ - ${deeper.length} verses)]`,
      deeper,
    );
  }

  return `USER QUERY: "${userPrompt}"

=== THE CLOUD OF WITNESSES (Available Data) ===

This genealogy tree shows connected KJV cross-references.
Depth indicates how many steps away a verse is from the anchor, but you are NOT required to follow this depth order when teaching.

Use depth only as a hint of closeness, not as a script.

Total verses in tree: ${visualBundle.nodes.length}
Total reference connections: ${visualBundle.edges.length}
${
  visualBundle.pericopeValidation &&
  visualBundle.pericopeValidation.droppedEdges > 0
    ? `Filtered cross-pericope connections: ${visualBundle.pericopeValidation.droppedEdges} (similarity < ${visualBundle.pericopeValidation.minSimilarity.toFixed(
        2,
      )})`
    : ""
}

${genealogyData}

GUIDANCE FOR HOW TO USE THIS DATA:
- These verses are the ONLY allowed sources. Do not cite anything outside this list.
- If MAP SESSION RULES are provided above, follow them exactly.
- Choose the verses that best clarify the anchor and the user's question.`;
}

/**
 * Build layered user message: Narrative → Verses → Question
 *
 * This is the KEY CHANGE: ordering context from highest level (story)
 * to lowest level (verse details) to user question
 */
export function buildLayeredUserMessage(
  userPrompt: string,
  visualBundle: ReferenceVisualBundle,
  pericopeDetail: PericopeDetail | null,
  mapSession?: MapSession,
): string {
  const layers: string[] = [];

  const formatRefById = (id: number) => {
    const node = visualBundle.nodes.find((n) => n.id === id);
    if (!node) return `Verse ${id}`;
    return `${node.book_name} ${node.chapter}:${node.verse}`;
  };
  const findEdgeWeight = (fromId: number, toId: number) => {
    const edge = visualBundle.edges.find(
      (e) =>
        (e.from === fromId && e.to === toId) ||
        (e.from === toId && e.to === fromId),
    );
    return typeof edge?.weight === "number" ? edge.weight : null;
  };

  // LAYER 1: NARRATIVE CONTEXT (if available)
  if (pericopeDetail) {
    const themes = pericopeDetail.themes?.join(", ") || "";
    const archetypes = pericopeDetail.archetypes?.join(", ") || "";
    const shadows =
      pericopeDetail.shadows && pericopeDetail.shadows.length > 0
        ? pericopeDetail.shadows.map((s) => `  - ${s}`).join("\n")
        : "";

    layers.push(`[NARRATIVE CONTEXT]

Pericope: ${pericopeDetail.title_generated || pericopeDetail.title} (${pericopeDetail.rangeRef})
${themes ? `Themes: ${themes}` : ""}
${archetypes ? `Archetypes: ${archetypes}` : ""}
${shadows ? `Typological Shadows:\n${shadows}` : ""}
Context: ${pericopeDetail.summary || pericopeDetail.full_text.slice(0, 420) + "..."}`);
  }

  if (mapSession) {
    const lines: string[] = [];
    lines.push("[MAP SESSION RULES]");
    lines.push(
      "You must use ONLY verses listed in the tree below. Do not cite anything else.",
    );
    if (mapSession.currentConnection) {
      lines.push(
        "Focus only on the CURRENT CONNECTION verses. Do not introduce other verses for interpretation.",
      );
      lines.push(
        "If one of the CURRENT CONNECTION verses interprets the other, follow that wording only.",
      );
      lines.push(
        "Do not propose any next verse or thread. Stay within the CURRENT TOPIC only.",
      );
    }
    if (mapSession.cluster && mapSession.cluster.verseIds.length > 0) {
      const topicIds = [
        mapSession.cluster.baseId,
        ...mapSession.cluster.verseIds.filter(
          (id) => id !== mapSession.cluster!.baseId,
        ),
      ];
      const topicRefs = topicIds.map((id) => formatRefById(id));
      lines.push(
        `CURRENT TOPIC (${mapSession.cluster.connectionType}): ${topicRefs
          .map((ref, idx) => `#${topicIds[idx]} [${ref}]`)
          .join(", ")}`,
      );
      lines.push(
        "Explain the CURRENT TOPIC by weaving the most relevant verses into a coherent exegesis. Use as many verses as needed, not all.",
      );
      lines.push("Be concise and precise; every sentence must earn its place.");
    }
    if (mapSession.offMapReferences && mapSession.offMapReferences.length > 0) {
      lines.push(
        `The user referenced ${mapSession.offMapReferences
          .map((ref) => `"${ref}"`)
          .join(", ")}, which is not in this map. Say this plainly.`,
      );
    }
    if (mapSession.currentConnection) {
      lines.push(
        `CURRENT CONNECTION: [${formatRefById(
          mapSession.currentConnection.fromId,
        )}] <> [${formatRefById(
          mapSession.currentConnection.toId,
        )}] (Type: ${mapSession.currentConnection.connectionType})`,
      );
      const edgeWeight = findEdgeWeight(
        mapSession.currentConnection.fromId,
        mapSession.currentConnection.toId,
      );
      if (edgeWeight !== null) {
        lines.push(`EDGE WEIGHT: ${edgeWeight.toFixed(2)}`);
      }
    }
    if (mapSession.previousConnection && mapSession.currentConnection) {
      const previousFrom = formatRefById(mapSession.previousConnection.fromId);
      const previousTo = formatRefById(mapSession.previousConnection.toId);
      const currentAnchor = formatRefById(mapSession.currentConnection.fromId);
      lines.push(
        `CONTINUATION CONTEXT: Previous edge [${previousFrom}] <> [${previousTo}]. Continue from [${currentAnchor}] into the CURRENT CONNECTION; do not re-explain the previous edge.`,
      );
    }
    if (mapSession.exhausted) {
      lines.push(
        "STATUS: All connections in this map have been explored. Say this plainly and end with closure (no question).",
      );
    }
    layers.push(lines.join("\n"));
  }

  // LAYER 2: VERSE DETAILS (genealogy tree)
  const genealogyBlock = generateGenealogyUserMessage(userPrompt, visualBundle);
  layers.push(genealogyBlock);

  // LAYER 3: USER QUESTION (refocused)
  // No change - already included in genealogyBlock

  return layers.join("\n\n───\n\n");
}

/**
 * Compute simple stats for the genealogy tree.
 */
function computeTreeStats(visualBundle: ReferenceVisualBundle): TreeStats {
  if (!visualBundle.nodes.length) return { ...EMPTY_TREE_STATS };

  const depthDistribution: Record<number, number> = {};
  for (const node of visualBundle.nodes) {
    depthDistribution[node.depth] = (depthDistribution[node.depth] ?? 0) + 1;
  }

  return {
    totalNodes: visualBundle.nodes.length,
    maxDepth: Math.max(...visualBundle.nodes.map((n) => n.depth)),
    depthDistribution,
  };
}

const DISCOVERY_GATE_DEFAULTS = {
  minNodes: 24,
  minDepth2Plus: 6,
  minEdgeTypes: 3,
  minNonDeeperEdges: 4,
};

function shouldRunDiscovery(
  visualBundle: ReferenceVisualBundle,
  treeStats: TreeStats,
): { run: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const edgeTypes = new Set(
    visualBundle.edges.map((edge) => edge.type || "DEEPER"),
  );
  const depth2Plus =
    (treeStats.depthDistribution[2] ?? 0) +
    (treeStats.depthDistribution[3] ?? 0);
  const nonDeeperEdges = visualBundle.edges.filter(
    (edge) => edge.type !== "DEEPER",
  ).length;

  if (visualBundle.nodes.length < DISCOVERY_GATE_DEFAULTS.minNodes) {
    reasons.push("small_graph");
  }
  if (
    treeStats.maxDepth < 2 ||
    depth2Plus < DISCOVERY_GATE_DEFAULTS.minDepth2Plus
  ) {
    reasons.push("shallow_depth");
  }
  if (edgeTypes.size < DISCOVERY_GATE_DEFAULTS.minEdgeTypes) {
    reasons.push("low_edge_diversity");
  }
  if (nonDeeperEdges < DISCOVERY_GATE_DEFAULTS.minNonDeeperEdges) {
    reasons.push("low_structural_edges");
  }

  return { run: reasons.length > 0, reasons };
}

/**
 * Build a Verse from a tree node, falling back to an empty verse if needed.
 */
function buildAnchorFromTree(
  visualBundle: ReferenceVisualBundle,
  anchorId: number,
): Verse {
  const node =
    visualBundle.nodes.find((n) => n.id === anchorId) ??
    ({
      id: anchorId,
      book_abbrev: "",
      book_name: "",
      chapter: 0,
      verse: 0,
      text: "",
    } as ReferenceTreeNode);

  return {
    id: node.id,
    book_abbrev: node.book_abbrev,
    book_name: node.book_name,
    chapter: node.chapter,
    verse: node.verse,
    text: node.text,
  };
}

/**
 * Build a combined reference tree from multiple anchor verses.
 * This enables multi-perspective synthesis by exploring Scripture from multiple entry points.
 *
 * @param anchorIds - Array of anchor verse IDs
 * @param userPrompt - User's query for semantic ranking
 * @returns Combined visual bundle with nodes and edges from all anchors
 */
export async function buildMultiAnchorTree(
  anchorIds: number[],
  userPrompt: string,
): Promise<ReferenceVisualBundle> {
  const startTime = Date.now();
  const maxNodesTotal = 120;
  let remainingBudget = maxNodesTotal;
  const intentProfile = inferIntentProfile(userPrompt);
  const edgeTypeBonuses = buildEdgeTypeBonuses(intentProfile);
  const selectionDefaults = {
    mode: "hybrid" as const,
    query: userPrompt,
    versePoolSize: 100,
    pericopePoolSize: 30,
    pericopeMaxVerses: 300,
    strongPercentile: 0.85,
    minStrongSim: 0.12,
    edgeWeightBonus: 0.12,
    coherenceBonus: 0.06,
    diversityMaxPerBook: 2,
    edgeTypeBonuses,
    fallbackLimit: 0,
    queryWeight: 0.35,
    anchorWeight: 1.0,
  };
  const adaptiveDefaults = {
    enabled: true,
    startLimit: 12,
    minLimit: 2,
    multiplier: 2,
    signalThreshold: 0.8,
  };

  // Deduplicate anchor IDs to prevent multiple trees from the same verse
  console.log(`[Multi-Anchor DEBUG] Original anchors:`, anchorIds);
  const uniqueAnchorIds = Array.from(new Set(anchorIds));
  console.log(`[Multi-Anchor DEBUG] After dedup:`, uniqueAnchorIds);

  if (uniqueAnchorIds.length < anchorIds.length) {
    console.log(
      `[Multi-Anchor] ⚠️ Removed ${anchorIds.length - uniqueAnchorIds.length} duplicate anchor(s)`,
    );
  }

  // Deduplicate anchors by reference key (e.g., same verse across translations/IDs)
  const { data: anchorRows, error: anchorError } = await supabase
    .from("verses")
    .select("id, book_name, book_abbrev, chapter, verse")
    .in("id", uniqueAnchorIds);
  if (anchorError) {
    console.warn(
      "[Multi-Anchor] Failed to load anchor references for dedupe:",
      anchorError.message,
    );
  }
  const anchorInfoById = new Map<number, ReferenceTreeNode>();
  (anchorRows || []).forEach((row) => {
    anchorInfoById.set(row.id, row as ReferenceTreeNode);
  });

  const seenReferenceKeys = new Set<string>();
  const dedupedAnchorIds: number[] = [];
  uniqueAnchorIds.forEach((id) => {
    const info = anchorInfoById.get(id);
    if (!info) {
      dedupedAnchorIds.push(id);
      return;
    }
    const key = normalizeReferenceKey(info);
    if (seenReferenceKeys.has(key)) {
      console.log(
        `[Multi-Anchor] ⚠️ Removed duplicate anchor reference: ${key} (id=${id})`,
      );
      return;
    }
    seenReferenceKeys.add(key);
    dedupedAnchorIds.push(id);
  });

  if (dedupedAnchorIds.length < uniqueAnchorIds.length) {
    console.log(
      `[Multi-Anchor] ⚠️ Removed ${uniqueAnchorIds.length - dedupedAnchorIds.length} duplicate anchor reference(s)`,
    );
  }

  console.log(
    `[Multi-Anchor] Building combined tree from ${dedupedAnchorIds.length} anchors`,
  );

  console.log(
    `[Multi-Anchor] Building trees with adaptive expansion across ${dedupedAnchorIds.length} anchors`,
  );

  // Build a tree from each anchor
  const trees: ReferenceVisualBundle[] = [];

  let primaryPericopeContext: ReferenceVisualBundle["pericopeContext"];

  for (let i = 0; i < dedupedAnchorIds.length; i++) {
    const anchorId = dedupedAnchorIds[i];
    const anchorsRemaining = dedupedAnchorIds.length - i;
    const perAnchorBudget =
      anchorsRemaining > 0
        ? Math.max(Math.floor(remainingBudget / anchorsRemaining), 1)
        : remainingBudget;
    console.log(
      `[Multi-Anchor] Building tree ${i + 1}/${dedupedAnchorIds.length} from verse ${anchorId}...`,
    );

    const pericopeScope = await profileTime(
      "multi_anchor.buildPericopeScope",
      () => buildPericopeScopeForVerse(anchorId),
      {
        file: "bible/pericopeGraphWalker.ts",
        fn: "buildPericopeScopeForVerse",
        await: "buildPericopeScopeForVerse",
      },
    );

    const tree = (await profileTime(
      "multi_anchor.buildVisualBundle",
      () =>
        buildVisualBundle(
          anchorId,
          pericopeScope?.pericopeIds
            ? {
                scope: { pericopeIds: pericopeScope.pericopeIds },
                selection: {
                  ...selectionDefaults,
                  maxNodes: perAnchorBudget,
                  maxDepth: 2,
                },
                adaptive: adaptiveDefaults,
              }
            : {
                selection: {
                  ...selectionDefaults,
                  maxNodes: perAnchorBudget,
                  maxDepth: 2,
                },
                adaptive: adaptiveDefaults,
              },
          {
            includeDEEPER: true,
            includeROOTS: true,
            includeECHOES: true,
            includePROPHECY: true,
            includeGENEALOGY: false,
          },
        ),
      {
        file: "bible/graphWalker.ts",
        fn: "buildVisualBundle",
        await: "buildVisualBundle",
      },
    )) as ReferenceVisualBundle;
    remainingBudget = Math.max(remainingBudget - tree.nodes.length, 0);

    if (i === 0 && pericopeScope?.pericopeContext) {
      primaryPericopeContext = {
        id: pericopeScope.pericopeContext.id,
        title:
          pericopeScope.pericopeContext.title_generated ||
          pericopeScope.pericopeContext.title,
        summary: pericopeScope.pericopeContext.summary || "",
        themes: pericopeScope.pericopeContext.themes || [],
        archetypes: pericopeScope.pericopeContext.archetypes || [],
        shadows: pericopeScope.pericopeContext.shadows || [],
        rangeRef: pericopeScope.pericopeContext.rangeRef,
      };
    } else if (i === 0 && tree.pericopeContext) {
      primaryPericopeContext = tree.pericopeContext;
    }
    trees.push(tree);
  }

  // Combine all nodes and edges
  const allNodes: ReferenceTreeNode[] = [];
  const allEdges: ReferenceTreeEdge[] = [];
  const seenNodeIds = new Set<number>();

  for (const tree of trees) {
    console.log(
      `[Multi-Anchor DEBUG] Processing tree with ${tree.nodes.length} nodes`,
    );

    // Add nodes (skip duplicates)
    let duplicateCount = 0;
    for (const node of tree.nodes) {
      if (!seenNodeIds.has(node.id)) {
        allNodes.push(node);
        seenNodeIds.add(node.id);
      } else {
        duplicateCount++;
        console.log(
          `[Multi-Anchor DEBUG] Skipping duplicate node: ${node.id} (${node.book_abbrev} ${node.chapter}:${node.verse})`,
        );
      }
    }
    if (duplicateCount > 0) {
      console.log(
        `[Multi-Anchor DEBUG] Skipped ${duplicateCount} duplicate nodes from this tree`,
      );
    }

    // Add edges (skip duplicates)
    for (const edge of tree.edges) {
      const edgeKey = `${edge.from}-${edge.to}`;
      if (!allEdges.some((e) => `${e.from}-${e.to}` === edgeKey)) {
        allEdges.push(edge);
      }
    }
  }

  console.log(
    `[Multi-Anchor DEBUG] Final node count: ${allNodes.length}, Root ID will be: ${dedupedAnchorIds[0]}`,
  );

  const elapsed = Date.now() - startTime;
  console.log(
    `[Multi-Anchor] ✅ Combined tree built in ${elapsed}ms: ` +
      `${allNodes.length} nodes, ${allEdges.length} edges from ${trees.length} anchors`,
  );

  // Return combined bundle
  return {
    nodes: allNodes,
    edges: allEdges,
    rootId: dedupedAnchorIds[0], // First anchor is the root for circular layout
    lens: "NONE",
    pericopeContext: primaryPericopeContext,
  };
}

/**
 * KERNEL 3-SIM Pipeline: Streaming genealogy-tree exegesis with epistemic rigor
 * Runs SIM-1 (mechanism) → SIM-2 (coherence) → SIM-3 (teaching) in sequence.
 * Only SIM-3 output is streamed to the user.
 */
export async function explainScriptureWithKernelStream(
  res: Response,
  userPrompt: string,
  useMultiAnchor: boolean = true, // Enable multi-anchor synthesis by default
  promptMode: PromptMode = "exegesis_long",
  prebuiltVisualBundle?: ReferenceVisualBundle | null, // Pre-built bundle to skip tree rebuilding
  mapSession?: MapSession | null,
  mapMode?: "fast" | "full",
): Promise<{
  anchor: Verse;
  anchorId: number | null;
  treeStats: TreeStats;
  visualBundle: ReferenceVisualBundle | null;
  sim1?: unknown;
  sim2?: unknown;
}> {
  // If we have a pre-built bundle, use it and skip all resolution/tree building
  if (
    prebuiltVisualBundle &&
    prebuiltVisualBundle.nodes &&
    prebuiltVisualBundle.nodes.length > 0
  ) {
    console.log(
      `[Expanding Ring] ✅ Using pre-built visual bundle (${prebuiltVisualBundle.nodes.length} nodes) - skipping tree rebuild`,
    );

    const visualBundle: ReferenceVisualBundle =
      collapseDuplicateReferencesInBundle(prebuiltVisualBundle);
    const anchorId = visualBundle.rootId || visualBundle.nodes[0]?.id || null;

    // Extract anchor verse from pre-built bundle nodes
    const anchorNode = visualBundle.nodes.find((n) => n.id === anchorId);
    const anchor: Verse | null = anchorNode
      ? {
          id: anchorNode.id,
          book_abbrev: anchorNode.book_abbrev,
          book_name: anchorNode.book_name,
          chapter: anchorNode.chapter,
          verse: anchorNode.verse,
          text: anchorNode.text,
        }
      : null;

    if (!anchor) {
      throw new Error("Pre-built bundle has no valid anchor verse");
    }

    const pericopeDetail = visualBundle.pericopeContext?.id
      ? await profileTime(
          "exegesis.prebuilt.getPericopeById",
          () => getPericopeById(visualBundle.pericopeContext!.id),
          {
            file: "bible/pericopeSearch.ts",
            fn: "getPericopeById",
            await: "getPericopeById",
          },
        )
      : null;
    // Build user message from the pre-built bundle
    res.write("event: map_data\n");
    res.write(`data: ${JSON.stringify(visualBundle)}\n\n`);

    const userMessage = buildLayeredUserMessage(
      userPrompt,
      visualBundle,
      pericopeDetail,
      mapSession ?? undefined,
    );
    const anchorRef = anchor
      ? `${anchor.book_name} ${anchor.chapter}:${anchor.verse}`
      : undefined;
    const strategy = buildResponseStrategy({
      mode: promptMode,
      userPrompt,
      mapSession,
      anchorRef,
      pericopeTitle:
        pericopeDetail?.title_generated || pericopeDetail?.title || undefined,
    });
    const systemPrompt = buildSystemPrompt(strategy);

    // Check user input for guardrail violations
    const inputCheck = checkUserInput(userPrompt);
    if (!inputCheck.passed) {
      console.warn(
        "[Exegesis] User input guardrail violation:",
        inputCheck.violations,
      );
    }

    // Stream the response directly with validation and guardrails enabled
    const requestId = generateRequestId();
    await profileTime(
      "exegesis.prebuilt.runModelStream",
      () =>
        runModelStream(
          res,
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          {
            model: ENV.OPENAI_SMART_MODEL,
            requestId,
            taskType: "deep_exegesis",
            enableValidation: true,
            enableGuardrails: true,
          },
        ),
      {
        file: "ai/runModelStream.ts",
        fn: "runModelStream",
        await: "client.responses.create",
      },
    );

    return {
      anchor,
      anchorId,
      treeStats: {
        totalNodes: visualBundle.nodes.length,
        maxDepth: 0,
        depthDistribution: {},
      },
      visualBundle,
    };
  }

  // Original path: Build tree from scratch
  const isFastMap = mapMode === "fast";
  const allowMultiAnchor = useMultiAnchor && !isFastMap;
  let anchorIds: number[] = [];
  let visualBundle: ReferenceVisualBundle;
  let pericopeContext: Awaited<ReturnType<typeof getPericopeById>> | null =
    null;
  let pericopeBundle: PericopeBundle | null = null;
  let pericopeScopeIds: number[] | null = null;
  let resolutionType: "pericope_first" | "verse_first" = "verse_first";

  // Try pericope-first resolution for conceptual queries
  const pericopeResolution = await profileTime(
    "exegesis.resolvePericopeFirst",
    () => resolvePericopeFirst(userPrompt),
    {
      file: "bible/expandingRingExegesis.ts",
      fn: "resolvePericopeFirst",
      await: "resolvePericopeFirst",
    },
  );
  if (pericopeResolution) {
    // Use pericope's verses as anchors
    anchorIds = pericopeResolution.allVerseIds.slice(
      0,
      allowMultiAnchor ? 3 : 1,
    );

    // Get pericope context
    pericopeContext = await profileTime(
      "exegesis.getPericopeById",
      () => getPericopeById(pericopeResolution.pericopeId),
      {
        file: "bible/pericopeSearch.ts",
        fn: "getPericopeById",
        await: "getPericopeById",
      },
    );
    resolutionType = "pericope_first";

    console.log(
      `[Expanding Ring] ✅ Resolved via pericope: ${pericopeContext?.title} (${anchorIds.length} verses)`,
    );
  }

  // Fallback: If pericope resolution failed, use verse-first
  if (anchorIds.length === 0) {
    if (allowMultiAnchor) {
      anchorIds = await profileTime(
        "exegesis.resolveMultipleAnchors",
        () => resolveMultipleAnchors(userPrompt, 3),
        {
          file: "bible/expandingRingExegesis.ts",
          fn: "resolveMultipleAnchors",
          await: "resolveMultipleAnchors",
        },
      );
    }
  }

  // Final fallback to single anchor if multi-anchor fails or is disabled
  if (anchorIds.length === 0) {
    const singleAnchor = await profileTime(
      "exegesis.resolveAnchor",
      () => resolveAnchor(userPrompt),
      {
        file: "bible/expandingRingExegesis.ts",
        fn: "resolveAnchor",
        await: "resolveAnchor",
      },
    );
    if (singleAnchor) {
      anchorIds = [singleAnchor];
    }
  }

  if (anchorIds.length === 0) {
    res.write("event: content\n");
    res.write(
      `data: ${JSON.stringify({ delta: ANCHOR_NOT_FOUND_MESSAGE })}\n\n`,
    );
    res.write("event: done\n");
    res.write(`data: ${JSON.stringify({ citations: [] })}\n\n`);

    return {
      anchor: EMPTY_VERSE,
      anchorId: null,
      treeStats: { ...EMPTY_TREE_STATS },
      visualBundle: null,
    };
  }

  const anchorId = anchorIds[0]; // Primary anchor for compatibility
  const intentProfile = inferIntentProfile(userPrompt);
  const edgeTypeBonuses = buildEdgeTypeBonuses(intentProfile);

  if (!allowMultiAnchor || anchorIds.length === 1) {
    const pericopeScope = await profileTime(
      "exegesis.buildPericopeScope",
      () => buildPericopeScopeForVerse(anchorId, pericopeContext),
      {
        file: "bible/pericopeGraphWalker.ts",
        fn: "buildPericopeScopeForVerse",
        await: "buildPericopeScopeForVerse",
      },
    );

    if (pericopeScope?.pericopeContext) {
      pericopeContext = pericopeScope.pericopeContext;
    }
    if (pericopeScope?.pericopeBundle) {
      pericopeBundle = pericopeScope.pericopeBundle as PericopeBundle;
    }
    if (pericopeScope?.pericopeIds) {
      pericopeScopeIds = pericopeScope.pericopeIds;
    }
  }

  // Build tree(s) - use multi-anchor if we have multiple
  if (anchorIds.length > 1 && allowMultiAnchor) {
    console.log(
      `[KERNEL Stream] Using multi-anchor synthesis with ${anchorIds.length} anchors`,
    );
    visualBundle = await profileTime(
      "exegesis.buildMultiAnchorTree",
      () => buildMultiAnchorTree(anchorIds, userPrompt),
      {
        file: "bible/expandingRingExegesis.ts",
        fn: "buildMultiAnchorTree",
        await: "buildMultiAnchorTree",
      },
    );
  } else {
    console.log(`[KERNEL Stream] Using single anchor: ${anchorId}`);
    visualBundle = (await profileTime(
      "exegesis.buildVisualBundle",
      () =>
        buildVisualBundle(
          anchorId,
          {
            ...(isFastMap
              ? { ring3Limit: 0 }
              : {
                  selection: {
                    mode: "hybrid",
                    query: userPrompt,
                    versePoolSize: 100,
                    pericopePoolSize: 30,
                    pericopeMaxVerses: 300,
                    strongPercentile: 0.85,
                    minStrongSim: 0.12,
                    edgeWeightBonus: 0.12,
                    coherenceBonus: 0.06,
                    diversityMaxPerBook: 2,
                    edgeTypeBonuses,
                    fallbackLimit: 0,
                    queryWeight: 0.35,
                    anchorWeight: 1.0,
                  },
                  adaptive: {
                    enabled: true,
                    startLimit: 12,
                    minLimit: 2,
                    multiplier: 2,
                    signalThreshold: 0.8,
                  },
                }),
            ...(pericopeScopeIds
              ? { scope: { pericopeIds: pericopeScopeIds } }
              : {}),
          },
          {
            includeDEEPER: true,
            includeROOTS: true,
            includeECHOES: true,
            includePROPHECY: true,
            includeGENEALOGY: false,
          },
        ),
      {
        file: "bible/graphWalker.ts",
        fn: "buildVisualBundle",
        await: "buildVisualBundle",
      },
    )) as ReferenceVisualBundle;
  }

  // Rank verses by semantic similarity to user query
  visualBundle = await profileTime(
    "exegesis.rankVersesBySimilarity",
    () => rankVersesBySimilarity(visualBundle, userPrompt),
    {
      file: "bible/expandingRingExegesis.ts",
      fn: "rankVersesBySimilarity",
      await: "rankVersesBySimilarity",
    },
  );

  // Remove duplicate/parallel passages
  visualBundle = await profileTime(
    "exegesis.deduplicateVerses",
    () => deduplicateVerses(visualBundle),
    {
      file: "bible/expandingRingExegesis.ts",
      fn: "deduplicateVerses",
      await: "deduplicateVerses",
    },
  );

  if (!pericopeContext && visualBundle.pericopeContext?.id) {
    pericopeContext = await profileTime(
      "exegesis.getPericopeById",
      () => getPericopeById(visualBundle.pericopeContext!.id),
      {
        file: "bible/pericopeSearch.ts",
        fn: "getPericopeById",
        await: "getPericopeById",
      },
    );
  }

  const treeStats = computeTreeStats(visualBundle);
  const anchor = buildAnchorFromTree(visualBundle, anchorId);

  // Attach resolution metadata
  visualBundle.resolutionType = resolutionType; // From Phase 1, line 889
  if (pericopeContext) {
    visualBundle.pericopeContext = {
      id: pericopeContext.id,
      title: pericopeContext.title_generated || pericopeContext.title,
      summary: pericopeContext.summary || "",
      themes: pericopeContext.themes || [],
      archetypes: pericopeContext.archetypes || [],
      shadows: pericopeContext.shadows || [],
      rangeRef: pericopeContext.rangeRef,
    };
  }
  if (pericopeBundle) {
    visualBundle.pericopeBundle = pericopeBundle;
  } else if (pericopeContext) {
    try {
      const fallbackBundle = await profileTime(
        "exegesis.buildPericopeBundle",
        () => buildPericopeScopeForVerse(anchorId, pericopeContext),
        {
          file: "bible/pericopeGraphWalker.ts",
          fn: "buildPericopeScopeForVerse",
          await: "buildPericopeScopeForVerse",
        },
      );
      if (fallbackBundle?.pericopeBundle) {
        visualBundle.pericopeBundle =
          fallbackBundle.pericopeBundle as PericopeBundle;
      }
    } catch (error) {
      console.warn(
        "[Expanding Ring] Pericope bundle build failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!isFastMap) {
    visualBundle = await profileTime(
      "exegesis.discoverConnections",
      async () => {
        const bundleForDiscovery =
          visualBundle as unknown as VisualContextBundle;
        const coreVerses = selectCoreVerses(bundleForDiscovery);
        if (coreVerses.length === 0) return visualBundle;

        const discoveryGate = shouldRunDiscovery(visualBundle, treeStats);
        if (!discoveryGate.run) {
          console.log(
            `[Connection Discovery] Proceeding despite low-yield gate (${discoveryGate.reasons.join(", ")})`,
          );
        }

        const coreIds = coreVerses.map((v) => v.id);
        const cached = await fetchPersistedConnections(coreIds);
        if (cached.length > 0) {
          console.log(
            `[Connection Discovery] Using ${cached.length} cached connection(s)`,
          );
          return mergeDiscoveredEdges(visualBundle, cached, "llm_cached");
        }

        if (!ENV.OPENAI_API_KEY) {
          return visualBundle;
        }

        const discovered = await discoverConnections(
          coreVerses.map((v) => ({
            id: v.id,
            reference: `${v.book_name} ${v.chapter}:${v.verse}`,
            text: v.text,
            book: v.book_name,
          })),
        );

        if (discovered.length > 0) {
          await persistDiscoveredConnections(discovered);
          return mergeDiscoveredEdges(
            visualBundle,
            discovered,
            "llm_discovered",
          );
        }

        return visualBundle;
      },
      {
        file: "bible/expandingRingExegesis.ts",
        fn: "discoverConnections",
        await: "discoverConnections",
      },
    );
  }

  // Send map data first
  res.write("event: map_data\n");
  res.write(`data: ${JSON.stringify(visualBundle)}\n\n`);

  // === SINGLE-PASS STREAMING: Read tree, deliver teaching immediately ===
  console.log("[Fast Stream] Starting single-pass teaching generation...");

  const anchorRef = anchor
    ? `${anchor.book_name} ${anchor.chapter}:${anchor.verse}`
    : undefined;
  const strategy = buildResponseStrategy({
    mode: promptMode,
    userPrompt,
    mapSession,
    anchorRef,
    pericopeTitle:
      pericopeContext?.title_generated || pericopeContext?.title || undefined,
  });
  const systemPrompt = buildSystemPrompt(strategy);
  // Use layered prompt builder (pericope context already fetched in Phase 1)
  const userMessage = buildLayeredUserMessage(
    userPrompt,
    visualBundle,
    pericopeContext, // From Phase 1, line 898
    mapSession ?? undefined,
  );

  // Check user input for guardrail violations
  const inputCheck = checkUserInput(userPrompt);
  if (!inputCheck.passed) {
    console.warn(
      "[Exegesis] User input guardrail violation:",
      inputCheck.violations,
    );
  }

  // Stream with validation and guardrails enabled
  const requestId = generateRequestId();
  await profileTime(
    "exegesis.runModelStream",
    () =>
      runModelStream(
        res,
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        {
          toolSpecs: [],
          toolMap: {},
          model: ENV.OPENAI_SMART_MODEL,
          reasoningEffort: "low", // Explicit low reasoning for faster streaming
          requestId,
          taskType: "deep_exegesis",
          enableValidation: true,
          enableGuardrails: true,
        },
      ),
    {
      file: "ai/runModelStream.ts",
      fn: "runModelStream",
      await: "client.responses.create",
    },
  );

  console.log("[Fast Stream] Teaching complete");

  return {
    anchor,
    anchorId,
    treeStats,
    visualBundle,
  };
}
