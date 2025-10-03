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

async function runMigration() {
  console.log("🔄 Starting database migration...\n");

  // Read migration file
  const migrationPath = path.join(__dirname, "../../../database_migration_artifacts.sql");
  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");

  console.log("📄 Migration file loaded");
  console.log(`📏 SQL size: ${(sql.length / 1024).toFixed(2)} KB\n`);

  // Split by statement (basic split on semicolons)
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(`📝 Found ${statements.length} SQL statements\n`);

  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];

    // Skip comments
    if (statement.startsWith("--")) {
      skipCount++;
      continue;
    }

    // Show progress
    const preview = statement.substring(0, 60).replace(/\n/g, " ");
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);

    try {
      const { error } = await supabase.rpc("exec_sql", { sql: statement });

      if (error) {
        // Check if error is "already exists" - that's okay
        if (
          error.message.includes("already exists") ||
          error.message.includes("duplicate")
        ) {
          console.log("  ⚠️  Already exists (skipping)");
          skipCount++;
        } else {
          console.error(`  ❌ Error: ${error.message}`);
          // Don't exit - continue with other statements
        }
      } else {
        console.log("  ✅ Success");
        successCount++;
      }
    } catch (err: any) {
      console.error(`  ❌ Exception: ${err.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Migration complete!`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`⚠️  Skipped: ${skipCount}`);
  console.log(`❌ Failed: ${statements.length - successCount - skipCount}`);
  console.log("=".repeat(60) + "\n");
}

// Note: Supabase doesn't have exec_sql by default
// Let's use direct SQL execution via REST API instead
async function runMigrationDirect() {
  console.log("🔄 Starting database migration...\n");
  console.log("⚠️  NOTE: You need to run this migration manually in Supabase Dashboard");
  console.log("📍 Location: database_migration_artifacts.sql\n");

  console.log("Steps:");
  console.log("1. Go to https://ciuxquemfnbruvvzbfth.supabase.co/project/_/sql");
  console.log("2. Click 'New query'");
  console.log("3. Copy contents of database_migration_artifacts.sql");
  console.log("4. Paste and click 'Run'\n");

  console.log("Or follow the detailed test plan in TEST_MIGRATION.md");
}

// Run
runMigrationDirect();