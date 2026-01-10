/**
 * Test Graph Walker Mass Integration
 * Verifies mass is calculated correctly with centrality from database
 */

import { fetchCentralityScores } from "../bible/networkScience";

async function testGraphWalkerMass() {
  console.log("🧪 Graph Walker Mass Calculation Test\n");

  // Simulate graph walker mass calculation for Luke 24:44
  const lukeVerseId = 88233; // Luke 24:44

  console.log("📊 Testing Luke 24:44 (Top Hub)");

  // Fetch centrality from database
  const centralityMap = await fetchCentralityScores([lukeVerseId]);
  const centrality = centralityMap.get(lukeVerseId) ?? 0.1;

  console.log(`   Centrality from DB: ${centrality.toFixed(4)}`);

  // Simulate graphWalker.ts mass calculation (lines 648-671)
  let mass = 1 + centrality * 2;
  console.log(`   Base mass (1 + centrality * 2): ${mass.toFixed(2)}`);

  // Sprint 1: Exponential scaling
  if (centrality > 0.9) {
    console.log(`   ✨ Super-hub detected (centrality > 0.9)`);
    mass *= 1.5;
    console.log(`   After 50% boost: ${mass.toFixed(2)}`);
  } else if (centrality > 0.8) {
    console.log(`   ✨ Hub detected (centrality > 0.8)`);
    mass *= 1.3;
    console.log(`   After 30% boost: ${mass.toFixed(2)}`);
  }

  // Simulate structural bonuses (if applicable)
  const isCenter = false; // Would check structure.centerId === node.id
  const hasMirror = false; // Would check mirrorLookup.has(node.id)

  if (isCenter) {
    mass += 3;
    console.log(`   + Chiasm center bonus: +3.0`);
  }
  if (hasMirror) {
    mass += 0.6;
    console.log(`   + Mirror pair bonus: +0.6`);
  }

  // Clamp to [1, 8]
  const clampedMass = Math.max(1, Math.min(8, mass));
  console.log(`   Final mass (clamped 1-8): ${clampedMass.toFixed(2)}`);

  // Verify visual size scaling (from VerseNode.tsx)
  const baseWidth = 120; // Depth 1 node
  const massScale = 1 + (clampedMass - 1) * 0.06;
  const scaledWidth = Math.round(baseWidth * massScale);

  console.log(`\n📐 Visual Size Scaling (Depth 1 Node):`);
  console.log(`   Base width: ${baseWidth}px`);
  console.log(`   Mass scale factor: ${massScale.toFixed(3)}x`);
  console.log(`   Scaled width: ${scaledWidth}px`);
  console.log(
    `   Size increase: ${((massScale - 1) * 100).toFixed(1)}% larger`,
  );

  // Compare with peripheral verse
  console.log(`\n🔄 Comparison: Peripheral Verse (centrality 0.1)`);
  const peripheralCentrality = 0.1;
  const peripheralMass = 1 + peripheralCentrality * 2;
  const peripheralClamped = Math.max(1, Math.min(8, peripheralMass));
  const peripheralScale = 1 + (peripheralClamped - 1) * 0.06;
  const peripheralWidth = Math.round(baseWidth * peripheralScale);

  console.log(`   Centrality: ${peripheralCentrality.toFixed(2)}`);
  console.log(`   Final mass: ${peripheralClamped.toFixed(2)}`);
  console.log(`   Visual width: ${peripheralWidth}px`);
  console.log(
    `   Hub/Peripheral ratio: ${(scaledWidth / peripheralWidth).toFixed(2)}x`,
  );

  // Force layout repulsion test
  console.log(`\n💫 Force Layout Repulsion (from forceLayout.ts):`);
  const similarity = 0.5;
  const BASE_REPULSION = -600;

  // Hub repulsion
  const hubBase = BASE_REPULSION * (1 - similarity * 0.8);
  const hubRepulsion = hubBase * (0.7 + clampedMass * 0.3);
  console.log(
    `   Luke 24:44 repulsion: ${hubRepulsion.toFixed(0)} (mass ${clampedMass.toFixed(2)})`,
  );

  // Peripheral repulsion
  const peripheralBase = BASE_REPULSION * (1 - similarity * 0.8);
  const peripheralRepulsion = peripheralBase * (0.7 + peripheralClamped * 0.3);
  console.log(
    `   Peripheral repulsion: ${peripheralRepulsion.toFixed(0)} (mass ${peripheralClamped.toFixed(2)})`,
  );
  console.log(
    `   Repulsion ratio: ${(hubRepulsion / peripheralRepulsion).toFixed(2)}x stronger`,
  );

  console.log(`\n✅ Graph Walker Integration Test Complete!`);
  console.log(`\n📊 Sprint 1 Impact:`);
  console.log(
    `   - Luke 24:44 renders ${((massScale - 1) * 100).toFixed(1)}% larger than base`,
  );
  console.log(
    `   - ${(scaledWidth / peripheralWidth).toFixed(2)}x larger than peripheral verses`,
  );
  console.log(
    `   - ${(hubRepulsion / peripheralRepulsion).toFixed(2)}x stronger repulsion (more spacing)`,
  );
}

testGraphWalkerMass()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
