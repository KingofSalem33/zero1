// Load environment variables
import { config } from "dotenv";
config();

import { searchVersesByQuery } from "../src/bible/semanticSearch";

async function testSemanticSearch() {
  console.log("=".repeat(60));
  console.log("Semantic Search Test");
  console.log("=".repeat(60));
  console.log();

  const testQueries = [
    "Jesus walked on water",
    "In the beginning",
    "Love your neighbor",
    "Valley of dry bones",
    "Peter the rock",
  ];

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    console.log("-".repeat(60));

    try {
      // Get top 3 results
      const results = await searchVersesByQuery(query, 3, 0.5);

      if (results.length === 0) {
        console.log("  ❌ No results found");
      } else {
        results.forEach((result, i) => {
          console.log(
            `  ${i + 1}. ${result.book_name} ${result.chapter}:${result.verse}`,
          );
          console.log(
            `     Similarity: ${(result.similarity * 100).toFixed(1)}%`,
          );
          console.log(`     Text: "${result.text.substring(0, 80)}..."`);
        });
      }
    } catch (error) {
      console.error(`  ❌ Error: ${error}`);
    }

    console.log();
  }

  console.log("=".repeat(60));
  console.log("✅ Test Complete!");
  console.log("=".repeat(60));
  process.exit(0);
}

testSemanticSearch().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
