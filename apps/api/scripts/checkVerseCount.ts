import { config } from "dotenv";
config();

import { supabase } from "../src/db";

async function checkVerseCount() {
  const { count, error } = await supabase
    .from("verses")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  console.log(`Total verses in database: ${count?.toLocaleString() || 0}`);
  process.exit(0);
}

checkVerseCount();
