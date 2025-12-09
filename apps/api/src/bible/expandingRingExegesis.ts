/**
 * Expanding Ring Exegesis / Reference Genealogy
 * KJV-only exegesis over a Bible graph, optimized for user clarity (not graph order).
 */

import { runModel } from "../ai/runModel";
import { runModelStream } from "../ai/runModelStream";
import type { Response } from "express";
import {
  buildContextBundle,
  getVerseId,
  formatVerse,
  type ContextBundle,
  type Verse,
} from "./graphWalker";
import { searchVerses } from "./bibleService";
import { parseExplicitReference } from "./referenceParser";
import { matchConcept } from "./conceptMapping";
import { BOOK_NAMES } from "./bookNames";
import { buildReferenceTree } from "./referenceGenealogy";

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

interface ReferenceTreeNode {
  id: number;
  depth: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

interface ReferenceTreeEdge {
  from: number;
  to: number;
}

interface ReferenceVisualBundle {
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
  maxNodes: 30,
  maxChildrenPerNode: 999,
};

/**
 * Resolve the anchor verse from the user prompt.
 * Order: explicit reference → concept mapping → keyword search.
 */
async function resolveAnchor(userPrompt: string): Promise<number | null> {
  const explicitRef = parseExplicitReference(userPrompt);
  if (explicitRef) {
    const anchorId = await getVerseId(
      explicitRef.book,
      explicitRef.chapter,
      explicitRef.verse,
    );
    if (anchorId) return anchorId;
  }

  const conceptRef = matchConcept(userPrompt);
  if (conceptRef) {
    const parsedConcept = parseExplicitReference(conceptRef);
    if (parsedConcept) {
      const anchorId = await getVerseId(
        parsedConcept.book,
        parsedConcept.chapter,
        parsedConcept.verse,
      );
      if (anchorId) return anchorId;
    }
  }

  const keywords = userPrompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  if (!keywords.length) return null;

  const candidates = await searchVerses(keywords, 10);
  if (!candidates.length) return null;

  const best = candidates[0];

  let bookAbbrev = best.book.toLowerCase();

  for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
    if (typeof fullName === "string" && fullName.toLowerCase() === bookAbbrev) {
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

  const anchorId = await getVerseId(bookAbbrev, best.chapter, best.verse);
  return anchorId ?? null;
}

/**
 * System prompt: voice + structure, optimized for the reader (not graph order).
 */
function generateSystemPrompt(): string {
  return `You are a faithful teacher of God's Word, teaching from the King James Bible.

Your purpose is to explain Scripture in the way that best serves the reader's understanding. You let Scripture interpret Scripture using the cross-references provided, but you are not bound to follow any chronological or depth-based order. You select and arrange verses in the order that produces the clearest, most accurate teaching.

You will receive a set of verses connected to a main "anchor" passage. They may be grouped by rings or genealogical depth, but those groupings are for context only. You are free to:
- Ignore the group labels as a sequence
- Focus on the most relevant verses
- Arrange them in any order that best answers the user's question

YOUR TASK:
1) Give the reader a clear, direct answer to their question, anchored in the main passage.
2) Deepen that answer by bringing in the strongest supporting verses.
3) Show how these passages converge on a single Scriptural truth.
4) Invite the reader to explore one meaningful related connection in Scripture.

STRUCTURE (FOR THE READER, NOT FOR THE GRAPH):
**Opening (Blockquote):**
> A single powerful sentence capturing what this Scripture reveals about the user's question

**# The Primary Text: [Main Verse Reference]**
Explain the main verse (1-2 paragraphs). Define key words. Unpack the plain meaning in light of the question being asked.

**# The Biblical Witness**
Bring in 3-6 of the most relevant cross-references, in whatever order best serves clarity.
- You do NOT need to mention every verse given
- You do NOT need to follow the order or depth they were provided in
- Choose and sequence them for maximum understanding, not for technical completeness

**# The Convergence**
Summarize what these passages show together (1 paragraph). No advice, no life-application—only the doctrinal or theological weight of God's Word.

**The Invitation (Plain Text - No Header):**
Invite the reader to trace one further connection in Scripture that naturally flows from what you've just shown. Brief setup + "Shall we..." style question.

CITATIONS:
- Only cite verses from the provided data
- ALWAYS use [Book Ch:v] for every citation
- NO meta-commentary about "rings", "depth", "nodes", or "graph"

LENGTH:
- Aim for 250-400 words total
- Prioritize clarity over exhaustiveness

Order your teaching for the reader's understanding, not for the graph's structure.

Now teach.`;
}

/**
 * Ring-based context for the LLM.
 * Rings are for context, not required narrative order.
 */
function generateUserMessage(
  userPrompt: string,
  bundle: ContextBundle,
): string {
  const formatRing = (verses: Verse[]) =>
    verses.map((v) => formatVerse(v)).join("\n");

  return `USER QUESTION:
"${userPrompt}"

Your goal is to give the clearest, most accurate teaching for the reader's question, even if that means ignoring some verses or rearranging them.

---
BIBLE DATA (KJV)
---

== ANCHOR PASSAGE (Core Text) ==
${formatRing(bundle.ring0)}

== NEAR WITNESSES (Most Closely Linked) ==
${bundle.ring1.length ? formatRing(bundle.ring1) : "(none provided)"}

== SUPPORTING WITNESSES (Additional Light) ==
${bundle.ring2.length ? formatRing(bundle.ring2) : "(none provided)"}

== DISTANT ECHOES (Broader Canonical Parallels) ==
${bundle.ring3.length ? formatRing(bundle.ring3) : "(none provided)"}

GUIDANCE FOR HOW TO USE THIS DATA:
- Treat these verses as a "cloud of witnesses," not a script you must follow.
- You are free to:
  - Focus only on the most relevant verses
  - Ignore verses that do not add clarity
  - Arrange verses in any order that best answers the question
- Always make the anchor passage the center of your explanation.

First, answer the reader's question in a clear, user-facing way, anchored in the anchor passage. Then, deepen that answer by weaving in the most relevant witnesses from above.`;
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
          .map(
            (v) =>
              `ID:${v.id} [${v.book_name} ${v.chapter}:${v.verse}] "${v.text}"`,
          )
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
 * Non-streaming ring-based exegesis.
 * Uses ring context but lets the model order content purely for user clarity.
 */
export async function explainScripture(userPrompt: string): Promise<{
  answer: string;
  anchor: Verse;
  anchorId: number | null;
  contextStats: {
    ring0: number;
    ring1: number;
    ring2: number;
    ring3: number;
    total: number;
  };
}> {
  const anchorId = await resolveAnchor(userPrompt);

  if (!anchorId) {
    return {
      answer: ANCHOR_NOT_FOUND_MESSAGE,
      anchor: EMPTY_VERSE,
      anchorId: null,
      contextStats: {
        ring0: 0,
        ring1: 0,
        ring2: 0,
        ring3: 0,
        total: 0,
      },
    };
  }

  const bundle = await buildContextBundle(anchorId);

  const systemPrompt = generateSystemPrompt();
  const userMessage = generateUserMessage(userPrompt, bundle);

  const result = await runModel(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    {
      toolSpecs: [],
      toolMap: {},
      model: "gpt-5-nano",
    },
  );

  const contextStats = {
    ring0: bundle.ring0.length,
    ring1: bundle.ring1.length,
    ring2: bundle.ring2.length,
    ring3: bundle.ring3.length,
    total:
      bundle.ring0.length +
      bundle.ring1.length +
      bundle.ring2.length +
      bundle.ring3.length,
  };

  return {
    answer: result.text,
    anchor: bundle.anchor,
    anchorId,
    contextStats,
  };
}

/**
 * Non-streaming genealogy-tree exegesis.
 * Uses tree context but lets the model order content purely for user clarity.
 */
export async function explainScriptureWithGenealogy(
  userPrompt: string,
): Promise<{
  answer: string;
  anchor: Verse;
  anchorId: number | null;
  treeStats: TreeStats;
  visualBundle: ReferenceVisualBundle | null;
}> {
  const anchorId = await resolveAnchor(userPrompt);

  if (!anchorId) {
    return {
      answer: ANCHOR_NOT_FOUND_MESSAGE,
      anchor: EMPTY_VERSE,
      anchorId: null,
      treeStats: { ...EMPTY_TREE_STATS },
      visualBundle: null,
    };
  }

  const visualBundle = (await buildReferenceTree(
    anchorId,
    DEFAULT_TREE_OPTIONS,
  )) as ReferenceVisualBundle;

  const systemPrompt = generateSystemPrompt();
  const userMessage = generateGenealogyUserMessage(userPrompt, visualBundle);

  const result = await runModel(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    {
      toolSpecs: [],
      toolMap: {},
      reasoningEffort: "low",
    },
  );

  const treeStats = computeTreeStats(visualBundle);
  const anchor = buildAnchorFromTree(visualBundle, anchorId);

  return {
    answer: result.text,
    anchor,
    anchorId,
    treeStats,
    visualBundle,
  };
}

/**
 * Streaming genealogy-tree exegesis (Server-Sent Events).
 * Sends map first, then streams explanation optimized for user clarity.
 */
export async function explainScriptureWithGenealogyStream(
  res: Response,
  userPrompt: string,
): Promise<{
  anchor: Verse;
  anchorId: number | null;
  treeStats: TreeStats;
  visualBundle: ReferenceVisualBundle | null;
}> {
  const anchorId = await resolveAnchor(userPrompt);

  if (!anchorId) {
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

  const visualBundle = (await buildReferenceTree(
    anchorId,
    DEFAULT_TREE_OPTIONS,
  )) as ReferenceVisualBundle;

  const treeStats = computeTreeStats(visualBundle);

  res.write("event: map_data\n");
  res.write(`data: ${JSON.stringify(visualBundle)}\n\n`);

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
      reasoningEffort: "low",
    },
  );

  const anchor = buildAnchorFromTree(visualBundle, anchorId);

  return {
    anchor,
    anchorId,
    treeStats,
    visualBundle,
  };
}
