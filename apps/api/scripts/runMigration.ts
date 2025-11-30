/**
 * Run SQL migration on Supabase
 *
 * Usage: npx ts-node scripts/runMigration.ts migrations/001_create_bible_schema.sql
 */

import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../src/env";

async function runMigration(sqlFile: string) {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_KEY) {
    console.error("✗ Missing Supabase credentials");
    console.error("  Please set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env");
    process.exit(1);
  }

  // Use service key for admin operations
  const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`\n📄 Running migration: ${path.basename(sqlFile)}`);
  console.log("=".repeat(60));

  // Read SQL file
  const sql = await fs.readFile(sqlFile, "utf-8");
  console.log(`✓ Loaded SQL (${sql.length} chars)`);

  // Split into individual statements (separated by semicolons)
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  console.log(`✓ Found ${statements.length} SQL statements\n`);

  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ";";

    // Skip comments
    if (statement.startsWith("COMMENT")) {
      console.log(`[${i + 1}/${statements.length}] Skipping COMMENT statement`);
      continue;
    }

    console.log(`[${i + 1}/${statements.length}] Executing...`);

    const { error } = await supabase.rpc("exec_sql", { sql_query: statement });

    if (error) {
      // Try alternative: use Postgres connection directly via REST API
      console.log(`  Trying alternative method...`);

      try {
        // eslint-disable-next-line no-undef
        const response = await fetch(`${ENV.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": ENV.SUPABASE_SERVICE_KEY,
            "Authorization": `Bearer ${ENV.SUPABASE_SERVICE_KEY}`,
          },
          body: JSON.stringify({ sql_query: statement }),
        });

        if (!response.ok) {
          console.error(`  ✗ Failed:`, await response.text());
          console.error(`  Statement: ${statement.substring(0, 100)}...`);
        } else {
          console.log(`  ✓ Success`);
        }
      } catch (fetchError) {
        console.error(`  ✗ Alternative method failed:`, fetchError);
        console.error(`  Statement: ${statement.substring(0, 100)}...`);
      }
    } else {
      console.log(`  ✓ Success`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Migration completed");
  console.log("=".repeat(60));
}

// Get SQL file from command line
const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error("Usage: npx ts-node scripts/runMigration.ts <sql-file>");
  process.exit(1);
}

const fullPath = path.isAbsolute(sqlFile)
  ? sqlFile
  : path.join(process.cwd(), sqlFile);

runMigration(fullPath).catch((error) => {
  console.error("\n✗ Migration failed:", error);
  process.exit(1);
});
