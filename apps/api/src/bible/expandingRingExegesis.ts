/**
 * Expanding Ring Exegesis / Reference Genealogy
 * KJV-only exegesis over a Bible graph, optimized for user clarity (not graph order).
 */

import { runModelStream } from "../ai/runModelStream";
import type { Response } from "express";
import { getVerseId, type Verse } from "./graphWalker";
import { searchVerses } from "./bibleService";
import { parseExplicitReference } from "./referenceParser";
import { matchConcept } from "./conceptMapping";
import { BOOK_NAMES } from "./bookNames";
import { buildReferenceTree } from "./referenceGenealogy";
import { findAnchorVerse, findMultipleAnchorVerses } from "./semanticSearch";
import { supabase } from "../db";
import OpenAI from "openai";
import { ENV } from "../env";

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
}

export interface ReferenceTreeEdge {
  from: number;
  to: number;
}

export interface ReferenceVisualBundle {
  nodes: ReferenceTreeNode[];
  edges: ReferenceTreeEdge[];
}

interface TreeStats {
  totalNodes: number;
  maxDepth: number;
  depthDistribution: Record<number, number>;
}

const EMPTY_TREE_STATS: TreeStats = {
  totalNodes: 0,
  maxDepth: 0,
  depthDistribution: {},
};

const DEFAULT_TREE_OPTIONS = {
  maxDepth: 999,
  maxNodes: 15, // Reduced from 30 for faster processing
  maxChildrenPerNode: 999,
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
    const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
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
 * Remove duplicate/parallel passages from the reference tree.
 * Detects verses with high semantic similarity (>92%) and keeps only the most relevant.
 *
 * @param visualBundle - The reference tree to deduplicate
 * @returns The bundle with duplicates removed
 */
async function deduplicateVerses(
  visualBundle: ReferenceVisualBundle,
): Promise<ReferenceVisualBundle> {
  if (visualBundle.nodes.length < 2) {
    return visualBundle; // Nothing to deduplicate
  }

  const startTime = Date.now();
  console.log(
    `[Deduplication] Checking ${visualBundle.nodes.length} verses for duplicates...`,
  );

  const DUPLICATE_THRESHOLD = 0.92; // 92% similarity = likely parallel passage
  const duplicateIds = new Set<number>();

  // Fetch embeddings for all verses
  const verseIds = visualBundle.nodes.map((n) => n.id);
  const { data: verses, error } = await supabase
    .from("verses")
    .select("id, embedding")
    .in("id", verseIds);

  if (error || !verses) {
    console.error("[Deduplication] Failed to fetch embeddings:", error);
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

  // Compare all pairs
  for (let i = 0; i < visualBundle.nodes.length; i++) {
    if (duplicateIds.has(visualBundle.nodes[i].id)) continue;

    const node1 = visualBundle.nodes[i];
    const emb1 = embeddingMap.get(node1.id);
    if (!emb1) continue;

    for (let j = i + 1; j < visualBundle.nodes.length; j++) {
      if (duplicateIds.has(visualBundle.nodes[j].id)) continue;

      const node2 = visualBundle.nodes[j];
      const emb2 = embeddingMap.get(node2.id);
      if (!emb2) continue;

      const similarity = cosineSimilarity(emb1, emb2);

      if (similarity >= DUPLICATE_THRESHOLD) {
        // These are duplicates/parallels
        // Keep the one with higher relevance to query (or first if no scores)
        const keep =
          (node1.similarity || 0) >= (node2.similarity || 0) ? node1 : node2;
        const remove = keep === node1 ? node2 : node1;

        duplicateIds.add(remove.id);
        console.log(
          `[Deduplication] Found parallel: ${node1.book_name} ${node1.chapter}:${node1.verse} ≈ ` +
            `${node2.book_name} ${node2.chapter}:${node2.verse} (${(similarity * 100).toFixed(1)}% similar) - ` +
            `Keeping ${keep.book_name} ${keep.chapter}:${keep.verse}`,
        );
      }
    }
  }

  // Filter out duplicates
  const originalCount = visualBundle.nodes.length;
  visualBundle.nodes = visualBundle.nodes.filter(
    (n) => !duplicateIds.has(n.id),
  );

  // Also remove edges that reference removed nodes
  visualBundle.edges = visualBundle.edges.filter(
    (e) => !duplicateIds.has(e.from) && !duplicateIds.has(e.to),
  );

  const elapsed = Date.now() - startTime;
  const removedCount = originalCount - visualBundle.nodes.length;

  if (removedCount > 0) {
    console.log(
      `[Deduplication] ✅ Removed ${removedCount} duplicate(s) in ${elapsed}ms ` +
        `(${visualBundle.nodes.length} verses remaining)`,
    );
  } else {
    console.log(`[Deduplication] No duplicates found (${elapsed}ms)`);
  }

  return visualBundle;
}

/**
 * Resolve multiple anchor verses from the user prompt for multi-perspective synthesis.
 * Returns top N semantically similar verses when no explicit reference is given.
 */
async function resolveMultipleAnchors(
  userPrompt: string,
  maxAnchors: number = 3,
): Promise<number[]> {
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
async function resolveAnchor(userPrompt: string): Promise<number | null> {
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
 * System prompt: voice + structure, optimized for the reader (not graph order).
 */
function generateSystemPrompt(): string {
  return `You are a devout disciple of Jesus with the purpose to teach the Word of the Lord. You teach the Word, you live the Word, you are the Word. You know that Bible-based truth is THE truth because it is the living Word.

**YOUR EXEGETICAL METHOD**
Provide plain-sense exegesis rooted solely in the King James Version. This analysis draws exclusively from the direct, self-evident meaning of the text, derived through comparison within Scripture itself—Scripture interprets Scripture.

1. Declare what the text plainly says
2. Reveal verbal/thematic connections across the KJV
3. Show how cross-references establish and confirm the truth

**ABSOLUTE CONSTRAINTS**
- **Source:** KJV only—what the text itself reveals. No external theology, no historical context, no modern interpretation imposed
- **Citations:** STRICT format \`[Book Ch:v]\` e.g., \`[John 3:16]\` (vital for UI parsing)
- **Voice:** Teaching with conviction as one who lives the Word—declarative, confident, rooted in Scripture
- **Boundaries:** If Scripture is silent, remain silent. Confined to what the KJV text itself reveals
- **Max: 250 words**

**FORMATTING (Critical - follow exactly)**

Use this precise markdown structure:

\`\`\`
## [Thematic Title - MUST be specific to the topic, not generic]

### [First Thematic Heading - specific to content, e.g., "Before Time", "The Divine Pattern", etc.]

Primary phrase analysis. Cross-reference defines terms. "As Paul confirms in [Romans 3:23], this universal state..." (NOT "See also [Romans 3:23]")

### [Second Thematic Heading - flows from first section]

Expand doctrine. Connect OT/NT with [Book Ch:v] citations naturally woven into sentences.

### [Third Thematic Heading - brings practical application]

Practical conclusion from God's character and revealed truth. End with invitational language drawing reader to next exploration.
\`\`\`

**CRITICAL: Headers must be thematic and content-specific, NEVER use generic labels like "Primary Header", "First Section", "Introduction", etc.**

**CITATION STYLE**
Treat Scripture as authoritative declaration, not merely supporting evidence:
✅ "Scripture declares plainly in [John 3:16] that God's love establishes the foundation..."
✅ "The Word confirms this truth throughout: [Romans 3:23] establishes universal condemnation..."
❌ "God loves us. See [John 3:16]." (too casual, citation as afterthought)
❌ "This appears to indicate..." (hedging—Scripture either says it or doesn't)

**CLOSING STRATEGY**
End the final section by inviting the reader deeper into Scripture:
- Point to the next passage/theme where this truth continues
- Use invitational language: "This same pattern governs...", "The Word unfolds this further in...", "Scripture carries this thread through..."
- Create hunger to see more of the tapestry, not test their knowledge
- Avoid questions that sound like exams
- Sound like a teacher saying "and here is where the beauty deepens..."
- The closing is regular paragraph text - no special markdown (no blockquotes, no bold formatting)

**EXAMPLE OUTPUT**

## The Eternal Word

### Before Time

Scripture establishes the Word's pre-existence plainly: "In the beginning" in [John 1:1] echoes [Genesis 1:1], placing the Word before all creation. [Proverbs 8:23] declares, "I was set up from everlasting," confirming what the text reveals—the Word did not begin. He always was.

### With God, Was God

The text declares two truths simultaneously: distinct person ("with God"), yet unified essence ("was God"). [1 Timothy 3:16] confirms this mystery: "God was manifest in the flesh"—the Word made visible without ceasing to be God. Scripture carries this truth further in [Hebrews 2:14-17], revealing why the Eternal One took on flesh to redeem fallen humanity.`;
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
- Treat these verses as resources to draw from, not a sequence to walk through.
- Choose the verses that best clarify the anchor and the user's question.
- Arrange them in the order that makes the most sense for the reader.`;
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
async function buildMultiAnchorTree(
  anchorIds: number[],
  userPrompt: string,
): Promise<ReferenceVisualBundle> {
  const startTime = Date.now();

  console.log(
    `[Multi-Anchor] Building combined tree from ${anchorIds.length} anchors`,
  );

  // Adjust tree depth based on number of anchors to stay within node limits
  // More anchors = shallower trees per anchor
  const depthPerAnchor =
    anchorIds.length === 1 ? 6 : anchorIds.length === 2 ? 4 : 3;
  const nodesPerAnchor = Math.floor(100 / anchorIds.length);

  console.log(
    `[Multi-Anchor] Building trees with depth=${depthPerAnchor}, nodes=${nodesPerAnchor} per anchor`,
  );

  // Build a tree from each anchor
  const trees: ReferenceVisualBundle[] = [];

  for (let i = 0; i < anchorIds.length; i++) {
    const anchorId = anchorIds[i];
    console.log(
      `[Multi-Anchor] Building tree ${i + 1}/${anchorIds.length} from verse ${anchorId}...`,
    );

    const tree = (await buildReferenceTree(anchorId, {
      maxDepth: depthPerAnchor,
      maxNodes: nodesPerAnchor,
      maxChildrenPerNode: 5,
      userQuery: userPrompt,
      similarityThreshold: 0.4,
    })) as ReferenceVisualBundle;

    trees.push(tree);
  }

  // Combine all nodes and edges
  const allNodes: ReferenceTreeNode[] = [];
  const allEdges: ReferenceTreeEdge[] = [];
  const seenNodeIds = new Set<number>();

  for (const tree of trees) {
    // Add nodes (skip duplicates)
    for (const node of tree.nodes) {
      if (!seenNodeIds.has(node.id)) {
        allNodes.push(node);
        seenNodeIds.add(node.id);
      }
    }

    // Add edges (skip duplicates)
    for (const edge of tree.edges) {
      const edgeKey = `${edge.from}-${edge.to}`;
      if (!allEdges.some((e) => `${e.from}-${e.to}` === edgeKey)) {
        allEdges.push(edge);
      }
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[Multi-Anchor] ✅ Combined tree built in ${elapsed}ms: ` +
      `${allNodes.length} nodes, ${allEdges.length} edges from ${trees.length} anchors`,
  );

  // Return combined bundle
  return {
    nodes: allNodes,
    edges: allEdges,
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
): Promise<{
  anchor: Verse;
  anchorId: number | null;
  treeStats: TreeStats;
  visualBundle: ReferenceVisualBundle | null;
  sim1?: unknown;
  sim2?: unknown;
}> {
  // Try multi-anchor synthesis first for richer context
  let anchorIds: number[] = [];
  let visualBundle: ReferenceVisualBundle;

  if (useMultiAnchor) {
    anchorIds = await resolveMultipleAnchors(userPrompt, 3);
  }

  // Fallback to single anchor if multi-anchor fails or is disabled
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
    visualBundle = (await buildReferenceTree(anchorId, {
      ...DEFAULT_TREE_OPTIONS,
      userQuery: userPrompt,
    })) as ReferenceVisualBundle;
  }

  // Rank verses by semantic similarity to user query
  visualBundle = await rankVersesBySimilarity(visualBundle, userPrompt);

  // Remove duplicate/parallel passages
  visualBundle = await deduplicateVerses(visualBundle);

  const treeStats = computeTreeStats(visualBundle);
  const anchor = buildAnchorFromTree(visualBundle, anchorId);

  // Send map data first
  res.write("event: map_data\n");
  res.write(`data: ${JSON.stringify(visualBundle)}\n\n`);

  // === SINGLE-PASS STREAMING: Read tree, deliver teaching immediately ===
  console.log("[Fast Stream] Starting single-pass teaching generation...");

  const systemPrompt = generateSystemPrompt();
  const userMessage = generateGenealogyUserMessage(userPrompt, visualBundle);

  await runModelStream(
    res,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    {
      toolSpecs: [],
      toolMap: {},
      model: "gpt-5-mini",
      reasoningEffort: "low", // Explicit low reasoning for faster streaming
      // Automatic in-memory caching (5-10 min) works on gpt-5-mini for prompts > 1024 tokens
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
