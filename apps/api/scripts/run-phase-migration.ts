import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  console.error("Please add your Supabase service key to apps/api/.env");
  process.exit(1);
}

// Create admin client with service key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runPhaseMigration() {
  console.log("🔄 Starting phase-based roadmap migration...\n");

  // Read migration file
  const migrationPath = path.join(
    __dirname,
    "../supabase/migrations/20250203_phase_based_roadmap.sql",
  );

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("📄 Migration file loaded");
  console.log(`📏 SQL size: ${(sql.length / 1024).toFixed(2)} KB\n`);

  // For Postgres, we need to execute the entire SQL as one statement
  console.log("Executing migration...");

  try {
    // Use the raw SQL query directly
    const { error } = await supabase.rpc("exec_sql", { sql });

    if (error) {
      // Check if it's just tables that already exist
      if (
        error.message.includes("already exists") ||
        error.message.includes("duplicate")
      ) {
        console.log("⚠️  Some objects already exist (this is okay)\n");
        console.log(
          "✅ Migration applied (with some objects already existing)",
        );
      } else {
        console.error(`❌ Migration failed: ${error.message}`);
        console.error("\nYou may need to run this migration manually:");
        console.log("1. Go to Supabase Dashboard > SQL Editor");
        console.log(
          "2. Copy the contents of: apps/api/supabase/migrations/20250203_phase_based_roadmap.sql",
        );
        console.log("3. Paste and execute\n");
        process.exit(1);
      }
    } else {
      console.log("✅ Migration applied successfully!");
    }
  } catch (err) {
    console.error(
      `❌ Exception: ${err instanceof Error ? err.message : "Unknown error"}`,
    );
    console.error("\nYou may need to run this migration manually:");
    console.log("1. Go to Supabase Dashboard > SQL Editor");
    console.log(
      "2. Copy the contents of: apps/api/supabase/migrations/20250203_phase_based_roadmap.sql",
    );
    console.log("3. Paste and execute\n");
    process.exit(1);
  }
}

// Run migration
runPhaseMigration()
  .then(() => {
    console.log("\n✅ Phase migration complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  });
