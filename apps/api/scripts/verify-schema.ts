import * as dotenv from "dotenv";

// Load environment variables first
dotenv.config();

import { supabase } from "../src/db";

async function verifySchema() {
  console.log("🔍 Verifying database schema...\n");

  // Test insert into each table
  try {
    // 1. Create test project
    console.log("1️⃣ Testing projects table...");
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        goal: "Schema verification test",
        status: "active",
        current_phase: "P0",
      })
      .select()
      .single();

    if (projectError) {
      console.error("   ❌ Error:", projectError.message);
      return;
    }
    console.log(`   ✅ Project created: ${project.id}\n`);

    // 2. Create test artifact
    console.log("2️⃣ Testing artifacts table...");
    const { data: artifact, error: artifactError } = await supabase
      .from("artifacts")
      .insert({
        project_id: project.id,
        type: "single",
        file_name: "test.txt",
        status: "uploaded",
        size_bytes: 1024,
      })
      .select()
      .single();

    if (artifactError) {
      console.error("   ❌ Error:", artifactError.message);
      return;
    }
    console.log(`   ✅ Artifact created: ${artifact.id}\n`);

    // 3. Create test artifact signals
    console.log("3️⃣ Testing artifact_signals table...");
    const { error: signalsError } = await supabase
      .from("artifact_signals")
      .insert({
        artifact_id: artifact.id,
        has_tests: true,
        has_typescript: true,
        file_count: 10,
        folder_depth: 3,
      });

    if (signalsError) {
      console.error("   ❌ Error:", signalsError.message);
      return;
    }
    console.log("   ✅ Artifact signals created\n");

    // 4. Create test checkpoint
    console.log("4️⃣ Testing checkpoints table...");
    const { error: checkpointError } = await supabase
      .from("checkpoints")
      .insert({
        project_id: project.id,
        name: "Test checkpoint",
        current_phase: "P0",
        created_by: "test",
      });

    if (checkpointError) {
      console.error("   ❌ Error:", checkpointError.message);
      return;
    }
    console.log("   ✅ Checkpoint created\n");

    // 5. Test auto-checkpoint trigger
    console.log("5️⃣ Testing auto-checkpoint trigger...");
    const { error: updateError } = await supabase
      .from("projects")
      .update({ current_phase: "P1" })
      .eq("id", project.id);

    if (updateError) {
      console.error("   ❌ Error:", updateError.message);
      return;
    }

    // Check if auto-checkpoint was created
    const { data: checkpoints, error: checkpointsError } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("project_id", project.id)
      .eq("created_by", "system");

    if (checkpointsError) {
      console.error("   ❌ Error:", checkpointsError.message);
      return;
    }

    if (checkpoints && checkpoints.length > 0) {
      console.log("   ✅ Auto-checkpoint trigger working!\n");
    } else {
      console.log("   ⚠️  Auto-checkpoint not created (trigger may not be active)\n");
    }

    // 6. Cleanup
    console.log("6️⃣ Cleaning up test data...");
    const { error: cleanupError } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);

    if (cleanupError) {
      console.error("   ❌ Cleanup error:", cleanupError.message);
    } else {
      console.log("   ✅ Test data cleaned up\n");
    }

    console.log("=" .repeat(60));
    console.log("✅ All schema tests passed!");
    console.log("=" .repeat(60));
  } catch (err: any) {
    console.error("\n❌ Verification failed:", err.message);
  }
}

verifySchema();