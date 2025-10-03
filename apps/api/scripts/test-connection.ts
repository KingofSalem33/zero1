import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

console.log("🔍 Testing Supabase connection...\n");

if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL not found in .env");
  process.exit(1);
}

if (!SUPABASE_ANON_KEY) {
  console.error("❌ SUPABASE_ANON_KEY not found in .env");
  process.exit(1);
}

console.log(`📍 URL: ${SUPABASE_URL}`);
console.log(`🔑 Key: ${SUPABASE_ANON_KEY.substring(0, 20)}...\n`);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  try {
    console.log("📊 Testing projects table...");
    const { error, count } = await supabase
      .from("projects")
      .select("*", { count: "exact", head: true });

    if (error) {
      console.error("❌ Error:", error.message);
      return false;
    }

    console.log(`✅ Connection successful!`);
    console.log(`📈 Projects count: ${count ?? 0}\n`);

    // Test if migration tables exist
    console.log("🔍 Checking for migration tables...\n");

    const tables = ["artifacts", "artifact_signals", "checkpoints"];

    for (const table of tables) {
      const { error: tableError, count: tableCount } = await supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (tableError) {
        if (tableError.message.includes("does not exist")) {
          console.log(`⚠️  ${table}: NOT FOUND (migration needed)`);
        } else {
          console.log(`❌ ${table}: ${tableError.message}`);
        }
      } else {
        console.log(`✅ ${table}: Found (${tableCount ?? 0} rows)`);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Next steps:");
    console.log("1. If migration tables are missing, run the migration");
    console.log("2. Go to: https://ciuxquemfnbruvvzbfth.supabase.co/project/_/sql");
    console.log("3. Copy/paste database_migration_artifacts.sql");
    console.log("4. Run and verify using TEST_MIGRATION.md");
    console.log("=".repeat(60));

    return true;
  } catch (err: any) {
    console.error("❌ Connection failed:", err.message);
    return false;
  }
}

testConnection();