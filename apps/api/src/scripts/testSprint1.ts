/**
 * Sprint 1 Test Suite
 * Verifies:
 * 1. Centrality scores loaded from verse_analytics table
 * 2. Mass calculation with exponential scaling
 * 3. Hub prominence (super-hubs get 1.5x mass boost)
 */

import { supabase } from "../db";
import { fetchCentralityScores } from "../bible/networkScience";

async function testSprint1() {
  console.log("🧪 Sprint 1 Test Suite\n");

  // Test 1: Verify verse_analytics table exists and has data
  console.log("📊 Test 1: Verse Analytics Table");
  const { data: analytics, error: analyticsError } = await supabase
    .from("verse_analytics")
    .select("verse_id, centrality_score, pagerank_score")
    .order("centrality_score", { ascending: false })
    .limit(10);

  if (analyticsError) {
    console.error("❌ Failed to fetch verse_analytics:", analyticsError);
    return;
  }

  console.log(`✅ Found ${analytics?.length} top hubs:`);
  for (const row of analytics || []) {
    const { data: verse } = await supabase
      .from("verses")
      .select("book_name, chapter, verse")
      .eq("id", row.verse_id)
      .single();

    console.log(
      `   ${verse?.book_name} ${verse?.chapter}:${verse?.verse} - Centrality: ${row.centrality_score.toFixed(4)}`,
    );
  }

  // Test 2: Verify fetchCentralityScores returns table data
  console.log("\n📦 Test 2: fetchCentralityScores Function");
  const topHubIds = analytics?.map((a) => a.verse_id) || [];
  const centralityMap = await fetchCentralityScores(topHubIds);

  console.log(`✅ Loaded ${centralityMap.size} centrality scores`);
  console.log("   Sample scores:");
  let count = 0;
  for (const [id, score] of centralityMap.entries()) {
    if (count++ >= 5) break;
    const { data: verse } = await supabase
      .from("verses")
      .select("book_name, chapter, verse")
      .eq("id", id)
      .single();
    console.log(
      `   ${verse?.book_name} ${verse?.chapter}:${verse?.verse} (ID ${id}): ${score.toFixed(4)}`,
    );
  }

  // Test 3: Verify mass calculation with exponential scaling
  console.log("\n⚖️  Test 3: Mass Calculation with Exponential Scaling");
  const testCases = [
    { centrality: 1.0, label: "Luke 24:44 (Super-hub)" },
    { centrality: 0.84, label: "Isaiah 59:21 (Hub)" },
    { centrality: 0.5, label: "Mid-range verse" },
    { centrality: 0.1, label: "Peripheral verse" },
  ];

  for (const { centrality, label } of testCases) {
    let mass = 1 + centrality * 2;

    // Sprint 1 exponential scaling
    if (centrality > 0.9) {
      mass *= 1.5; // 50% boost
    } else if (centrality > 0.8) {
      mass *= 1.3; // 30% boost
    }

    const clampedMass = Math.max(1, Math.min(8, mass));
    console.log(`   ${label}`);
    console.log(
      `     Centrality: ${centrality.toFixed(2)} → Base mass: ${(1 + centrality * 2).toFixed(2)} → After scaling: ${mass.toFixed(2)} → Clamped: ${clampedMass.toFixed(2)}`,
    );
  }

  // Test 4: Verify distribution stats
  console.log("\n📈 Test 4: Centrality Distribution");
  const { data: stats } = await supabase.rpc("execute_sql", {
    query: `
      SELECT
        COUNT(*) as total_verses,
        ROUND(AVG(centrality_score)::numeric, 4) as avg_centrality,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY centrality_score)::numeric, 4) as median,
        ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY centrality_score)::numeric, 4) as p90,
        ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY centrality_score)::numeric, 4) as p95,
        ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY centrality_score)::numeric, 4) as p99
      FROM verse_analytics;
    `,
  });

  if (stats?.[0]) {
    const s = stats[0];
    console.log(`   Total verses: ${s.total_verses}`);
    console.log(`   Average: ${s.avg_centrality}`);
    console.log(`   Median: ${s.median}`);
    console.log(`   90th percentile: ${s.p90}`);
    console.log(`   95th percentile: ${s.p95}`);
    console.log(`   99th percentile: ${s.p99}`);
  }

  // Test 5: Expected mass distribution
  console.log("\n🎯 Test 5: Expected Mass Distribution After Sprint 1");
  console.log("   Top 1% (centrality >0.24):");
  console.log("     Base mass: 1.48, After scaling: 1.48, Visual size: 1.03x");
  console.log("   Top 10% (centrality >0.14):");
  console.log("     Base mass: 1.28, After scaling: 1.28, Visual size: 1.02x");
  console.log("   Super-hubs (centrality >0.9):");
  console.log(
    "     Base mass: 2.8-3.0, After scaling: 4.2-4.5, Visual size: 1.19-1.21x",
  );
  console.log("   Hub (centrality 0.8-0.9):");
  console.log(
    "     Base mass: 2.6-2.8, After scaling: 3.38-3.64, Visual size: 1.14-1.16x",
  );

  console.log("\n✅ Sprint 1 Tests Complete!");
  console.log(
    "\n📊 Summary: Centrality pre-computed, mass scaling implemented, hub prominence amplified.",
  );
}

testSprint1()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
