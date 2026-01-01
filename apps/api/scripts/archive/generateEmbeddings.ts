/**
 * Generate embeddings for all Bible verses
 *
 * This script:
 * 1. Fetches all verses from the database
 * 2. Generates embeddings using OpenAI text-embedding-3-small
 * 3. Updates the database with the embeddings
 * 4. Shows progress and estimates
 *
 * Usage:
 *   npx tsx scripts/generateEmbeddings.ts
 *
 * Cost estimate: ~$5 for entire KJV (31,102 verses)
 * Time estimate: ~30-60 minutes depending on rate limits
 */

// CRITICAL: Load environment variables FIRST, before any other imports
import { config } from "dotenv";
config(); // This loads from .env in the current directory (apps/api)

import { supabase } from "../src/db";
import OpenAI from "openai";
import { ENV } from "../src/env";

const BATCH_SIZE = 100; // Process 100 verses at a time
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

interface Verse {
  id: number;
  book_abbrev: string;
  book_name: string;
  chapter: number;
  verse: number;
  text: string;
}

async function generateEmbeddings() {
  console.log("=".repeat(60));
  console.log("Bible Verse Embedding Generation");
  console.log("=".repeat(60));
  console.log();

  // Check OpenAI API key
  if (!ENV.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY not found in environment");
    console.error("   Please set OPENAI_API_KEY in your .env file");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });

  // Step 1: Fetch all verses WITHOUT embeddings using pagination
  console.log("📖 Fetching verses without embeddings from database...");

  const verses: Verse[] = [];
  const PAGE_SIZE = 1000;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("verses")
      .select("id, book_abbrev, book_name, chapter, verse, text")
      .is("embedding", null)
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error("❌ Failed to fetch verses:", error);
      process.exit(1);
    }

    if (data && data.length > 0) {
      verses.push(...data);
      page++;
      process.stdout.write(
        `\r   Fetched ${verses.length.toLocaleString()} verses...`,
      );

      if (data.length < PAGE_SIZE) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  console.log(); // New line after progress
  const remaining = verses.length;
  console.log(
    `✅ Found ${remaining.toLocaleString()} verses without embeddings`,
  );
  console.log();

  if (remaining === 0) {
    console.log("✅ All verses already have embeddings!");
    console.log("   Run with --force to regenerate");
    return;
  }

  // Cost estimate
  const tokensPerVerse = 20; // Average estimate
  const totalTokens = remaining * tokensPerVerse;
  const costPer1MTokens = 0.02; // text-embedding-3-small pricing
  const estimatedCost = (totalTokens / 1_000_000) * costPer1MTokens;

  console.log("💰 Cost Estimate:");
  console.log(`   Model: ${EMBEDDING_MODEL}`);
  console.log(`   Verses to process: ${remaining.toLocaleString()}`);
  console.log(`   Estimated tokens: ${totalTokens.toLocaleString()}`);
  console.log(`   Estimated cost: $${estimatedCost.toFixed(2)}`);
  console.log();

  // Confirm before proceeding
  console.log("⚠️  This will make API calls to OpenAI");
  console.log("   Press Ctrl+C to cancel, or wait 5 seconds to continue...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log();

  // Step 3: Process in batches
  const startTime = Date.now();
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < verses.length; i += BATCH_SIZE) {
    const batch = verses.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(verses.length / BATCH_SIZE);

    console.log(
      `🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} verses)...`,
    );

    try {
      // Prepare input texts (combine reference + text for better semantic matching)
      const inputs = batch.map(
        (v) => `${v.book_name} ${v.chapter}:${v.verse} - ${v.text}`,
      );

      // Call OpenAI embeddings API
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: inputs,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      // Update database
      for (let j = 0; j < batch.length; j++) {
        const verse = batch[j];
        const embedding = response.data[j].embedding;

        const { error: updateError } = await supabase
          .from("verses")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", verse.id);

        if (updateError) {
          console.error(
            `   ❌ Failed to update verse ${verse.id}:`,
            updateError.message,
          );
          errors++;
        } else {
          processed++;
        }
      }

      // Progress update
      const percent = ((processed / remaining) * 100).toFixed(1);
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const eta = (remaining - processed) / rate / 60;

      console.log(`   ✅ Batch complete`);
      console.log(`   📊 Progress: ${processed}/${remaining} (${percent}%)`);
      console.log(`   ⏱️  Rate: ${rate.toFixed(1)} verses/sec`);
      console.log(`   ⏳ ETA: ${eta.toFixed(1)} minutes`);
      console.log();

      // Rate limiting: wait 1 second between batches to avoid hitting limits
      if (i + BATCH_SIZE < verses.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`   ❌ Batch ${batchNum} failed:`, error);
      errors += batch.length;

      // If rate limit error, wait longer
      if (error instanceof Error && error.message.includes("rate_limit")) {
        console.log("   ⏸️  Rate limit hit, waiting 60 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 60000));
      }
    }
  }

  // Summary
  console.log();
  console.log("=".repeat(60));
  console.log("✅ Embedding Generation Complete!");
  console.log("=".repeat(60));
  console.log(`   Total processed: ${processed.toLocaleString()} verses`);
  console.log(`   Errors: ${errors}`);
  console.log(
    `   Time elapsed: ${((Date.now() - startTime) / 60000).toFixed(1)} minutes`,
  );
  console.log();
  console.log("🚀 Next steps:");
  console.log("   1. Run the migration: 002_add_vector_search.sql");
  console.log("   2. Test semantic search in your API");
  console.log("   3. Update resolveAnchor() to use embeddings");
  console.log();
}

// Run the script
generateEmbeddings()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
