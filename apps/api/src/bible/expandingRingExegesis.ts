/**
 * Expanding Ring Exegesis / Reference Genealogy
 * KJV-only exegesis over a Bible graph, optimized for user clarity (not graph order).
 */

import { runModelStream } from "../ai/runModelStream";
import type { Response } from "express";
import { getVerseId, buildVisualBundle, type Verse } from "./graphWalker";
import { searchVerses } from "./bibleService";
import { parseExplicitReference } from "./referenceParser";
import { matchConcept } from "./conceptMapping";
import { BOOK_NAMES } from "./bookNames";
import { findAnchorVerse, findMultipleAnchorVerses } from "./semanticSearch";
import { supabase } from "../db";
import { makeOpenAI } from "../ai";
import { ENV } from "../env";
import type { ParallelPassage, PericopeBundle } from "./types";
import { areSameTestament } from "./testamentUtil";
import { type PromptMode, buildSystemPrompt } from "../prompts/systemPrompts";
import {
  searchPericopesByQuery,
  getPericopeById,
  type PericopeDetail,
} from "./pericopeSearch";
import { buildPericopeBundle } from "./pericopeGraphWalker";

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
}

export interface ReferenceTreeEdge {
  from: number;
  to: number;
}

export interface ReferenceVisualBundle {
  nodes: ReferenceTreeNode[];
  edges: ReferenceTreeEdge[];
  rootId?: number; // Anchor verse ID for circular layout
  lens?: string; // Lens type (e.g., "NONE", "MESSIANIC")
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

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
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
    // Step 1: Generate embedding for user query
    const client = makeOpenAI();
    if (!client) {
      throw new Error("OpenAI client not configured");
    }
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: userQuery,
      dimensions: 1536,
    });
    const queryEmbedding = response.data[0].embedding;

    // Step 2: Fetch embeddings for all verses in the bundle
    const verseIds = visualBundle.nodes.map((n) => n.id);
    const { data: verses, error } = await supabase
      .from("verses")
      .select("id, embedding")
      .in("id", verseIds);

    if (error || !verses) {
      console.error("[Verse Ranking] Failed to fetch verse embeddings:", error);
      return visualBundle;
    }

    // Create a map of verse ID to embedding
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
            `[Verse Ranking] Failed to parse embedding for verse ${verse.id}`,
          );
        }
      }
    }

    // Step 3: Compute similarity for each node
    let scoredCount = 0;
    for (const node of visualBundle.nodes) {
      const verseEmbedding = embeddingMap.get(node.id);
      if (verseEmbedding) {
        node.similarity = cosineSimilarity(queryEmbedding, verseEmbedding);
        scoredCount++;
      } else {
        node.similarity = 0; // No embedding available
      }
    }

    // Step 4: Sort nodes within each depth level by similarity (highest first)
    // This preserves the tree structure while prioritizing relevant verses
    const nodesByDepth: Record<number, ReferenceTreeNode[]> = {};
    for (const node of visualBundle.nodes) {
      (nodesByDepth[node.depth] ??= []).push(node);
    }

    for (const depth in nodesByDepth) {
      nodesByDepth[depth].sort(
        (a, b) => (b.similarity || 0) - (a.similarity || 0),
      );
    }

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
  const { data: verses, error } = await supabase
    .from("verses")
    .select("id, embedding")
    .in("id", verseIds);

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
      const sourceId = await getVerseId(
        sourceRef.book,
        sourceRef.chapter,
        sourceRef.verse,
      );
      if (sourceId) anchorIds.push(sourceId);
    }

    if (targetRef) {
      const targetId = await getVerseId(
        targetRef.book,
        targetRef.chapter,
        targetRef.verse,
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
    const anchorId = await getVerseId(
      explicitRef.book,
      explicitRef.chapter,
      explicitRef.verse,
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
      const anchorId = await getVerseId(
        parsedConcept.book,
        parsedConcept.chapter,
        parsedConcept.verse,
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
    const anchorIds = await findMultipleAnchorVerses(userPrompt, maxAnchors);

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
  const singleAnchor = await resolveAnchor(userPrompt);
  return singleAnchor ? [singleAnchor] : [];
}

/**
 * Resolve the anchor verse from the user prompt.
 * Order: explicit reference → concept mapping → semantic search → keyword search fallback.
 */
export async function resolveAnchor(
  userPrompt: string,
): Promise<number | null> {
  // Step 1: Check for explicit reference (e.g., "John 3:16")
  const explicitRef = parseExplicitReference(userPrompt);
  if (explicitRef) {
    const anchorId = await getVerseId(
      explicitRef.book,
      explicitRef.chapter,
      explicitRef.verse,
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
      const anchorId = await getVerseId(
        parsedConcept.book,
        parsedConcept.chapter,
        parsedConcept.verse,
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
    const anchorId = await findAnchorVerse(userPrompt);

    if (anchorId) {
      console.log(`[Expanding Ring] ✅ Found anchor via semantic search`);
      return anchorId;
    }

    // If semantic search fails, fall back to keyword search
    console.warn(
      `[Expanding Ring] ⚠️  Semantic search found no results, falling back to keyword search`,
    );
  } catch (error) {
    console.error("[Expanding Ring] Semantic search failed:", error);
    console.log("[Expanding Ring] Falling back to keyword search");
  }

  // Step 4: Fallback - Use keyword search
  const keywords = userPrompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (!keywords.length) return null;

  const candidates = await searchVerses(keywords, 1);
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
  const anchorId = await getVerseId(bookAbbrev, best.chapter, best.verse);

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
  const pericopes = await searchPericopesByQuery(userPrompt, {
    limit: 1,
    similarityThreshold: 0.55, // Slightly lower than verse threshold
  });

  if (pericopes.length === 0) {
    return null;
  }

  // Get full pericope details
  const pericope = await getPericopeById(pericopes[0].id);
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
            const similarity =
              v.similarity !== undefined
                ? ` [${(v.similarity * 100).toFixed(0)}% relevant]`
                : "";
            return `ID:${v.id} [${v.book_name} ${v.chapter}:${v.verse}]${similarity} "${v.text}"`;
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
    }
    if (mapSession.exhausted) {
      lines.push(
        "STATUS: All connections in this map have been explored. Say this plainly and ask if they want another topic.",
      );
    } else if (mapSession.nextConnection) {
      lines.push(
        `NEXT TARGET: [${formatRefById(
          mapSession.nextConnection.fromId,
        )}] <> [${formatRefById(
          mapSession.nextConnection.toId,
        )}] (Type: ${mapSession.nextConnection.connectionType}). Use this exact target in the invitation.`,
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
  _userPrompt: string, // Kept for API compatibility
): Promise<ReferenceVisualBundle> {
  const startTime = Date.now();

  // Deduplicate anchor IDs to prevent multiple trees from the same verse
  console.log(`[Multi-Anchor DEBUG] Original anchors:`, anchorIds);
  const uniqueAnchorIds = Array.from(new Set(anchorIds));
  console.log(`[Multi-Anchor DEBUG] After dedup:`, uniqueAnchorIds);

  if (uniqueAnchorIds.length < anchorIds.length) {
    console.log(
      `[Multi-Anchor] ⚠️ Removed ${anchorIds.length - uniqueAnchorIds.length} duplicate anchor(s)`,
    );
  }

  console.log(
    `[Multi-Anchor] Building combined tree from ${uniqueAnchorIds.length} anchors`,
  );

  // Adjust tree depth based on number of anchors to stay within node limits
  // More anchors = shallower trees per anchor
  const depthPerAnchor =
    uniqueAnchorIds.length === 1 ? 6 : uniqueAnchorIds.length === 2 ? 4 : 3;
  const nodesPerAnchor = Math.floor(100 / uniqueAnchorIds.length);

  console.log(
    `[Multi-Anchor] Building trees with depth=${depthPerAnchor}, nodes=${nodesPerAnchor} per anchor`,
  );

  // Build a tree from each anchor
  const trees: ReferenceVisualBundle[] = [];

  let primaryPericopeContext: ReferenceVisualBundle["pericopeContext"];

  for (let i = 0; i < uniqueAnchorIds.length; i++) {
    const anchorId = uniqueAnchorIds[i];
    console.log(
      `[Multi-Anchor] Building tree ${i + 1}/${uniqueAnchorIds.length} from verse ${anchorId}...`,
    );

    const tree = (await buildVisualBundle(
      anchorId,
      {
        ring0Radius: depthPerAnchor,
        ring1Limit: 5,
        ring2Limit: 5,
        ring3Limit: 5,
      },
      {
        includeDEEPER: true,
        includeROOTS: true,
        includeECHOES: true,
        includePROPHECY: true,
        includeGENEALOGY: false,
      },
    )) as ReferenceVisualBundle;

    if (i === 0 && tree.pericopeContext) {
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
    `[Multi-Anchor DEBUG] Final node count: ${allNodes.length}, Root ID will be: ${uniqueAnchorIds[0]}`,
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
    rootId: uniqueAnchorIds[0], // First anchor is the root for circular layout
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

    const visualBundle: ReferenceVisualBundle = prebuiltVisualBundle;
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
      ? await getPericopeById(visualBundle.pericopeContext.id)
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
    const systemPrompt = buildSystemPrompt(promptMode);

    // Stream the response directly
    await runModelStream(
      res,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      { model: ENV.OPENAI_SMART_MODEL },
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
  let anchorIds: number[] = [];
  let visualBundle: ReferenceVisualBundle;
  let pericopeContext: Awaited<ReturnType<typeof getPericopeById>> | null =
    null;
  let resolutionType: "pericope_first" | "verse_first" = "verse_first";

  // Try pericope-first resolution for conceptual queries
  const pericopeResolution = await resolvePericopeFirst(userPrompt);
  if (pericopeResolution) {
    // Use pericope's verses as anchors
    anchorIds = pericopeResolution.allVerseIds.slice(0, useMultiAnchor ? 3 : 1);

    // Get pericope context
    pericopeContext = await getPericopeById(pericopeResolution.pericopeId);
    resolutionType = "pericope_first";

    console.log(
      `[Expanding Ring] ✅ Resolved via pericope: ${pericopeContext?.title} (${anchorIds.length} verses)`,
    );
  }

  // Fallback: If pericope resolution failed, use verse-first
  if (anchorIds.length === 0) {
    if (useMultiAnchor) {
      anchorIds = await resolveMultipleAnchors(userPrompt, 3);
    }
  }

  // Final fallback to single anchor if multi-anchor fails or is disabled
  if (anchorIds.length === 0) {
    const singleAnchor = await resolveAnchor(userPrompt);
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

  // Build tree(s) - use multi-anchor if we have multiple
  if (anchorIds.length > 1) {
    console.log(
      `[KERNEL Stream] Using multi-anchor synthesis with ${anchorIds.length} anchors`,
    );
    visualBundle = await buildMultiAnchorTree(anchorIds, userPrompt);
  } else {
    console.log(`[KERNEL Stream] Using single anchor: ${anchorId}`);
    visualBundle = (await buildVisualBundle(
      anchorId,
      {
        ring0Radius: 3,
        ring1Limit: 20,
        ring2Limit: 30,
        ring3Limit: 40,
      },
      {
        includeDEEPER: true,
        includeROOTS: true,
        includeECHOES: true,
        includePROPHECY: true,
        includeGENEALOGY: false,
      },
    )) as ReferenceVisualBundle;
  }

  // Rank verses by semantic similarity to user query
  visualBundle = await rankVersesBySimilarity(visualBundle, userPrompt);

  // Remove duplicate/parallel passages
  visualBundle = await deduplicateVerses(visualBundle);

  if (!pericopeContext && visualBundle.pericopeContext?.id) {
    pericopeContext = await getPericopeById(visualBundle.pericopeContext.id);
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
  if (pericopeContext) {
    try {
      const pericopeBundle = await buildPericopeBundle(pericopeContext.id);
      if (pericopeBundle) {
        visualBundle.pericopeBundle = pericopeBundle;
      }
    } catch (error) {
      console.warn(
        "[Expanding Ring] Pericope bundle build failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  // Send map data first
  res.write("event: map_data\n");
  res.write(`data: ${JSON.stringify(visualBundle)}\n\n`);

  // === SINGLE-PASS STREAMING: Read tree, deliver teaching immediately ===
  console.log("[Fast Stream] Starting single-pass teaching generation...");

  const systemPrompt = buildSystemPrompt(promptMode);
  // Use layered prompt builder (pericope context already fetched in Phase 1)
  const userMessage = buildLayeredUserMessage(
    userPrompt,
    visualBundle,
    pericopeContext, // From Phase 1, line 898
    mapSession ?? undefined,
  );

  await runModelStream(
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
      // Automatic in-memory caching (5-10 min) works for prompts > 1024 tokens
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
