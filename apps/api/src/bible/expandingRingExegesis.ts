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
import { BIBLE_STUDY_IDENTITY, PERFORMANCE_STYLE } from "../config/prompts";

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
function generateSystemPrompt(): string {
  return `${BIBLE_STUDY_IDENTITY}

---

DATA STRUCTURE:

You will receive a core passage and 3 concentric rings of cross-references from the KJV Bible.

1. **ANCHOR PASSAGE (Ring 0)**: The main text and its immediate surrounding verses.
2. **DIRECT CONNECTIONS (Ring 1)**: Verses directly cited or linked to the anchor by the KJV's own cross-reference system.
3. **BROADER CONTEXT (Ring 2)**: Themes and teachings that support Ring 1.
4. **DEEP ECHOES (Ring 3)**: Distant theological connections and thematic parallels.

---

INSTRUCTIONS:

- **Start with the Anchor**: Explain the anchor verse first, focusing on its immediate context.
- **Trace the Genealogy**: Follow the reference chains - show how verses reference each other in a logical progression.
- **Build Depth**: Demonstrate how Scripture interprets Scripture through these reference connections.

**CRITICAL CITATION REQUIREMENT**:
When referencing Scripture, you MUST use the exact format: [Book Chapter:Verse]
Examples: [John 3:16], [Genesis 1:1], [Revelation 21:4], [1 Corinthians 13:4]

This is NOT optional. The interface depends on this bracketed format to highlight the theological path you trace through Scripture. Each verse you cite will light up on the user's visual genealogy tree, showing the "Golden Thread" of interconnected references.

You have been given a hierarchical tree of verse references:
- The anchor verse at the root
- Verses it references as children
- Verses those references cite as grandchildren
- And so on, following the chain of biblical cross-references

You do NOT need to cite all provided verses - only the ones that build your argument. Choose the clearest path through the reference genealogy to answer the question.
- **Scripture Only**: Do NOT use external commentary, theology books, or personal interpretation. Use only the provided KJV text.
- **Length: Approximately 200-300 words or (as required to cover the subject fully.)
- **Always ask follow up regarding the theme to the user then build bundle around them. 
---

${PERFORMANCE_STYLE}`;
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
    maxDepth: 6,
    maxNodes: 100,
    maxChildrenPerNode: 5,
  });

  // ========================================
  // STEP 3: Format Tree for LLM
  // ========================================
  const systemPrompt = generateSystemPrompt();
  const userMessage = generateGenealogyUserMessage(userPrompt, visualBundle);

  // ========================================
  // STEP 4: Run LLM
  // ========================================
  console.log("[Genealogy Exegesis] Running LLM (gpt-5-nano) for synthesis...");

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

  let treeStructure = "";
  for (let depth = 0; depth <= maxDepth; depth++) {
    const nodes = nodesByDepth[depth] || [];
    if (nodes.length === 0) continue;

    const depthLabel =
      depth === 0 ? "ANCHOR VERSE" : `DEPTH ${depth} (${nodes.length} verses)`;

    treeStructure += `\n== ${depthLabel} ==\n`;
    treeStructure += nodes.map((v) => formatVerse(v)).join("\n");
    treeStructure += "\n";
  }

  return `USER QUESTION:
"${userPrompt}"

---
REFERENCE GENEALOGY TREE (KJV)
---

This is a CRAWL through actual biblical cross-references, level by level:

- LEVEL 0: The ANCHOR VERSE (the passage you're explaining)
- LEVEL 1: Verses that the anchor ACTUALLY REFERENCES (from the KJV cross-reference system)
- LEVEL 2: Verses that LEVEL 1 verses reference
- LEVEL 3: Verses that LEVEL 2 verses reference

Each verse's children are its ACTUAL cross-references, not just thematically similar passages.
This creates a natural genealogy tree showing how Scripture references Scripture.

Total verses in tree: ${visualBundle.nodes.length}
Total reference connections: ${visualBundle.edges.length}

${treeStructure}
---

INSTRUCTIONS:
1. Start with the ANCHOR VERSE - explain it in context
2. Show how it REFERENCES other verses at Level 1 - why did the KJV editors link these?
3. Follow the reference chains deeper - how do Level 1 verses point to Level 2, and so on
4. Build your argument by tracing these ACTUAL reference chains, not just themes

The tree structure you see is the SAME tree the user sees in their visualization.
When you cite a verse using [Book Ch:v] format, it will highlight in their visual genealogy tree.`;
}
