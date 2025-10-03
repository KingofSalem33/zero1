import { Router } from "express";
import { supabase } from "../db";
import * as crypto from "crypto";

const router = Router();

/**
 * Generate a hash of the project state for change detection
 */
function generateStateHash(projectState: any): string {
  const stateString = JSON.stringify({
    current_phase: projectState.current_phase,
    completed_substeps: projectState.completed_substeps,
    roadmap: projectState.roadmap,
  });
  return crypto.createHash("sha256").update(stateString).digest("hex");
}

/**
 * POST /api/checkpoints
 * Create a manual checkpoint for a project
 */
router.post("/", async (req, res) => {
  try {
    const { project_id, name, reason } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: "project_id is required" });
    }

    if (!name || name.length < 3) {
      return res.status(400).json({
        error: "name is required and must be at least 3 characters",
      });
    }

    console.log(`💾 [Checkpoints] Creating checkpoint for project: ${project_id}`);

    // Get current project state
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Get all artifacts for this project
    const { data: artifacts } = await supabase
      .from("artifacts")
      .select("id")
      .eq("project_id", project_id);

    const artifactIds = artifacts ? artifacts.map((a) => a.id) : [];

    // Generate state hash
    const stateHash = generateStateHash(project);

    // Create checkpoint
    const { data: checkpoint, error: checkpointError } = await supabase
      .from("checkpoints")
      .insert({
        project_id,
        name,
        reason: reason || "Manual checkpoint",
        created_by: "user",
        current_phase: project.current_phase,
        completed_substeps: project.completed_substeps,
        roadmap_snapshot: project.roadmap,
        project_state_hash: stateHash,
        artifact_ids: artifactIds,
      })
      .select()
      .single();

    if (checkpointError) {
      console.error("❌ [Checkpoints] Create error:", checkpointError);
      return res.status(500).json({ error: "Failed to create checkpoint" });
    }

    console.log("✅ [Checkpoints] Checkpoint created:", checkpoint.id);

    return res.json({
      ok: true,
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        created_at: checkpoint.created_at,
        current_phase: checkpoint.current_phase,
        artifact_count: artifactIds.length,
      },
    });
  } catch (error) {
    console.error("❌ [Checkpoints] Error:", error);
    return res.status(500).json({ error: "Failed to create checkpoint" });
  }
});

/**
 * GET /api/checkpoints/project/:projectId
 * Get all checkpoints for a project
 */
router.get("/project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: checkpoints, error } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ [Checkpoints] Fetch error:", error);
      return res.status(500).json({ error: "Failed to fetch checkpoints" });
    }

    return res.json({
      ok: true,
      checkpoints: checkpoints || [],
    });
  } catch (error) {
    console.error("❌ [Checkpoints] Error:", error);
    return res.status(500).json({ error: "Failed to fetch checkpoints" });
  }
});

/**
 * POST /api/checkpoints/:checkpointId/restore
 * Restore project to a checkpoint state
 */
router.post("/:checkpointId/restore", async (req, res) => {
  try {
    const { checkpointId } = req.params;

    console.log(`♻️ [Checkpoints] Restoring checkpoint: ${checkpointId}`);

    // Get checkpoint
    const { data: checkpoint, error: checkpointError } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("id", checkpointId)
      .single();

    if (checkpointError || !checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", checkpoint.project_id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Create a "before restore" checkpoint automatically
    const beforeRestoreHash = generateStateHash({
      current_phase: checkpoint.current_phase,
      completed_substeps: checkpoint.completed_substeps,
      roadmap: checkpoint.roadmap_snapshot,
    });

    await supabase.from("checkpoints").insert({
      project_id: checkpoint.project_id,
      name: `Before restore to: ${checkpoint.name}`,
      reason: "Automatic backup before restore",
      created_by: "system",
      current_phase: checkpoint.current_phase,
      completed_substeps: checkpoint.completed_substeps,
      roadmap_snapshot: checkpoint.roadmap_snapshot,
      project_state_hash: beforeRestoreHash,
      artifact_ids: checkpoint.artifact_ids,
    });

    // Restore project state from checkpoint
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        current_phase: checkpoint.current_phase,
        completed_substeps: checkpoint.completed_substeps,
        roadmap: checkpoint.roadmap_snapshot,
      })
      .eq("id", checkpoint.project_id);

    if (updateError) {
      console.error("❌ [Checkpoints] Restore error:", updateError);
      return res.status(500).json({ error: "Failed to restore checkpoint" });
    }

    console.log("✅ [Checkpoints] Project restored to checkpoint");

    return res.json({
      ok: true,
      message: "Project restored successfully",
      restored_to: {
        checkpoint_name: checkpoint.name,
        current_phase: checkpoint.current_phase,
        created_at: checkpoint.created_at,
      },
    });
  } catch (error) {
    console.error("❌ [Checkpoints] Restore error:", error);
    return res.status(500).json({ error: "Failed to restore checkpoint" });
  }
});

/**
 * GET /api/checkpoints/:checkpointId/compare/:otherCheckpointId
 * Compare two checkpoints to show differences
 */
router.get("/:checkpointId/compare/:otherCheckpointId", async (req, res) => {
  try {
    const { checkpointId, otherCheckpointId } = req.params;

    // Get both checkpoints
    const { data: checkpoint1 } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("id", checkpointId)
      .single();

    const { data: checkpoint2 } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("id", otherCheckpointId)
      .single();

    if (!checkpoint1 || !checkpoint2) {
      return res.status(404).json({ error: "One or both checkpoints not found" });
    }

    // Compare states
    const comparison = {
      phase_changed: checkpoint1.current_phase !== checkpoint2.current_phase,
      phase_diff: {
        from: checkpoint1.current_phase,
        to: checkpoint2.current_phase,
      },
      substeps_changed:
        JSON.stringify(checkpoint1.completed_substeps) !==
        JSON.stringify(checkpoint2.completed_substeps),
      substeps_added: (checkpoint2.completed_substeps as string[]).filter(
        (s) => !(checkpoint1.completed_substeps as string[]).includes(s)
      ),
      substeps_removed: (checkpoint1.completed_substeps as string[]).filter(
        (s) => !(checkpoint2.completed_substeps as string[]).includes(s)
      ),
      roadmap_changed:
        JSON.stringify(checkpoint1.roadmap_snapshot) !==
        JSON.stringify(checkpoint2.roadmap_snapshot),
      time_diff_hours:
        (new Date(checkpoint2.created_at).getTime() -
          new Date(checkpoint1.created_at).getTime()) /
        (1000 * 60 * 60),
    };

    return res.json({
      ok: true,
      checkpoint1: {
        id: checkpoint1.id,
        name: checkpoint1.name,
        created_at: checkpoint1.created_at,
      },
      checkpoint2: {
        id: checkpoint2.id,
        name: checkpoint2.name,
        created_at: checkpoint2.created_at,
      },
      comparison,
    });
  } catch (error) {
    console.error("❌ [Checkpoints] Compare error:", error);
    return res.status(500).json({ error: "Failed to compare checkpoints" });
  }
});

/**
 * DELETE /api/checkpoints/:checkpointId
 * Delete a checkpoint
 */
router.delete("/:checkpointId", async (req, res) => {
  try {
    const { checkpointId } = req.params;

    console.log(`🗑️ [Checkpoints] Deleting checkpoint: ${checkpointId}`);

    // Check if checkpoint exists and is not system-generated
    const { data: checkpoint } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("id", checkpointId)
      .single();

    if (!checkpoint) {
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    // Prevent deletion of system checkpoints (phase completions)
    if (
      checkpoint.created_by === "system" &&
      checkpoint.name.includes("Phase") &&
      checkpoint.name.includes("Complete")
    ) {
      return res.status(403).json({
        error: "Cannot delete automatic phase completion checkpoints",
      });
    }

    const { error: deleteError } = await supabase
      .from("checkpoints")
      .delete()
      .eq("id", checkpointId);

    if (deleteError) {
      console.error("❌ [Checkpoints] Delete error:", deleteError);
      return res.status(500).json({ error: "Failed to delete checkpoint" });
    }

    console.log("✅ [Checkpoints] Checkpoint deleted");

    return res.json({
      ok: true,
      message: "Checkpoint deleted successfully",
    });
  } catch (error) {
    console.error("❌ [Checkpoints] Delete error:", error);
    return res.status(500).json({ error: "Failed to delete checkpoint" });
  }
});

export default router;
