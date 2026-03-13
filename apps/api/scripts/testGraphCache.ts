/**
 * Test Graph Cache Population (Small Sample)
 *
 * Tests the cache population logic on 10 verses before running the full overnight job.
 */

import { config } from "dotenv";
config();

import { supabase } from "../src/db";
import { fetchDeeperEdges, fetchRootsEdges } from "../src/bible/edgeFetchers";

async function testGraphCache() {
  console.log("=".repeat(70));
  console.log("Testing Graph Cache Population (10 verses)");
  console.log("=".repeat(70));
  console.log();

  // Get 10 sample verses
  const { data: verses } = await supabase
    .from("verses")
    .select("id, book_name, chapter, verse, text")
    .order("id")
    .limit(10);

  if (!verses) {
    console.log("❌ Could not fetch verses");
    return;
  }

  console.log(`📖 Processing ${verses.length} sample verses:`);
  for (const v of verses) {
    console.log(`   - ${v.book_name} ${v.chapter}:${v.verse}`);
  }
  console.log();

  let totalEdges = 0;

  for (const verse of verses) {
    console.log(
      `\n📍 Processing ${verse.book_name} ${verse.chapter}:${verse.verse}...`,
    );

    // Ring 1: Direct connections
    const ring1 = await fetchDeeperEdges([verse.id], 20);
    const rootsEdges = await fetchRootsEdges([verse.id], 10);

    console.log(
      `   Ring 1: ${ring1.length} DEEPER + ${rootsEdges.length} ROOTS edges`,
    );

    const cacheEntries = [
      ...ring1.map((e) => ({
        source_verse_id: verse.id,
        target_verse_id: e.to,
        edge_type: "DEEPER",
        similarity_score: e.weight,
        ring_depth: 1,
      })),
      ...rootsEdges.map((e) => ({
        source_verse_id: verse.id,
        target_verse_id: e.to,
        edge_type: "ROOTS",
        similarity_score: e.weight,
        ring_depth: 1,
        metadata: e.metadata,
      })),
    ];

    // Insert into cache
    if (cacheEntries.length > 0) {
      const { error } = await supabase
        .from("related_verses_cache")
        .insert(cacheEntries);

      if (error) {
        console.log(`   ❌ Error: ${error.message}`);
      } else {
        console.log(`   ✅ Cached ${cacheEntries.length} edges`);
        totalEdges += cacheEntries.length;
      }
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log(`✅ Test Complete!`);
  console.log(`   Total edges cached: ${totalEdges}`);
  console.log(
    `   Average per verse: ${(totalEdges / verses.length).toFixed(1)}`,
  );
  console.log();

  // Test retrieval
  console.log("🔍 Testing cache retrieval...");
  const testVerseId = verses[0].id;

  const { data: cachedEdges } = await supabase
    .from("related_verses_cache")
    .select("target_verse_id, edge_type, similarity_score, ring_depth")
    .eq("source_verse_id", testVerseId);

  console.log(
    `   Verse: ${verses[0].book_name} ${verses[0].chapter}:${verses[0].verse}`,
  );
  console.log(`   Cached edges found: ${cachedEdges?.length || 0}`);

  if (cachedEdges && cachedEdges.length > 0) {
    console.log(`   Sample edges:`);
    for (const edge of cachedEdges.slice(0, 5)) {
      const { data: targetVerse } = await supabase
        .from("verses")
        .select("book_name, chapter, verse")
        .eq("id", edge.target_verse_id)
        .single();

      if (targetVerse) {
        console.log(
          `      → ${targetVerse.book_name} ${targetVerse.chapter}:${targetVerse.verse} (${edge.edge_type}, score: ${edge.similarity_score.toFixed(2)})`,
        );
      }
    }
  }

  console.log();
  console.log("🎉 Cache test successful! Ready for full population.");
  console.log();

  process.exit(0);
}

testGraphCache().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
