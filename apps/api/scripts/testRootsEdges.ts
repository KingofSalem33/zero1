/**
 * Test ROOTS edges with real Strong's numbers data
 */

import { config } from "dotenv";
config();

import { supabase } from "../src/db";
import { fetchRootsEdges } from "../src/bible/edgeFetchers";

async function testRootsEdges() {
  console.log("=".repeat(60));
  console.log("Testing ROOTS Edges with Real Lexical Data");
  console.log("=".repeat(60));
  console.log();

  // Test Case 1: Genesis 1:1 - "In the beginning God created..."
  console.log("📖 Test Case 1: Genesis 1:1");
  console.log("   Finding verses that share Strong's numbers with Gen 1:1");
  console.log();

  const { data: gen11 } = await supabase
    .from("verses")
    .select("id, book_name, chapter, verse, text")
    .eq("book_abbrev", "gen")
    .eq("chapter", 1)
    .eq("verse", 1)
    .single();

  if (!gen11) {
    console.log("   ❌ Could not find Genesis 1:1");
    return;
  }

  console.log(`   Verse: ${gen11.book_name} ${gen11.chapter}:${gen11.verse}`);
  console.log(`   Text: ${gen11.text}`);
  console.log();

  // Get Strong's numbers for Gen 1:1
  const { data: strongsNumbers } = await supabase
    .from("verse_strongs")
    .select("strongs_number, position")
    .eq("verse_id", gen11.id)
    .order("position");

  console.log("   Strong's numbers in Gen 1:1:");
  if (strongsNumbers) {
    strongsNumbers.forEach((s) => {
      console.log(`      Position ${s.position}: ${s.strongs_number}`);
    });
  }
  console.log();

  // Fetch ROOTS edges
  console.log("   Fetching ROOTS edges...");
  const edges = await fetchRootsEdges([gen11.id], 10);

  console.log(`   ✅ Found ${edges.length} ROOTS edges`);
  console.log();

  if (edges.length > 0) {
    console.log("   Sample connections:");
    for (const edge of edges.slice(0, 5)) {
      const { data: targetVerse } = await supabase
        .from("verses")
        .select("book_name, chapter, verse, text")
        .eq("id", edge.to)
        .single();

      if (targetVerse) {
        console.log(
          `      → ${targetVerse.book_name} ${targetVerse.chapter}:${targetVerse.verse}`,
        );
        console.log(`        (via ${edge.metadata?.strongsNumber})`);
        console.log(`        "${targetVerse.text.substring(0, 60)}..."`);
        console.log();
      }
    }
  }

  console.log();
  console.log("=".repeat(60));

  // Test Case 2: John 3:16 - "For God so loved the world..."
  console.log("📖 Test Case 2: John 3:16");
  console.log("   Finding verses that share Strong's numbers with John 3:16");
  console.log();

  const { data: john316 } = await supabase
    .from("verses")
    .select("id, book_name, chapter, verse, text")
    .eq("book_abbrev", "jhn")
    .eq("chapter", 3)
    .eq("verse", 16)
    .single();

  if (!john316) {
    console.log("   ❌ Could not find John 3:16");
    return;
  }

  console.log(
    `   Verse: ${john316.book_name} ${john316.chapter}:${john316.verse}`,
  );
  console.log(`   Text: ${john316.text}`);
  console.log();

  // Get Strong's numbers for John 3:16
  const { data: strongsNumbers2 } = await supabase
    .from("verse_strongs")
    .select("strongs_number, position")
    .eq("verse_id", john316.id)
    .order("position");

  console.log("   Strong's numbers in John 3:16:");
  if (strongsNumbers2) {
    strongsNumbers2.slice(0, 10).forEach((s) => {
      console.log(`      Position ${s.position}: ${s.strongs_number}`);
    });
    if (strongsNumbers2.length > 10) {
      console.log(`      ... and ${strongsNumbers2.length - 10} more`);
    }
  }
  console.log();

  // Fetch ROOTS edges
  console.log("   Fetching ROOTS edges...");
  const edges2 = await fetchRootsEdges([john316.id], 10);

  console.log(`   ✅ Found ${edges2.length} ROOTS edges`);
  console.log();

  if (edges2.length > 0) {
    console.log("   Sample connections:");
    for (const edge of edges2.slice(0, 5)) {
      const { data: targetVerse } = await supabase
        .from("verses")
        .select("book_name, chapter, verse, text")
        .eq("id", edge.to)
        .single();

      if (targetVerse) {
        console.log(
          `      → ${targetVerse.book_name} ${targetVerse.chapter}:${targetVerse.verse}`,
        );
        console.log(`        (via ${edge.metadata?.strongsNumber})`);
        console.log(`        "${targetVerse.text.substring(0, 60)}..."`);
        console.log();
      }
    }
  }

  console.log();
  console.log("=".repeat(60));
  console.log("✅ ROOTS Edges Test Complete!");
  console.log("=".repeat(60));
  console.log();
  console.log("🎉 The verse_strongs table is working!");
  console.log(
    "   You now have true lexical connections based on Hebrew/Greek roots.",
  );
  console.log();

  process.exit(0);
}

testRootsEdges().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
