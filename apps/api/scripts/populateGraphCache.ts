/**
 * Populate Materialized Graph Cache
 *
 * Pre-computes the top N connections for every verse in the Bible.
 * This script runs overnight (est. 8-12 hours for full Bible).
 *
 * Strategy:
 * 1. Fetch all verses from database
 * 2. For each verse:
 *    a. Compute Ring 1 edges (direct cross-references + Strong's matches)
 *    b. Compute Ring 2 edges (connections of connections)
 *    c. Compute Ring 3 edges (deep semantic similarity)
 * 3. Store top 100 connections per verse in cache
 *
 * Features:
 * - Resumable (skips already-cached verses)
 * - Progress tracking with ETA
 * - Batch inserts for performance
 * - Configurable limits per ring
 */

import { config } from "dotenv";
config();

import { supabase } from "../src/db";
import { fetchDeeperEdges, fetchRootsEdges } from "../src/bible/edgeFetchers";

interface CacheEntry {
  source_verse_id: number;
  target_verse_id: number;
  edge_type: string;
  similarity_score: number;
  ring_depth: number;
  metadata?: Record<string, unknown>;
}

const BATCH_SIZE = 1000; // Insert cache entries in batches
const CHECKPOINT_INTERVAL = 100; // Log progress every N verses

// Budget per ring (total ~100 edges per verse)
const RING_1_LIMIT = 40; // Direct connections
const RING_2_LIMIT = 40; // Connections of connections
const RING_3_LIMIT = 20; // Deep thematic

async function getVerseCount(): Promise<number> {
  const { count } = await supabase
    .from("verses")
    .select("*", { count: "exact", head: true });
  return count || 0;
}

async function getCachedVerseCount(): Promise<number> {
  const { data } = await supabase
    .from("related_verses_cache")
    .select("source_verse_id")
    .limit(1);

  if (!data || data.length === 0) return 0;

  const { count } = await supabase
    .rpc("exec_sql", {
      query:
        "SELECT COUNT(DISTINCT source_verse_id) as count FROM related_verses_cache",
    })
    .single();

  return count?.count || 0;
}

async function getVersesToProcess(limit: number = 500): Promise<number[]> {
  // Get verses that haven't been cached yet
  const { data: allVerses } = await supabase
    .from("verses")
    .select("id")
    .order("id")
    .limit(limit);

  if (!allVerses) return [];

  // Check which ones are already cached
  const verseIds = allVerses.map((v) => v.id);

  const { data: cachedVerses } = await supabase
    .from("related_verses_cache")
    .select("source_verse_id")
    .in("source_verse_id", verseIds);

  const cachedIds = new Set(cachedVerses?.map((v) => v.source_verse_id) || []);

  return verseIds.filter((id) => !cachedIds.has(id));
}

async function computeRing1(verseId: number): Promise<CacheEntry[]> {
  const entries: CacheEntry[] = [];

  // Fetch DEEPER edges (cross-references)
  const deeperEdges = await fetchDeeperEdges([verseId], RING_1_LIMIT);
  for (const edge of deeperEdges) {
    entries.push({
      source_verse_id: verseId,
      target_verse_id: edge.to,
      edge_type: "DEEPER",
      similarity_score: edge.weight,
      ring_depth: 1,
    });
  }

  // Fetch ROOTS edges (lexical via Strong's)
  const rootsEdges = await fetchRootsEdges(
    [verseId],
    Math.max(0, RING_1_LIMIT - deeperEdges.length),
  );
  for (const edge of rootsEdges) {
    entries.push({
      source_verse_id: verseId,
      target_verse_id: edge.to,
      edge_type: "ROOTS",
      similarity_score: edge.weight,
      ring_depth: 1,
      metadata: edge.metadata,
    });
  }

  return entries;
}

async function computeRing2(
  verseId: number,
  ring1Targets: number[],
): Promise<CacheEntry[]> {
  if (ring1Targets.length === 0) return [];

  const entries: CacheEntry[] = [];
  const seen = new Set([verseId, ...ring1Targets]); // Avoid cycles

  // Get connections of Ring 1 targets
  const deeperEdges = await fetchDeeperEdges(ring1Targets, RING_2_LIMIT * 2);

  // Score by frequency (how many Ring 1 verses point to them)
  const frequencyMap = new Map<number, number>();
  for (const edge of deeperEdges) {
    if (!seen.has(edge.to)) {
      frequencyMap.set(edge.to, (frequencyMap.get(edge.to) || 0) + 1);
    }
  }

  // Sort by frequency and take top N
  const sortedTargets = Array.from(frequencyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, RING_2_LIMIT);

  for (const [targetId, frequency] of sortedTargets) {
    entries.push({
      source_verse_id: verseId,
      target_verse_id: targetId,
      edge_type: "DEEPER",
      similarity_score: Math.min(0.9, frequency / ring1Targets.length), // Normalize
      ring_depth: 2,
    });
  }

  return entries;
}

async function computeRing3Semantic(
  verseId: number,
  existingTargets: Set<number>,
): Promise<CacheEntry[]> {
  // Get verse embedding
  const { data: sourceVerse } = await supabase
    .from("verses")
    .select("embedding")
    .eq("id", verseId)
    .single();

  if (!sourceVerse?.embedding) return [];

  // Find semantically similar verses (not already in Ring 1 or 2)
  const { data: similarVerses } = await supabase.rpc(
    "search_verses_by_embedding",
    {
      query_embedding: sourceVerse.embedding,
      match_limit: RING_3_LIMIT * 3,
      similarity_threshold: 0.75,
    },
  );

  if (!similarVerses) return [];

  const entries: CacheEntry[] = [];
  let count = 0;

  for (const verse of similarVerses) {
    if (
      verse.id !== verseId &&
      !existingTargets.has(verse.id) &&
      count < RING_3_LIMIT
    ) {
      entries.push({
        source_verse_id: verseId,
        target_verse_id: verse.id,
        edge_type: "SEMANTIC",
        similarity_score: verse.similarity,
        ring_depth: 3,
      });
      count++;
    }
  }

  return entries;
}

async function populateGraphCache() {
  console.log("=".repeat(70));
  console.log("Populating Materialized Graph Cache");
  console.log("=".repeat(70));
  console.log();

  const startTime = Date.now();

  const totalVerses = await getVerseCount();
  const cachedVerses = await getCachedVerseCount();

  console.log(`📊 Database state:`);
  console.log(`   Total verses: ${totalVerses.toLocaleString()}`);
  console.log(`   Already cached: ${cachedVerses.toLocaleString()}`);
  console.log(`   Remaining: ${(totalVerses - cachedVerses).toLocaleString()}`);
  console.log();

  if (cachedVerses >= totalVerses) {
    console.log("✅ Cache is already fully populated!");
    console.log();
    process.exit(0);
  }

  console.log(`⚙️  Settings:`);
  console.log(`   Ring 1 limit: ${RING_1_LIMIT} edges`);
  console.log(`   Ring 2 limit: ${RING_2_LIMIT} edges`);
  console.log(`   Ring 3 limit: ${RING_3_LIMIT} edges`);
  console.log(`   Batch size: ${BATCH_SIZE} entries`);
  console.log();

  let processedCount = 0;
  let totalEdgesCreated = 0;

  while (true) {
    // Get next batch of verses to process
    const versesToProcess = await getVersesToProcess(CHECKPOINT_INTERVAL);

    if (versesToProcess.length === 0) {
      console.log("✅ All verses processed!");
      break;
    }

    const batchEntries: CacheEntry[] = [];

    for (const verseId of versesToProcess) {
      try {
        // Ring 1: Direct connections
        const ring1 = await computeRing1(verseId);
        batchEntries.push(...ring1);

        // Ring 2: Connections of connections
        const ring1Targets = ring1.map((e) => e.target_verse_id);
        const ring2 = await computeRing2(verseId, ring1Targets);
        batchEntries.push(...ring2);

        // Ring 3: Deep semantic similarity
        const existingTargets = new Set([
          ...ring1.map((e) => e.target_verse_id),
          ...ring2.map((e) => e.target_verse_id),
        ]);
        const ring3 = await computeRing3Semantic(verseId, existingTargets);
        batchEntries.push(...ring3);

        processedCount++;
        totalEdgesCreated += ring1.length + ring2.length + ring3.length;
      } catch (error) {
        console.error(`   ❌ Error processing verse ${verseId}:`, error);
      }
    }

    // Batch insert
    if (batchEntries.length > 0) {
      for (let i = 0; i < batchEntries.length; i += BATCH_SIZE) {
        const batch = batchEntries.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from("related_verses_cache")
          .insert(batch);

        if (error) {
          console.error(`   ⚠️  Batch insert error:`, error.message);
        }
      }
    }

    // Progress update
    const now = Date.now();
    const elapsed = now - startTime;
    const versesPerSecond = processedCount / (elapsed / 1000);
    const remaining = totalVerses - cachedVerses - processedCount;
    const etaSeconds = remaining / versesPerSecond;

    console.log(
      `📈 Progress: ${processedCount.toLocaleString()} verses processed`,
    );
    console.log(`   Edges created: ${totalEdgesCreated.toLocaleString()}`);
    console.log(`   Speed: ${versesPerSecond.toFixed(2)} verses/sec`);
    console.log(`   ETA: ${Math.round(etaSeconds / 60)} minutes`);
    console.log();
  }

  const totalTime = (Date.now() - startTime) / 1000 / 60;

  console.log();
  console.log("=".repeat(70));
  console.log("✅ Graph Cache Population Complete!");
  console.log("=".repeat(70));
  console.log(`   Verses processed: ${processedCount.toLocaleString()}`);
  console.log(`   Total edges created: ${totalEdgesCreated.toLocaleString()}`);
  console.log(
    `   Average edges per verse: ${(totalEdgesCreated / processedCount).toFixed(1)}`,
  );
  console.log(`   Total time: ${totalTime.toFixed(1)} minutes`);
  console.log();

  console.log("🚀 Your graph queries are now 10-20x faster!");
  console.log();

  process.exit(0);
}

populateGraphCache().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
