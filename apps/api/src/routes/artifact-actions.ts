import { Router } from "express";
import { supabase } from "../db";
import type { ArtifactAnalysis } from "../services/llm-artifact-analyzer";

const router = Router();

/**
 * POST /api/artifact-actions/apply-analysis/:artifactId
 * Apply LLM analysis results to adjust project roadmap
 */
router.post("/apply-analysis/:artifactId", async (req, res) => {
  try {
    const { artifactId } = req.params;

    console.log(
      `📋 [Artifact Actions] Applying analysis for artifact: ${artifactId}`,
    );

    // Get artifact with analysis
    const { data: artifact, error: artifactError } = await supabase
      .from("artifacts")
      .select("*")
      .eq("id", artifactId)
      .single();

    if (artifactError || !artifact) {
      return res.status(404).json({
        error: {
          message: "Artifact not found",
          type: "invalid_request_error",
          param: "artifactId",
          code: "resource_not_found",
        },
      });
    }

    if (artifact.status !== "analyzed") {
      return res.status(400).json({
        error: {
          message: `Artifact not analyzed yet. Current status: ${artifact.status}`,
          type: "invalid_request_error",
          param: "artifactId",
          code: "artifact_not_analyzed",
        },
      });
    }

    const analysis = artifact.analysis as ArtifactAnalysis;
    if (!analysis) {
      return res.status(400).json({
        error: {
          message: "No analysis found for artifact",
          type: "invalid_request_error",
          param: "artifactId",
          code: "analysis_missing",
        },
      });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", artifact.project_id)
      .single();

    if (projectError || !project) {
      return res.status(404).json({
        error: {
          message: "Project not found",
          type: "invalid_request_error",
          param: "project_id",
          code: "resource_not_found",
        },
      });
    }

    console.log(`📊 [Artifact Actions] Decision: ${analysis.decision}`);
    console.log(`📊 [Artifact Actions] Actual phase: ${analysis.actual_phase}`);

    // Apply roadmap adjustments based on decision type
    const currentRoadmap = (project.roadmap as any) || {};
    const completedPhases = (project.completed_phases as string[]) || [];
    const completedSubsteps = (project.completed_substeps as string[]) || [];

    for (const adjustment of analysis.roadmap_adjustments) {
      const { phase_id, action, details } = adjustment;

      console.log(`   ⚙️ Applying: ${action} on ${phase_id} - ${details}`);

      switch (action) {
        case "complete":
          if (!completedPhases.includes(phase_id)) {
            completedPhases.push(phase_id);
          }
          break;

        case "unlock":
          // Phase unlocking is handled by removing from locked list
          break;

        case "add_substep":
          // Add new substep to roadmap
          if (currentRoadmap.phases) {
            const phase = currentRoadmap.phases.find(
              (p: any) => p.phase_id === phase_id,
            );
            if (phase && phase.substeps) {
              const newSubstep = {
                substep_id: `${phase_id}_substep_${phase.substeps.length + 1}`,
                step_number: phase.substeps.length + 1,
                label: details,
                prompt_to_send: details,
                completed: false,
              };
              phase.substeps.push(newSubstep);
            }
          }
          break;

        case "update_substep":
          // Update existing substep
          if (currentRoadmap.phases) {
            const phase = currentRoadmap.phases.find(
              (p: any) => p.phase_id === phase_id,
            );
            if (phase && phase.substeps && phase.substeps.length > 0) {
              const lastSubstep = phase.substeps[phase.substeps.length - 1];
              lastSubstep.label = details;
              lastSubstep.prompt_to_send = details;
            }
          }
          break;
      }
    }

    // Determine new current phase based on analysis
    const phaseNumberMap: Record<string, number> = {
      P0: 0,
      P1: 1,
      P2: 2,
      P3: 3,
      P4: 4,
      P5: 5,
      P6: 6,
      P7: 7,
    };

    const newCurrentPhase =
      phaseNumberMap[analysis.actual_phase] || project.current_phase;

    // Update project with adjusted roadmap
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        roadmap: currentRoadmap,
        completed_phases: completedPhases,
        completed_substeps: completedSubsteps,
        current_phase: newCurrentPhase,
      })
      .eq("id", project.id);

    if (updateError) {
      console.error("❌ [Artifact Actions] Update error:", updateError);
      return res.status(500).json({
        error: {
          message: "Failed to update project",
          type: "internal_server_error",
          code: "project_update_failed",
        },
      });
    }

    console.log("✅ [Artifact Actions] Roadmap adjusted successfully");

    return res.json({
      id: artifactId,
      object: "artifact.analysis_applied",
      decision: analysis.decision,
      actual_phase: analysis.actual_phase,
      adjustments_applied: analysis.roadmap_adjustments.length,
      next_steps: analysis.next_steps,
      quality_score: analysis.quality_score,
      missing_elements: analysis.missing_elements,
      bugs_or_errors: analysis.bugs_or_errors,
    });
  } catch (error) {
    console.error("❌ [Artifact Actions] Error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to apply analysis",
        type: "internal_server_error",
        code: "analysis_application_failed",
      },
    });
  }
});

/**
 * GET /api/artifact-actions/status/:artifactId
 * Check artifact analysis status
 */
router.get("/status/:artifactId", async (req, res) => {
  try {
    const { artifactId } = req.params;

    const { data: artifact, error } = await supabase
      .from("artifacts")
      .select("id, status, analyzed_at, analysis, error_message")
      .eq("id", artifactId)
      .single();

    if (error || !artifact) {
      return res.status(404).json({
        error: {
          message: "Artifact not found",
          type: "invalid_request_error",
          param: "artifactId",
          code: "resource_not_found",
        },
      });
    }

    return res.json({
      id: artifact.id,
      object: "artifact.status",
      status: artifact.status,
      analyzed_at: artifact.analyzed_at,
      has_analysis: !!artifact.analysis,
      error_message: artifact.error_message,
      analysis: artifact.analysis,
    });
  } catch (error) {
    console.error("❌ [Artifact Actions] Status check error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to check status",
        type: "internal_server_error",
        code: "status_check_failed",
      },
    });
  }
});

export default router;
