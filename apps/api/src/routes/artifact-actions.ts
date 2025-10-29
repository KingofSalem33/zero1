import { Router } from "express";
import { supabase } from "../db";
import type { ArtifactAnalysis } from "../services/llm-artifact-analyzer";
import { detectIterationChanges } from "../services/llm-artifact-analyzer";

const router = Router();

/**
 * POST /api/artifact-actions/apply-analysis/:artifactId
 * Apply LLM analysis results to adjust project roadmap
 */
router.post("/apply-analysis/:artifactId", async (req, res) => {
  try {
    const { artifactId } = req.params;

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

    // Apply roadmap adjustments based on decision
    const currentRoadmap = (project.roadmap as any) || {};
    const completedPhases = (project.completed_phases as string[]) || [];
    const completedSubsteps = (project.completed_substeps as string[]) || [];

    for (const adjustment of analysis.roadmap_adjustments || []) {
      const { phase_id, action, details } = adjustment as any;

      switch (action) {
        case "complete":
          if (!completedPhases.includes(phase_id)) {
            completedPhases.push(phase_id);
          }
          break;
        case "unlock":
          // no-op for now
          break;
        case "add_substep": {
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
        }
        case "update_substep": {
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
    }

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
      phaseNumberMap[(analysis as any).actual_phase] || project.current_phase;

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
      return res.status(500).json({
        error: {
          message: "Failed to update project",
          type: "internal_server_error",
          code: "project_update_failed",
        },
      });
    }

    return res.json({
      id: artifactId,
      object: "artifact.analysis_applied",
      decision: (analysis as any).decision,
      actual_phase: (analysis as any).actual_phase,
      adjustments_applied: (analysis as any).roadmap_adjustments?.length || 0,
      next_steps: (analysis as any).next_steps,
      quality_score: (analysis as any).quality_score,
      missing_elements: (analysis as any).missing_elements,
      bugs_or_errors: (analysis as any).bugs_or_errors,
    });
  } catch {
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
  } catch {
    return res.status(500).json({
      error: {
        message: "Failed to check status",
        type: "internal_server_error",
        code: "status_check_failed",
      },
    });
  }
});

/**
 * GET /api/artifact-actions/timeline/:projectId
 * Aggregate prior analyzed artifacts into an iteration timeline
 */
router.get("/timeline/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: artifacts, error } = await supabase
      .from("artifacts")
      .select(
        `
        id,
        project_id,
        type,
        file_name,
        repo_url,
        analyzed_at,
        status,
        analysis,
        completed_substeps,
        progress_percentage,
        artifact_signals (*)
      `,
      )
      .eq("project_id", projectId)
      .eq("status", "analyzed")
      .order("analyzed_at", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch artifacts" });
    }

    const items: any[] = [];
    let prevSignals: any | null = null;
    let prevAnalysis: any | null = null;

    (artifacts || []).forEach((a: any, idx: number) => {
      const signals = Array.isArray(a.artifact_signals)
        ? a.artifact_signals[0]
        : a.artifact_signals;
      const analysis = a.analysis as ArtifactAnalysis | null;

      let changed_summary = "";
      try {
        if (prevSignals) {
          const diff = detectIterationChanges(
            prevAnalysis as any,
            prevSignals as any,
            signals,
          );
          const bullets: string[] = [];
          if (diff.content_hash_changed) bullets.push("Content changed");
          if (diff.improvements_made.length)
            bullets.push(`Improvements: ${diff.improvements_made.join(", ")}`);
          if (diff.issues_fixed.length)
            bullets.push(`Fixes: ${diff.issues_fixed.join(", ")}`);
          if (diff.new_issues.length)
            bullets.push(`New issues: ${diff.new_issues.join(", ")}`);
          if (!bullets.length && diff.changes_detected.length)
            bullets.push(diff.changes_detected.join("; "));
          changed_summary = bullets.join(" Â· ");
        } else {
          changed_summary = "Initial upload";
        }
      } catch {
        changed_summary = "Changes unknown";
      }

      const doneReq = analysis?.substep_requirements
        ?.filter((r) => r.status === "DONE")
        .map((r) => r.requirement);
      const partialReq = analysis?.substep_requirements
        ?.filter((r) => r.status === "PARTIAL")
        .map((r) => r.requirement);
      const missingReq = analysis?.substep_requirements
        ?.filter((r) => r.status === "NOT_STARTED")
        .map((r) => r.requirement);

      items.push({
        iteration_number: idx + 1,
        artifact_id: a.id,
        analyzed_at: a.analyzed_at,
        name: a.file_name || a.repo_url || a.type || "artifact",
        artifact_type: signals?.artifact_type || a.type || "artifact",
        content_hash: signals?.content_hash || null,
        changed_summary,
        quality_score: (analysis as any)?.quality_score ?? null,
        completion_percentage:
          (analysis as any)?.substep_completion_percentage ??
          a.progress_percentage ??
          null,
        done_requirements: doneReq || [],
        partial_requirements: partialReq || [],
        missing_requirements: missingReq || [],
        completed_substeps: a.completed_substeps || [],
      });

      prevSignals = signals || null;
      prevAnalysis = analysis || null;
    });

    return res.json({ project_id: projectId, count: items.length, items });
  } catch {
    return res.status(500).json({ error: "Failed to build timeline" });
  }
});

export default router;
