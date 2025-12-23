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

export interface ReferenceTreeNode {
  id: number;
  depth: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
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
 * Resolve the anchor verse from the user prompt.
 * Order: explicit reference → concept mapping → keyword search.
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
    if (anchorId) return anchorId;
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
      if (anchorId) return anchorId;
    }
  }

  // Step 3: Ask LLM directly for the best anchor verse reference
  console.log(
    `[Expanding Ring] Asking LLM for anchor verse for: "${userPrompt}"`,
  );

  const directPrompt = {
    system: `You are a Bible reference expert for the King James Bible.

TASK:
Given a user's question about the Bible, identify the SINGLE BEST verse that directly addresses their question or describes the event they're asking about.

RULES:
1. Think carefully about what verse most directly answers the question
2. For events (e.g., "Peter the rock"), find the verse where that event/statement occurs
3. Return ONLY the verse reference in this exact format: Book Chapter:Verse
4. Examples: "Matthew 16:18", "John 3:16", "Genesis 1:1"
5. If you cannot determine a good verse, return "UNKNOWN"

Return ONLY the verse reference, nothing else.`,

    user: `USER QUESTION: "${userPrompt}"

What is the best KJV verse to anchor the answer to this question?
Return ONLY the verse reference (e.g., "Matthew 16:18"):`,
  };

  try {
    // Use mini for intelligent verse lookup
    const result = await runModel(
      [
        { role: "system", content: directPrompt.system },
        { role: "user", content: directPrompt.user },
      ],
      {
        toolSpecs: [],
        toolMap: {},
        model: "gpt-5-mini",
        reasoningEffort: "low", // Explicit low reasoning for faster responses
        // Automatic in-memory caching (5-10 min) works on gpt-5-mini for prompts > 1024 tokens
      },
    );

    const llmReference = result.text.trim();
    console.log(`[Expanding Ring] LLM suggested anchor: "${llmReference}"`);

    // Try to parse the LLM's suggestion
    if (llmReference && llmReference !== "UNKNOWN") {
      const parsed = parseExplicitReference(llmReference);
      if (parsed) {
        const anchorId = await getVerseId(
          parsed.book,
          parsed.chapter,
          parsed.verse,
        );
        if (anchorId) {
          console.log(
            `[Expanding Ring] ✅ Using LLM-suggested anchor: ${parsed.book} ${parsed.chapter}:${parsed.verse}`,
          );
          return anchorId;
        }
      }
    }

    // Fallback: Use keyword search if LLM suggestion didn't work
    console.warn(
      `[Expanding Ring] ⚠️  LLM suggestion failed, falling back to keyword search`,
    );
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
      if (
        typeof fullName === "string" &&
        fullName.toLowerCase() === bookAbbrev
      ) {
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
    return anchorId ?? null;
  } catch (error) {
    console.error("[Expanding Ring] LLM anchor suggestion failed:", error);
    // Final fallback: return null
    return null;
  }
}

/**
 * System prompt: voice + structure, optimized for the reader (not graph order).
 */
function generateSystemPrompt(): string {
  return `You are the **KJV Hermeneutics Engine**. Generate pastoral exegetical commentary using *Analogy of Faith* (Scripture interprets Scripture).

**METHOD**
1. Analyze verse context
2. Find verbal/thematic cross-references in KJV
3. Synthesize into pastoral explanation where cross-refs prove the point

**CONSTRAINTS**
- **Source:** KJV only. No Greek/Hebrew/historical critics
- **Citations:** STRICT format \`[Book Ch:v]\` e.g., \`[John 3:16]\` (vital for UI parsing)
- **Tone:** Pastoral teaching voice, authoritative yet inviting
- **No speculation:** If text is silent, remain silent. No denominational labels
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
✅ "As [John 3:16] declares, God's love drives the mission..."
❌ "God loves us. See [John 3:16]."

**CLOSING STRATEGY**
End the final section by guiding the reader toward deeper exploration:
- Draw them naturally to the next logical passage/theme
- Use invitational language: "This leads us to...", "The beauty of this unfolds in...", "To see this truth at work, consider..."
- Create desire to go deeper, not test their knowledge
- Avoid questions that sound like exams
- Feel like a guide saying "and here's where it gets even richer..."
- The closing is regular paragraph text - no special markdown (no blockquotes, no bold formatting)

**EXAMPLE OUTPUT**

## The Eternal Word

### Before Time

"In the beginning" echoes [Genesis 1:1], placing the Word before creation itself. As [Proverbs 8:23] declares, "I was set up from everlasting," confirming pre-existence. The Word did not begin—He always was.

### With God, Was God

Distinct person ("with God"), yet unified essence ("was God"). This is not contradiction but divine mystery. As [1 Timothy 3:16] confirms, "God was manifest in the flesh"—the Word made visible without ceasing to be God. This truth becomes even richer when we trace how the Word relates to fallen humanity. The beauty of His full identification with mankind unfolds in [Hebrews 2:14-17], showing why the Eternal One took on flesh.`;
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
      model: "gpt-5-mini",
      reasoningEffort: "low", // Explicit low reasoning for faster responses
      // Automatic in-memory caching (5-10 min) works on gpt-5-mini for prompts > 1024 tokens
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
      model: "gpt-5-mini",
      reasoningEffort: "low", // Explicit low reasoning for faster responses
      // Automatic in-memory caching (5-10 min) works on gpt-5-mini for prompts > 1024 tokens
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
 * KERNEL 3-SIM Pipeline: Streaming genealogy-tree exegesis with epistemic rigor
 * Runs SIM-1 (mechanism) → SIM-2 (coherence) → SIM-3 (teaching) in sequence.
 * Only SIM-3 output is streamed to the user.
 */
export async function explainScriptureWithKernelStream(
  res: Response,
  userPrompt: string,
): Promise<{
  anchor: Verse;
  anchorId: number | null;
  treeStats: TreeStats;
  visualBundle: ReferenceVisualBundle | null;
  sim1?: unknown;
  sim2?: unknown;
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

/**
 * Streaming genealogy-tree exegesis (Server-Sent Events).
 * Sends map first, then streams explanation optimized for user clarity.
 *
 * NOTE: This is the OLD single-pass implementation.
 * Use explainScriptureWithKernelStream() for the new 3-SIM KERNEL pipeline.
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
      model: "gpt-5-mini",
      reasoningEffort: "low", // Explicit low reasoning for faster streaming
      // Automatic in-memory caching (5-10 min) works on gpt-5-mini for prompts > 1024 tokens
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
