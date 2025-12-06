/**
 * Expanding Ring Exegesis Pipeline
 *
 * The "Golden Path" implementation using graph theory and budgeted BFS.
 *
 * Architecture:
 * 1. Resolve Anchor (find the verse to explain)
 * 2. Build Context Bundle (walk the graph in concentric rings)
 * 3. Generate Structured Prompt (label rings for LLM spatial reasoning)
 * 4. Synthesize Exegesis (GPT-5.1 for final delivery)
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

/**
 * Step 1: Resolve Anchor Verse
 *
 * Strategy:
 * 1. Regex for explicit references ("John 3:16") - FAST PATH
 * 2. Concept mapping for theological terms ("sermon on the mount")
 * 3. Keyword search as final fallback
 */
async function resolveAnchor(userPrompt: string): Promise<number | null> {
  console.log("[Expanding Ring] Resolving anchor for:", userPrompt);

  // FAST PATH: Check for explicit reference
  const explicitRef = parseExplicitReference(userPrompt);
  if (explicitRef) {
    console.log("[Expanding Ring] Found explicit reference:", explicitRef);
    const anchorId = await getVerseId(
      explicitRef.book,
      explicitRef.chapter,
      explicitRef.verse,
    );

    if (anchorId) {
      console.log(`[Expanding Ring] Resolved to verse ID ${anchorId}`);
      return anchorId;
    } else {
      console.warn(
        `[Expanding Ring] Explicit reference not found in database: ${explicitRef.book} ${explicitRef.chapter}:${explicitRef.verse}`,
      );
    }
  }

  // CONCEPT MAPPING: Check for known theological terms
  const conceptRef = matchConcept(userPrompt);
  if (conceptRef) {
    console.log(`[Expanding Ring] Matched concept to reference: ${conceptRef}`);
    const parsedConcept = parseExplicitReference(conceptRef);
    if (parsedConcept) {
      const anchorId = await getVerseId(
        parsedConcept.book,
        parsedConcept.chapter,
        parsedConcept.verse,
      );

      if (anchorId) {
        console.log(
          `[Expanding Ring] Resolved concept to verse ID ${anchorId}`,
        );
        return anchorId;
      }
    }
  }

  // FALLBACK: Keyword search
  console.log(
    "[Expanding Ring] No explicit reference or concept match, using keyword search...",
  );

  const keywords = userPrompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 5);

  console.log("[Expanding Ring] Keywords:", keywords);

  const candidates = await searchVerses(keywords, 10);
  console.log(`[Expanding Ring] Found ${candidates.length} candidates`);

  if (candidates.length === 0) {
    console.error("[Expanding Ring] No candidates found from keyword search");
    return null;
  }

  // Pick first match
  const bestCandidate = candidates[0];
  console.log(
    `[Expanding Ring] Selected: ${bestCandidate.book} ${bestCandidate.chapter}:${bestCandidate.verse}`,
  );

  // Normalize book name for database lookup
  // searchVerses returns full names like "Judges", database uses abbreviations like "jud"
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BOOK_NAMES } = require("./bookNames");

  let bookAbbrev = bestCandidate.book.toLowerCase();

  // Try to match full name to abbreviation
  for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
    if (typeof fullName === "string" && fullName.toLowerCase() === bookAbbrev) {
      bookAbbrev = abbrev;
      console.log(
        `[Expanding Ring] Matched full name "${bestCandidate.book}" to abbrev "${abbrev}"`,
      );
      break;
    }
  }

  // If still not found, it might already be an abbreviation - just ensure lowercase
  if (bookAbbrev === bestCandidate.book.toLowerCase()) {
    // Check if it's a valid abbreviation by checking BOOK_NAMES keys
    const validAbbrev = Object.keys(BOOK_NAMES).find(
      (k) => k.toLowerCase() === bookAbbrev,
    );
    if (validAbbrev) {
      bookAbbrev = validAbbrev.toLowerCase();
      console.log(
        `[Expanding Ring] Using abbreviation "${bookAbbrev}" directly`,
      );
    }
  }

  console.log(
    `[Expanding Ring] Looking up in DB: book="${bookAbbrev}", chapter=${bestCandidate.chapter}, verse=${bestCandidate.verse}`,
  );

  // Get verse ID from database
  const anchorId = await getVerseId(
    bookAbbrev,
    bestCandidate.chapter,
    bestCandidate.verse,
  );

  if (!anchorId) {
    console.error(
      `[Expanding Ring] Database lookup failed for ${bookAbbrev} ${bestCandidate.chapter}:${bestCandidate.verse}`,
    );
    console.error(
      `[Expanding Ring] This likely means the Supabase database hasn't been populated yet.`,
    );
    console.error(
      `[Expanding Ring] Please run: npx ts-node scripts/importBibleToSupabase.ts`,
    );
  }

  return anchorId;
}

/**
 * Step 2: Generate System Prompt (The "Voice")
 *
 * Explains the ring structure to the LLM
 */
/**
 * THE DIAMOND PATTERN SYSTEM PROMPT
 * Adapted for Reference Genealogy Tree Structure
 */
function generateSystemPrompt(): string {
  return `You are a faithful teacher of God's Word, teaching from the King James Bible.

Your purpose is to explain Scripture using only what the Bible itself says - letting Scripture interpret Scripture through the actual cross-references preserved in the KJV system.

You will receive a tree of cross-references organized by depth:
- Depth 0: The main verse being explained
- Depth 1: Verses it directly references
- Depth 2: Verses those reference
- And so on...

YOUR TASK:
Teach the Scripture naturally and fluidly, like a pastor or Bible teacher explaining God's Word. The reader should feel like they're sitting in a Bible study, not reading a technical document.

Follow the cross-reference connections to show what the Bible says about itself. Cite every verse you mention using this EXACT format: [Book Ch:v] (this lights up the visual map for the reader).

STRUCTURE:
Use these minimal headers to organize your teaching. Keep them simple and subtle - they're signposts, not announcements.

**Opening (Blockquote):**
> A single powerful sentence capturing what Scripture reveals

This will render with a gold border and serif font - make it memorable.

**# The Primary Text: [Main Verse Reference]**

Quote and explain the main verse (1-2 paragraphs). What does it say? Define the words. Unpack the plain meaning.

**# The Biblical Witness**

Follow the cross-references to build the teaching (2-3 paragraphs). Show what Scripture says about itself.

Example:
- GOOD: "We see this same truth in [Isaiah 40:3], where the voice crying in the wilderness..."
- BAD: "The anchor references [Isaiah 40:3] at Depth 1..."

Weave 3-6 carefully chosen verses into a flowing explanation.

**# The Convergence**

What this Scripture reveals when taken together (1 paragraph). No application, no advice - just the weight of God's Word converging on a single truth.

**The Invitation (Plain Text - No Header):**
You are a guide standing at a fork in the road with the reader. You see a fascinating connection in Scripture - invite them to explore it with you.

FORMULA: Brief setup + "Shall we..." invitation

Examples:
- "This passage in Leviticus connects directly to the 'Throne of Grace' in Hebrews. Shall we trace the transition from the Seat of Judgment to the Throne of Grace?"
- "John's final testimony connects to his execution in Mark's gospel, where Herod's oath seals his fate. Shall we examine how truth brought him to that prison?"

Make it irresistible - they should want to say "Yes!" immediately.

CRITICAL:
- DO use the three headers shown above (# The Primary Text, # The Biblical Witness, # The Convergence)
- DO use blockquote (>) for the opening
- NO header for the invitation - just plain text at the end
- NO meta-commentary about "the anchor" or "Depth 1" or "the tree"
- Just pure Scripture teaching that flows naturally
- Weave 3-6 key verses into your explanation

CRITICAL RULES:
- Only cite verses from the provided tree
- ALWAYS use [Book Ch:v] format for every citation
- Write naturally - the reader should feel like they're learning Scripture, not reading a technical analysis
- 250-400 words total
- Let Scripture do the talking

Now teach.`;
}

/**
 * Step 3: Generate User Message (The "Data")
 *
 * Formats the context bundle into structured text
 */
function generateUserMessage(
  userPrompt: string,
  bundle: ContextBundle,
): string {
  const formatRing = (verses: Verse[]) =>
    verses.map((v) => formatVerse(v)).join("\n");

  return `USER QUESTION:
"${userPrompt}"

---
BIBLE DATA (KJV)
---

== RING 0: ANCHOR PASSAGE ==
${formatRing(bundle.ring0)}

== RING 1: DIRECT LINKS ==
${bundle.ring1.length > 0 ? formatRing(bundle.ring1) : "(no direct cross-references)"}

== RING 2: SECONDARY LINKS ==
${bundle.ring2.length > 0 ? formatRing(bundle.ring2) : "(no secondary references)"}

== RING 3: TERTIARY LINKS ==
${bundle.ring3.length > 0 ? formatRing(bundle.ring3) : "(no tertiary references)"}

---

Answer the user's question using the structured Scripture above. Explain the Anchor Passage first, then show how the surrounding rings illuminate and confirm the teaching.`;
}

/**
 * Main Pipeline: Explain Scripture using Expanding Ring Architecture
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
  console.log("[Expanding Ring] Pipeline starting...");
  console.time("[Expanding Ring] Total time");

  // ========================================
  // STEP 1: Resolve Anchor
  // ========================================
  const anchorId = await resolveAnchor(userPrompt);

  if (!anchorId) {
    return {
      answer:
        "I could not find specific KJV verses matching your question. Please try rephrasing with more specific biblical terms or include a verse reference (e.g., 'John 3:16').",
      anchor: {
        id: 0,
        book_abbrev: "",
        book_name: "",
        chapter: 0,
        verse: 0,
        text: "",
      },
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

  // ========================================
  // STEP 2: Build Context Bundle
  // ========================================
  const bundle = await buildContextBundle(anchorId);

  // ========================================
  // STEP 3: Generate Prompts
  // ========================================
  const systemPrompt = generateSystemPrompt();
  const userMessage = generateUserMessage(userPrompt, bundle);

  // ========================================
  // STEP 4: Run LLM (GPT-5 Nano for synthesis)
  // ========================================
  console.log("[Expanding Ring] Running LLM (gpt-5-nano) for synthesis...");

  const result = await runModel(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    {
      toolSpecs: [],
      toolMap: {},
      model: "gpt-5-nano", // Use GPT-5 Nano for ultra-fast, low-latency synthesis
    },
  );

  console.timeEnd("[Expanding Ring] Total time");

  // ========================================
  // Return Result
  // ========================================
  const stats = {
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

  console.log("[Expanding Ring] Context stats:", stats);

  return {
    answer: result.text,
    anchor: bundle.anchor,
    anchorId: anchorId,
    contextStats: stats,
  };
}

/**
 * NEW: Explain Scripture using Reference Genealogy Tree
 *
 * This replaces the ring-based approach with a hierarchical tree that shows
 * actual verse-to-verse reference chains. The LLM analyzes the same tree
 * structure that the user sees in the visualization.
 */
export async function explainScriptureWithGenealogy(
  userPrompt: string,
): Promise<{
  answer: string;
  anchor: Verse;
  anchorId: number | null;
  treeStats: {
    totalNodes: number;
    maxDepth: number;
    depthDistribution: Record<number, number>;
  };
  visualBundle: any; // VisualContextBundle
}> {
  console.log("[Genealogy Exegesis] Pipeline starting...");
  console.time("[Genealogy Exegesis] Total time");

  // ========================================
  // STEP 1: Resolve Anchor
  // ========================================
  const anchorId = await resolveAnchor(userPrompt);

  if (!anchorId) {
    return {
      answer:
        "I could not find specific KJV verses matching your question. Please try rephrasing with more specific biblical terms or include a verse reference (e.g., 'John 3:16').",
      anchor: {
        id: 0,
        book_abbrev: "",
        book_name: "",
        chapter: 0,
        verse: 0,
        text: "",
      },
      anchorId: null,
      treeStats: {
        totalNodes: 0,
        maxDepth: 0,
        depthDistribution: {},
      },
      visualBundle: null,
    };
  }

  // ========================================
  // STEP 2: Build Reference Genealogy Tree
  // ========================================
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildReferenceTree } = require("./referenceGenealogy");

  const visualBundle = await buildReferenceTree(anchorId, {
    maxDepth: 999, // No artificial depth limit - follow references as deep as they go
    maxNodes: 30, // Hard cap at 30 verses total for LLM performance
    maxChildrenPerNode: 999, // No limit on children - include ALL references from each verse
  });

  // ========================================
  // STEP 3: Format Tree for LLM
  // ========================================
  const systemPrompt = generateSystemPrompt();
  const userMessage = generateGenealogyUserMessage(userPrompt, visualBundle);

  // ========================================
  // STEP 4: Run LLM
  // ========================================
  console.log("[Genealogy Exegesis] Running LLM for synthesis...");

  const result = await runModel(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    {
      toolSpecs: [],
      toolMap: {},
      // gpt-5-nano is NOT a reasoning model - it's fast and efficient
      // Do not use reasoning effort for nano models
      reasoningEffort: "low",
    },
  );

  console.timeEnd("[Genealogy Exegesis] Total time");

  // ========================================
  // Calculate Stats
  // ========================================
  const depthCounts: Record<number, number> = {};
  for (const node of visualBundle.nodes) {
    depthCounts[node.depth] = (depthCounts[node.depth] || 0) + 1;
  }

  const stats = {
    totalNodes: visualBundle.nodes.length,
    maxDepth: Math.max(...visualBundle.nodes.map((n: any) => n.depth)),
    depthDistribution: depthCounts,
  };

  console.log("[Genealogy Exegesis] Tree stats:", stats);

  // Find anchor verse details
  const anchor = visualBundle.nodes.find((n: any) => n.id === anchorId) || {
    id: anchorId,
    book_abbrev: "",
    book_name: "",
    chapter: 0,
    verse: 0,
    text: "",
  };

  return {
    answer: result.text,
    anchor,
    anchorId,
    treeStats: stats,
    visualBundle,
  };
}

/**
 * STREAMING VERSION: Explain Scripture with Reference Genealogy Tree
 * This version streams the LLM response as it generates (token-by-token)
 * instead of waiting for the full response.
 */
export async function explainScriptureWithGenealogyStream(
  res: Response,
  userPrompt: string,
): Promise<{
  anchor: Verse;
  anchorId: number | null;
  treeStats: {
    totalNodes: number;
    maxDepth: number;
    depthDistribution: Record<number, number>;
  };
  visualBundle: any;
}> {
  console.log("[Genealogy Exegesis STREAM] Pipeline starting...");
  console.time("[Genealogy Exegesis STREAM] Total time");

  // ========================================
  // STEP 1: Resolve Anchor
  // ========================================
  const anchorId = await resolveAnchor(userPrompt);

  if (!anchorId) {
    // Send error message via SSE
    res.write(`event: content\n`);
    res.write(
      `data: ${JSON.stringify({ delta: "I could not find specific KJV verses matching your question. Please try rephrasing with more specific biblical terms or include a verse reference (e.g., 'John 3:16')." })}\n\n`,
    );
    res.write(`event: done\n`);
    res.write(`data: ${JSON.stringify({ citations: [] })}\n\n`);

    return {
      anchor: {
        id: 0,
        book_abbrev: "",
        book_name: "",
        chapter: 0,
        verse: 0,
        text: "",
      },
      anchorId: null,
      treeStats: {
        totalNodes: 0,
        maxDepth: 0,
        depthDistribution: {},
      },
      visualBundle: null,
    };
  }

  // ========================================
  // STEP 2: Build Reference Genealogy Tree
  // ========================================
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildReferenceTree } = require("./referenceGenealogy");

  const visualBundle = await buildReferenceTree(anchorId, {
    maxDepth: 999,
    maxNodes: 30,
    maxChildrenPerNode: 999,
  });

  // ========================================
  // STEP 3: Send Map Data BEFORE LLM starts
  // ========================================
  // Calculate stats
  const depthCounts: Record<number, number> = {};
  for (const node of visualBundle.nodes) {
    depthCounts[node.depth] = (depthCounts[node.depth] || 0) + 1;
  }

  const stats = {
    totalNodes: visualBundle.nodes.length,
    maxDepth: Math.max(...visualBundle.nodes.map((n: any) => n.depth)),
    depthDistribution: depthCounts,
  };

  // Send the reference genealogy tree immediately
  console.log(
    `[Reference Tree STREAM] Sending ${visualBundle.nodes.length} nodes, ${visualBundle.edges.length} edges`,
  );
  res.write(`event: map_data\n`);
  res.write(`data: ${JSON.stringify(visualBundle)}\n\n`);

  // ========================================
  // STEP 4: Format Tree for LLM
  // ========================================
  const systemPrompt = generateSystemPrompt();
  const userMessage = generateGenealogyUserMessage(userPrompt, visualBundle);

  // ========================================
  // STEP 5: Stream LLM Response
  // ========================================
  console.log("[Genealogy Exegesis STREAM] Streaming LLM response...");

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

  console.timeEnd("[Genealogy Exegesis STREAM] Total time");
  console.log("[Genealogy Exegesis STREAM] Tree stats:", stats);

  // Find anchor verse details
  const anchor = visualBundle.nodes.find((n: any) => n.id === anchorId) || {
    id: anchorId,
    book_abbrev: "",
    book_name: "",
    chapter: 0,
    verse: 0,
    text: "",
  };

  return {
    anchor,
    anchorId,
    treeStats: stats,
    visualBundle,
  };
}

/**
 * Format genealogy tree for LLM consumption
 */
function generateGenealogyUserMessage(
  userPrompt: string,
  visualBundle: any,
): string {
  // Group nodes by depth for clear presentation
  const nodesByDepth: Record<number, any[]> = {};
  for (const node of visualBundle.nodes) {
    if (!nodesByDepth[node.depth]) {
      nodesByDepth[node.depth] = [];
    }
    nodesByDepth[node.depth].push(node);
  }

  const maxDepth = Math.max(...Object.keys(nodesByDepth).map(Number));

  // Format verses as: ID:verseId [Reference] "Text"
  const formatForGenealogy = (verses: any[]) =>
    verses
      .map(
        (v) =>
          `ID:${v.id} [${v.book_name} ${v.chapter}:${v.verse}] "${v.text}"`,
      )
      .join("\n");

  // Build the genealogy structure
  let genealogyData = "";

  // Anchor (Depth 0)
  const anchor = nodesByDepth[0]?.[0];
  if (anchor) {
    genealogyData += `[THE ANCHOR]\n`;
    genealogyData += formatForGenealogy([anchor]);
    genealogyData += "\n\n";
  }

  // Children (Depth 1)
  const children = nodesByDepth[1] || [];
  if (children.length > 0) {
    genealogyData += `[THE CHILDREN (Depth 1 - ${children.length} verses)]\n`;
    genealogyData += formatForGenealogy(children);
    genealogyData += "\n\n";
  }

  // Grandchildren (Depth 2)
  const grandchildren = nodesByDepth[2] || [];
  if (grandchildren.length > 0) {
    genealogyData += `[THE GRANDCHILDREN (Depth 2 - ${grandchildren.length} verses)]\n`;
    genealogyData += formatForGenealogy(grandchildren);
    genealogyData += "\n\n";
  }

  // Great-grandchildren and beyond (Depth 3+)
  const deeper: any[] = [];
  for (let depth = 3; depth <= maxDepth; depth++) {
    deeper.push(...(nodesByDepth[depth] || []));
  }
  if (deeper.length > 0) {
    genealogyData += `[DEEPER GENERATIONS (Depth 3+ - ${deeper.length} verses)]\n`;
    genealogyData += formatForGenealogy(deeper);
    genealogyData += "\n";
  }

  return `USER QUERY: "${userPrompt}"

=== THE CLOUD OF WITNESSES (Available Data) ===

This genealogy tree shows ACTUAL cross-references from the KJV system.
Each verse is positioned by its genealogical depth from the anchor:
- Anchor: The root verse
- Children: Verses the anchor directly references
- Grandchildren: Verses the children reference
- And so on...

Total verses in tree: ${visualBundle.nodes.length}
Total reference connections: ${visualBundle.edges.length}

${genealogyData}`;
}
