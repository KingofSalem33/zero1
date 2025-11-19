import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function applyMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("🔄 Applying step summary migration...\n");

  try {
    // Run the migration SQL
    const { error } = await supabase.rpc("exec_sql", {
      sql: `
        ALTER TABLE roadmap_steps
          ADD COLUMN IF NOT EXISTS completion_summary TEXT;

        COMMENT ON COLUMN roadmap_steps.completion_summary IS 'AI-generated 2-3 sentence summary of what was accomplished in this step';
      `,
    });

    if (error) {
      console.error("❌ Migration failed:", error);

      // Try alternative approach using raw SQL
      console.log("\n🔄 Trying alternative approach...\n");

      const { error: altError } = await supabase
        .from("roadmap_steps")
        .select("completion_summary")
        .limit(1);

      if (
        altError &&
        altError.message.includes("column") &&
        altError.message.includes("does not exist")
      ) {
        console.log(
          "❌ Column doesn't exist. Please run the SQL manually in Supabase dashboard:",
        );
        console.log("\n---SQL TO RUN---");
        console.log("ALTER TABLE roadmap_steps");
        console.log("  ADD COLUMN IF NOT EXISTS completion_summary TEXT;");
        console.log(
          "\nCOMMENT ON COLUMN roadmap_steps.completion_summary IS 'AI-generated 2-3 sentence summary of what was accomplished in this step';",
        );
        console.log("---END SQL---\n");
        process.exit(1);
      } else if (!altError) {
        console.log("✅ Column already exists! Migration not needed.");
      } else {
        console.error("❌ Unexpected error:", altError);
        process.exit(1);
      }
    } else {
      console.log("✅ Migration applied successfully!");
      console.log(
        "📝 Added 'completion_summary' column to roadmap_steps table",
      );
    }
  } catch (err) {
    console.error("❌ Error:", err);
    console.log("\n📋 Manual migration required:");
    console.log("\nRun this SQL in your Supabase dashboard:");
    console.log("\n---SQL TO RUN---");
    console.log("ALTER TABLE roadmap_steps");
    console.log("  ADD COLUMN IF NOT EXISTS completion_summary TEXT;");
    console.log(
      "\nCOMMENT ON COLUMN roadmap_steps.completion_summary IS 'AI-generated 2-3 sentence summary of what was accomplished in this step';",
    );
    console.log("---END SQL---\n");
    process.exit(1);
  }
}

applyMigration();
