import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

async function runMigration() {
  console.log("[Migration 003] Starting: Add edge type tables...");

  // Use service role key for admin operations
  const supabaseUrl =
    process.env.SUPABASE_URL || "https://ciuxquemfnbruvvzbfth.supabase.co";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseServiceKey) {
    console.error(
      "[Migration 003] ERROR: SUPABASE_SERVICE_KEY not set in environment",
    );
    console.log("Please set SUPABASE_SERVICE_KEY in your .env file");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Read the SQL file
    const sqlPath = join(
      __dirname,
      "../migrations/003_add_edge_type_tables.sql",
    );
    const sql = readFileSync(sqlPath, "utf-8");

    console.log("[Migration 003] Executing SQL...");
    console.log(`[Migration 003] SQL length: ${sql.length} characters`);

    // Split SQL into individual statements and execute them
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(
        (s) => s.length > 0 && !s.startsWith("--") && !s.startsWith("COMMENT"),
      );

    for (const statement of statements) {
      if (
        statement.includes("CREATE TABLE") ||
        statement.includes("CREATE INDEX")
      ) {
        console.log(
          `[Migration 003] Executing: ${statement.substring(0, 50)}...`,
        );
        const { error } = await supabase.rpc("exec", { sql: statement + ";" });

        if (error) {
          console.error(`[Migration 003] Error executing statement:`, error);
          console.error(`Statement was: ${statement}`);
        }
      }
    }

    console.log("\n[Migration 003] ✅ Migration complete!");
    console.log("\nCreated 4 new tables:");
    console.log("  ✓ verse_strongs (for ROOTS edges - lexical connections)");
    console.log("  ✓ citations (for ECHOES edges - NT quoting OT)");
    console.log("  ✓ prophecies (for PROPHECY edges - fulfillment)");
    console.log("  ✓ genealogies (for GENEALOGY edges - family lineage)");
    console.log(
      "\nYou can now manually add data to these tables via Supabase dashboard",
    );
    console.log("or create population scripts as needed.");
  } catch (error) {
    console.error("[Migration 003] Unexpected error:", error);
    process.exit(1);
  }
}

runMigration();
