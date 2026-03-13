/**
 * Test script for generating chapter footer
 * Usage: npx tsx scripts/testFooterGeneration.ts Genesis 1
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(__dirname, "../.env") });

import { buildReferenceTree } from "../src/bible/referenceGenealogy";
import { getVerseId } from "../src/bible/graphWalker";
import { runModel } from "../src/ai/runModel";
import type { ReferenceVisualBundle } from "../src/bible/expandingRingExegesis";

const FOOTER_SYSTEM_PROMPT = `You are a biblical scholar creating exploration cards for a Bible study app.

TASK:
Generate a chapter footer with:
1. An orientation sentence (18-22 words, descriptive, neutral tone)
2. 4-6 exploration cards

RULES:
1. GRAPH-GROUNDED: You can ONLY suggest cards based on the connected verses provided. Do NOT invent connections that aren't in the graph.
2. LENS DIVERSITY: Include at least 2 different lens types:
   - THREAD: Typological or thematic connections to other passages
   - ROOTS: Hebrew/Greek word studies (if relevant)
   - STRUCTURE: Literary patterns (chiasm, repetition, parallelism, etc.)
   - WORLD: Historical or cultural context (only if clearly relevant)
3. CARD TITLES: Short, evocative (3-7 words). Make them feel like destinations, not descriptions.
4. PROMPTS: These are what the user will explore. Make them conversational and specific.
5. ORIENTATION: Descriptive, not prescriptive. No "you should." No moralizing.

OUTPUT FORMAT (JSON only):
{
  "orientation": "Single sentence, 18-22 words, capturing the chapter's core significance",
  "cards": [
    {
      "lens": "THREAD" | "ROOTS" | "STRUCTURE" | "WORLD",
      "title": "Short evocative title",
      "prompt": "What the user will explore (conversational)"
    }
  ]
}

EXAMPLES OF GOOD CARD TITLES:
✅ "Creation → New Creation"
✅ "Let There Be Light"
✅ "The Word That Creates"
✅ "Seven Days, Seven Patterns"

EXAMPLES OF BAD CARD TITLES:
❌ "Connection between Genesis and Revelation"
❌ "Learn about creation"
❌ "Study this passage"

Return ONLY valid JSON, no other text.`;

interface ChapterFooter {
  orientation: string;
  cards: Array<{
    lens: "THREAD" | "ROOTS" | "STRUCTURE" | "WORLD";
    title: string;
    prompt: string;
  }>;
}

function formatTreeForLLM(
  tree: ReferenceVisualBundle,
  book: string,
  chapter: number,
): string {
  // Get connected verses (exclude same chapter)
  const connections = tree.nodes
    .filter((n) => !(n.book_name === book && n.chapter === chapter))
    .slice(0, 15) // Top 15 connections
    .map(
      (n) =>
        `[${n.book_name} ${n.chapter}:${n.verse}] "${n.text.substring(0, 100)}${n.text.length > 100 ? "..." : ""}"`,
    )
    .join("\n");

  return `CHAPTER TO ANALYZE:
${book} ${chapter}

CONNECTED VERSES (from cross-reference graph):
${connections || "(No cross-references found in graph)"}

Generate a footer for this chapter based ONLY on the connected verses listed above.`;
}

async function generateFooterForChapter(
  book: string,
  chapter: number,
): Promise<ChapterFooter | null> {
  console.log(`\n📖 Generating footer for ${book} ${chapter}...\n`);

  // 1. Get anchor verse (first verse of chapter)
  const anchorId = await getVerseId(book.toLowerCase(), chapter, 1);
  if (!anchorId) {
    console.error(`❌ Could not find anchor verse for ${book} ${chapter}`);
    return null;
  }
  console.log(`✓ Found anchor: ID ${anchorId}`);

  // 2. Build reference tree from graph
  console.log("🔍 Building reference tree from graph...");
  const tree = (await buildReferenceTree(anchorId, {
    maxDepth: 2,
    maxNodes: 20,
    maxChildrenPerNode: 999,
  })) as ReferenceVisualBundle;

  console.log(
    `✓ Graph found ${tree.nodes.length} connected verses, ${tree.edges.length} connections`,
  );

  // 3. Format tree for LLM
  const userMessage = formatTreeForLLM(tree, book, chapter);

  // 4. Generate with LLM
  console.log("🤖 Asking LLM to generate cards from graph data...\n");
  const result = await runModel(
    [
      { role: "system", content: FOOTER_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    {
      toolSpecs: [],
      toolMap: {},
      model: "gpt-4o-mini",
    },
  );

  // 5. Parse JSON response
  try {
    const footer = JSON.parse(result.text) as ChapterFooter;
    return footer;
  } catch {
    console.error(`❌ Failed to parse LLM response as JSON`);
    console.error("Raw response:", result.text);
    return null;
  }
}

function validateFooter(footer: ChapterFooter): void {
  console.log("\n📋 VALIDATION:\n");

  // Check orientation length
  const words = footer.orientation.split(" ").length;
  console.log(`Orientation: ${words} words (target: 18-22)`);
  if (words < 18 || words > 22) {
    console.warn(`⚠️  Orientation outside target range`);
  } else {
    console.log("✓ Orientation length OK");
  }

  // Check card count
  console.log(`Cards: ${footer.cards.length} (target: 4-6)`);
  if (footer.cards.length < 4 || footer.cards.length > 6) {
    console.warn(`⚠️  Card count outside target range`);
  } else {
    console.log("✓ Card count OK");
  }

  // Check lens diversity
  const lenses = new Set(footer.cards.map((c) => c.lens));
  console.log(`Lens diversity: ${lenses.size} unique lenses`);
  if (lenses.size < 2) {
    console.warn(`⚠️  Low lens diversity`);
  } else {
    console.log("✓ Lens diversity OK");
  }

  console.log();
}

function displayFooter(footer: ChapterFooter, book: string, chapter: number) {
  console.log("\n" + "=".repeat(80));
  console.log(`GENERATED FOOTER: ${book} ${chapter}`);
  console.log("=".repeat(80));
  console.log();

  console.log("📝 ORIENTATION:");
  console.log(`"${footer.orientation}"`);
  console.log();

  console.log("🎴 CARDS:");
  footer.cards.forEach((card, i) => {
    console.log();
    console.log(`Card ${i + 1}: [${card.lens}]`);
    console.log(`  Title: "${card.title}"`);
    console.log(`  Prompt: "${card.prompt}"`);
  });

  console.log();
  console.log("=".repeat(80));
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: npx tsx scripts/testFooterGeneration.ts <book> <chapter>",
    );
    console.error("Example: npx tsx scripts/testFooterGeneration.ts Genesis 1");
    process.exit(1);
  }

  const book = args[0];
  const chapter = parseInt(args[1]);

  if (isNaN(chapter)) {
    console.error("Chapter must be a number");
    process.exit(1);
  }

  const footer = await generateFooterForChapter(book, chapter);

  if (!footer) {
    console.error("\n❌ Footer generation failed");
    process.exit(1);
  }

  validateFooter(footer);
  displayFooter(footer, book, chapter);

  console.log("\n✅ Footer generation complete!\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
