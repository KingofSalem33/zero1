import { config } from "dotenv";
config();

import { supabase } from "../src/db";

async function checkEmbeddingStatus() {
  // Total verses
  const { count: totalCount } = await supabase
    .from("verses")
    .select("*", { count: "exact", head: true });

  // Verses with embeddings
  const { count: withEmbeddings } = await supabase
    .from("verses")
    .select("*", { count: "exact", head: true })
    .not("embedding", "is", null);

  // Verses without embeddings
  const { count: withoutEmbeddings } = await supabase
    .from("verses")
    .select("*", { count: "exact", head: true })
    .is("embedding", null);

  console.log("=".repeat(60));
  console.log("Embedding Status");
  console.log("=".repeat(60));
  console.log(`Total verses:             ${totalCount?.toLocaleString() || 0}`);
  console.log(
    `Verses with embeddings:   ${withEmbeddings?.toLocaleString() || 0}`,
  );
  console.log(
    `Verses without embeddings: ${withoutEmbeddings?.toLocaleString() || 0}`,
  );
  console.log();

  if (withoutEmbeddings && withoutEmbeddings > 0) {
    const estimatedCost = (withoutEmbeddings / 1000) * 0.00002 * 1536;
    const estimatedMinutes = Math.ceil(withoutEmbeddings / 100) * 0.5; // ~0.5 min per batch
    console.log(
      `Estimated cost to embed remaining: $${estimatedCost.toFixed(2)}`,
    );
    console.log(`Estimated time: ${estimatedMinutes} minutes`);
  }
  console.log();

  process.exit(0);
}

checkEmbeddingStatus();
