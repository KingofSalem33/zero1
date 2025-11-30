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
import { buildContextBundle, getVerseId, formatVerse, type ContextBundle, type Verse } from "./graphWalker";
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
      explicitRef.verse
    );

    if (anchorId) {
      console.log(`[Expanding Ring] Resolved to verse ID ${anchorId}`);
      return anchorId;
    } else {
      console.warn(`[Expanding Ring] Explicit reference not found in database: ${explicitRef.book} ${explicitRef.chapter}:${explicitRef.verse}`);
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
        parsedConcept.verse
      );

      if (anchorId) {
        console.log(`[Expanding Ring] Resolved concept to verse ID ${anchorId}`);
        return anchorId;
      }
    }
  }

  // FALLBACK: Keyword search
  console.log("[Expanding Ring] No explicit reference or concept match, using keyword search...");

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
  console.log(`[Expanding Ring] Selected: ${bestCandidate.book} ${bestCandidate.chapter}:${bestCandidate.verse}`);

  // Normalize book name for database lookup
  // searchVerses returns full names like "Judges", database uses abbreviations like "jud"
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BOOK_NAMES } = require("./bookNames");

  let bookAbbrev = bestCandidate.book.toLowerCase();

  // Try to match full name to abbreviation
  for (const [abbrev, fullName] of Object.entries(BOOK_NAMES)) {
    if (fullName.toLowerCase() === bookAbbrev) {
      bookAbbrev = abbrev;
      console.log(`[Expanding Ring] Matched full name "${bestCandidate.book}" to abbrev "${abbrev}"`);
      break;
    }
  }

  // If still not found, it might already be an abbreviation - just ensure lowercase
  if (bookAbbrev === bestCandidate.book.toLowerCase()) {
    // Check if it's a valid abbreviation by checking BOOK_NAMES keys
    const validAbbrev = Object.keys(BOOK_NAMES).find(k => k.toLowerCase() === bookAbbrev);
    if (validAbbrev) {
      bookAbbrev = validAbbrev.toLowerCase();
      console.log(`[Expanding Ring] Using abbreviation "${bookAbbrev}" directly`);
    }
  }

  console.log(`[Expanding Ring] Looking up in DB: book="${bookAbbrev}", chapter=${bestCandidate.chapter}, verse=${bestCandidate.verse}`);

  // Get verse ID from database
  const anchorId = await getVerseId(
    bookAbbrev,
    bestCandidate.chapter,
    bestCandidate.verse
  );

  if (!anchorId) {
    console.error(`[Expanding Ring] Database lookup failed for ${bookAbbrev} ${bestCandidate.chapter}:${bestCandidate.verse}`);
    console.error(`[Expanding Ring] This likely means the Supabase database hasn't been populated yet.`);
    console.error(`[Expanding Ring] Please run: npx ts-node scripts/importBibleToSupabase.ts`);
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

- **Start with the Anchor**: Explain Ring 0 first, focusing on the immediate context.
- **Move Outward**: Show how Ring 1 clarifies and confirms the Anchor.
- **Build Depth**: Use Ring 2 and Ring 3 to demonstrate the "Golden Thread" - the consistency of Scripture interpreting Scripture.
- **Citation Style**: Quote verse text when relevant. Use the format: (Book Chapter:Verse).
- **Scripture Only**: Do NOT use external commentary, theology books, or personal interpretation. Use only the provided KJV text.

---

${PERFORMANCE_STYLE}`;
}

/**
 * Step 3: Generate User Message (The "Data")
 *
 * Formats the context bundle into structured text
 */
function generateUserMessage(userPrompt: string, bundle: ContextBundle): string {
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
      answer: "I could not find specific KJV verses matching your question. Please try rephrasing with more specific biblical terms or include a verse reference (e.g., 'John 3:16').",
      anchor: {
        id: 0,
        book_abbrev: "",
        book_name: "",
        chapter: 0,
        verse: 0,
        text: "",
      },
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
  // STEP 4: Run LLM (GPT-5.1 for synthesis)
  // ========================================
  console.log("[Expanding Ring] Running LLM (gpt-5.1) for synthesis...");

  const result = await runModel(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    {
      toolSpecs: [],
      toolMap: {},
      model: "gpt-5.1", // Use GPT-5.1 for final synthesis
    }
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
    contextStats: stats,
  };
}
