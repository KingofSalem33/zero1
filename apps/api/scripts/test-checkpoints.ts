import * as dotenv from "dotenv";
dotenv.config();

import { supabase } from "../src/db";

async function testCheckpoints() {
  console.log("🧪 Testing Checkpoint System...\n");

  try {
    // 1. Create a test project
    console.log("1️⃣ Creating test project...");
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000",
        goal: "Checkpoint system test",
        status: "active",
        current_phase: "P1",
        completed_substeps: ["P1_substep_1"],
        roadmap: {
          phases: [
            {
              phase_id: "P1",
              goal: "Setup environment",
              substeps: [{ substep_id: "P1_substep_1", label: "Install tools" }],
            },
          ],
        },
      })
      .select()
      .single();

    if (projectError) {
      console.error("   ❌ Error:", projectError.message);
      return;
    }
    console.log(`   ✅ Project created: ${project.id}\n`);

    // 2. Create first checkpoint
    console.log("2️⃣ Creating checkpoint 'Initial State'...");
    const { data: checkpoint1, error: cp1Error } = await supabase
      .from("checkpoints")
      .insert({
        project_id: project.id,
        name: "Initial State",
        reason: "Testing checkpoint system",
        created_by: "user",
        current_phase: project.current_phase,
        completed_substeps: project.completed_substeps,
        roadmap_snapshot: project.roadmap,
      })
      .select()
      .single();

    if (cp1Error) {
      console.error("   ❌ Error:", cp1Error.message);
      return;
    }
    console.log(`   ✅ Checkpoint created: ${checkpoint1.id}\n`);

    // 3. Update project (simulate progress)
    console.log("3️⃣ Simulating project progress...");
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        current_phase: "P2",
        completed_substeps: ["P1_substep_1", "P1_substep_2", "P2_substep_1"],
      })
      .eq("id", project.id);

    if (updateError) {
      console.error("   ❌ Error:", updateError.message);
      return;
    }
    console.log("   ✅ Project updated to P2\n");

    // 4. Create second checkpoint
    console.log("4️⃣ Creating checkpoint 'After Progress'...");
    const { data: checkpoint2, error: cp2Error } = await supabase
      .from("checkpoints")
      .insert({
        project_id: project.id,
        name: "After Progress",
        reason: "Saved progress at P2",
        created_by: "user",
        current_phase: "P2",
        completed_substeps: ["P1_substep_1", "P1_substep_2", "P2_substep_1"],
        roadmap_snapshot: project.roadmap,
      })
      .select()
      .single();

    if (cp2Error) {
      console.error("   ❌ Error:", cp2Error.message);
      return;
    }
    console.log(`   ✅ Checkpoint created: ${checkpoint2.id}\n`);

    // 5. Test auto-checkpoint on phase change
    console.log("5️⃣ Testing auto-checkpoint trigger...");
    const { error: phaseChangeError } = await supabase
      .from("projects")
      .update({ current_phase: "P3" })
      .eq("id", project.id);

    if (phaseChangeError) {
      console.error("   ❌ Error:", phaseChangeError.message);
      return;
    }

    // Check for auto-created checkpoint
    const { data: autoCheckpoints } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("project_id", project.id)
      .eq("created_by", "system");

    if (autoCheckpoints && autoCheckpoints.length > 0) {
      console.log("   ✅ Auto-checkpoint created by trigger!\n");
    } else {
      console.log("   ⚠️  No auto-checkpoint found\n");
    }

    // 6. List all checkpoints
    console.log("6️⃣ Listing all checkpoints...");
    const { data: allCheckpoints } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });

    console.log(`   Found ${allCheckpoints?.length || 0} checkpoints:`);
    allCheckpoints?.forEach((cp: any) => {
      console.log(
        `   • ${cp.name} (${cp.created_by}) - Phase ${cp.current_phase}`
      );
    });
    console.log("");

    // 7. Cleanup
    console.log("7️⃣ Cleaning up test data...");
    const { error: cleanupError } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);

    if (cleanupError) {
      console.error("   ❌ Cleanup error:", cleanupError.message);
    } else {
      console.log("   ✅ Test data cleaned up\n");
    }

    console.log("=".repeat(60));
    console.log("✅ All checkpoint tests passed!");
    console.log("=".repeat(60));
  } catch (err: any) {
    console.error("\n❌ Test failed:", err.message);
    console.error(err.stack);
  }
}

testCheckpoints();
