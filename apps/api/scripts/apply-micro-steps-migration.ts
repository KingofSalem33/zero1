/**
 * Apply Micro-Steps Migration
 * Run this script to add micro_steps table to the database
 */

import { supabase } from "../src/db";
import { readFileSync } from "fs";
import { join } from "path";

async function applyMigration() {
  console.log("📦 Applying micro-steps migration...\n");

  const migrationPath = join(
    __dirname,
    "..",
    "supabase",
    "migrations",
    "20250203_micro_steps.sql",
  );

  const sql = readFileSync(migrationPath, "utf-8");

  try {
    // Supabase client doesn't support raw SQL execution directly
    // We need to execute each statement separately
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);

      // Use the generic RPC call for raw SQL
      const { error } = await supabase.rpc("exec_sql", {
        sql_string: statement + ";",
      });

      if (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        console.error("Statement:", statement.substring(0, 100) + "...");
        process.exit(1);
      }

      console.log(`✅ Statement ${i + 1} executed successfully\n`);
    }

    console.log("🎉 Migration applied successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

applyMigration();
