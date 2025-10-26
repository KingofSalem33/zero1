import { Router } from "express";
import type { Response } from "express";
import { StepOrchestrator } from "../engine/orchestrator";
import { supabase, withRetry, DatabaseError } from "../db";
import { aiLimiter } from "../middleware/rateLimit";
import { streamingService } from "../infrastructure/ai/StreamingService";

const router = Router();
export const orchestrator = new StepOrchestrator();

// Map to store active SSE connections for roadmap generation
const projectStreamResponses = new Map<string, Response>();

// POST /api/projects - Create a new project
router.post("/", async (req, res) => {
  try {
    const { goal } = req.body;

    if (!goal || typeof goal !== "string" || goal.trim().length < 5) {
      return res.status(400).json({
        error: "Goal is required and must be at least 5 characters long",
      });
    }

    if (goal.length > 500) {
      return res.status(400).json({
        error: "Goal must be 500 characters or less",
      });
    }

    console.log("[Projects] Creating project with goal:", goal.trim());

    // First create in Supabase to get a UUID (with retry logic)
    console.log("[Projects] Step 1: Inserting into Supabase...");
    const supabaseProject = await withRetry(async () => {
      const result = await supabase
        .from("projects")
        .insert({
          goal: goal.trim(),
          status: "active",
          current_phase: "P1", // Start at P1 (will have substeps)
          current_substep: 1,
          roadmap: {},
        })
        .select()
        .single();
      return result;
    });
    console.log("[Projects] Step 1 complete. Project ID:", supabaseProject.id);

    // Return immediately with project ID - roadmap will be generated asynchronously
    console.log(
      "[Projects] Step 2: Starting async roadmap generation (non-blocking)...",
    );

    // Start roadmap generation in background (don't await)
    orchestrator
      .createProjectWithId(supabaseProject.id, goal.trim(), (progress) => {
        // Send progress to SSE stream if connected
        const streamRes = projectStreamResponses.get(supabaseProject.id);
        console.log(
          `[Projects] Progress callback fired: type=${progress.type}, streamRes=${streamRes ? "CONNECTED" : "NOT CONNECTED"}`,
        );
        if (streamRes) {
          if (progress.type === "phase_generation") {
            streamingService.sendPhaseProgress(streamRes, {
              phase: progress.phase,
              total: progress.total,
              title: progress.title,
              phaseData: progress.phaseData, // Include the actual phase object
            });
          } else if (progress.type === "substep_expansion") {
            streamingService.sendSubstepExpansion(streamRes, {
              phase: progress.phase,
              substepCount: progress.total,
              phaseData: progress.phaseData, // Include expanded Phase 1 with substeps
              substeps: progress.substeps,
            });
          }
        } else {
          console.warn(
            `[Projects] ⚠️ SSE stream NOT connected for project ${supabaseProject.id} - events will not be sent!`,
          );
        }
      })
      .then(async (project) => {
        console.log("[Projects] Step 2 complete. Roadmap generated.");

        // Update Supabase with the full roadmap (with retry logic)
        try {
          // Ensure current_phase is in phase_id format (P1, P2, etc.)
          const currentPhaseId =
            typeof project.current_phase === "number"
              ? `P${project.current_phase}`
              : project.current_phase;

          await withRetry(async () => {
            const result = await supabase
              .from("projects")
              .update({
                current_phase: currentPhaseId || "P1",
                current_substep: project.current_substep || 1,
                roadmap: {
                  phases: project.phases || [],
                },
              })
              .eq("id", supabaseProject.id)
              .select()
              .single();
            return result;
          });
          console.log(
            `[Projects] Roadmap persisted to Supabase (current_phase: ${currentPhaseId})`,
          );

          // Clear the cache so the next GET request fetches fresh data
          orchestrator.clearProjectCache(supabaseProject.id);
          console.log(
            "[Projects] Cache cleared for project:",
            supabaseProject.id,
          );

          // Send completion event to SSE stream
          const streamRes = projectStreamResponses.get(supabaseProject.id);
          if (streamRes) {
            streamingService.sendRoadmapComplete(streamRes, {
              projectId: supabaseProject.id,
              phaseCount: project.phases?.length || 0,
            });
            // Close the stream after completion
            streamRes.end();
            projectStreamResponses.delete(supabaseProject.id);
          }
        } catch (err) {
          console.error("[Projects] Error persisting roadmap:", err);

          // Send error event to SSE stream
          const streamRes = projectStreamResponses.get(supabaseProject.id);
          if (streamRes) {
            streamingService.sendRoadmapError(streamRes, {
              message: "Failed to persist roadmap",
            });
            streamRes.end();
            projectStreamResponses.delete(supabaseProject.id);
          }
        }
      })
      .catch((err) => {
        console.error("[Projects] Error generating roadmap:", err);

        // Send error event to SSE stream
        const streamRes = projectStreamResponses.get(supabaseProject.id);
        if (streamRes) {
          streamingService.sendRoadmapError(streamRes, {
            message: err.message || "Failed to generate roadmap",
          });
          streamRes.end();
          projectStreamResponses.delete(supabaseProject.id);
        }
      });

    console.log("[Projects] Created with UUID:", supabaseProject.id);

    // Return immediately with basic project info
    return res.status(201).json({
      ok: true,
      project: {
        id: supabaseProject.id,
        goal: goal.trim(),
        status: "active",
        current_phase: "P1", // Use phase_id format for consistency
        current_substep: 1,
        phases: [], // Will be populated async
        history: [],
        created_at: supabaseProject.created_at,
        updated_at: supabaseProject.created_at,
      },
      message: "Project created. Roadmap generating...",
    });
  } catch (error) {
    console.error("Error creating project:", error);

    if (error instanceof DatabaseError) {
      return res.status(503).json({
        error: "Database connection error. Please try again.",
        details: error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to create project",
    });
  }
});

// POST /api/projects/:projectId/complete-substep - Mark substep as complete
router.post("/:projectId/complete-substep", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { phase_id, substep_number } = req.body;

    console.log(
      `[Projects] Manual completion request: ${projectId} - ${phase_id}/${substep_number}`,
    );

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    if (!phase_id || typeof phase_id !== "string") {
      return res.status(400).json({
        error: "phase_id is required",
      });
    }

    if (typeof substep_number !== "number") {
      return res.status(400).json({
        error: "substep_number is required",
      });
    }

    // Get project
    const project = await orchestrator.getProjectAsync(projectId);
    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    // Get substep details for briefing
    // Check both project.roadmap.phases and project.phases for compatibility
    const phases =
      project.roadmap?.phases && project.roadmap.phases.length > 0
        ? project.roadmap.phases
        : project.phases || [];

    const completedPhase = phases.find((p: any) => p.phase_id === phase_id);
    const completedSubstep = completedPhase?.substeps?.find(
      (s: any) => s.step_number === substep_number,
    );

    if (!completedSubstep) {
      console.error(
        `[Projects] Substep not found: ${phase_id}/${substep_number}`,
      );
      console.error(
        `[Projects] Available phases:`,
        phases.map((p: any) => p.phase_id),
      );
      return res.status(404).json({
        error: "Substep not found",
      });
    }

    // Simple manual completion: mark complete, increment substep, save
    console.log(`[Projects] Manual completion: ${phase_id}/${substep_number}`);

    // Mark substep as complete in roadmap
    completedSubstep.completed = true;

    // Add to completed_substeps array
    const completedSubstepsArray = project.completed_substeps || [];
    const phaseNum = parseInt(phase_id.replace("P", ""));
    const completionRecord = {
      phase_number: phaseNum,
      substep_number,
      completed_at: new Date().toISOString(),
    };

    // Avoid duplicates
    if (
      !completedSubstepsArray.some(
        (cs: any) =>
          cs.phase_number === phaseNum && cs.substep_number === substep_number,
      )
    ) {
      completedSubstepsArray.push(completionRecord);
    }

    // Advance to next substep
    const nextSubstepNumber = substep_number + 1;
    const nextSubstep = completedPhase?.substeps?.find(
      (s: any) => s.step_number === nextSubstepNumber,
    );

    if (nextSubstep) {
      project.current_substep = nextSubstepNumber;
      console.log(`[Projects] Advanced to substep ${nextSubstepNumber}`);
    } else {
      console.log(`[Projects] No more substeps in ${phase_id}`);
    }

    // Update in-memory project object
    project.completed_substeps = completedSubstepsArray;

    // Save to Supabase
    await withRetry(async () => {
      const result = await supabase
        .from("projects")
        .update({
          current_substep: project.current_substep,
          roadmap: { phases: project.phases || project.roadmap?.phases },
          completed_substeps: completedSubstepsArray,
        })
        .eq("id", projectId)
        .select()
        .single();
      return result;
    });

    // Clear the cache so the next GET request fetches fresh data
    orchestrator.clearProjectCache(projectId);
    console.log("[Projects] Cache cleared for project:", projectId);

    console.log(
      `✅ [Projects] Completion saved: ${phase_id}/${substep_number} → current: ${project.current_phase}/${project.current_substep}`,
    );

    // Return simple confirmation
    return res.json({
      ok: true,
      completed: {
        phase: phase_id,
        substep: substep_number,
        label: completedSubstep.label,
      },
    });
  } catch (error) {
    console.error("Error completing substep:", error);

    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (error instanceof DatabaseError) {
      return res.status(503).json({
        error: "Database connection error. Please try again.",
        details: error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to complete substep",
    });
  }
});

// GET /api/projects/:projectId - Get a specific project
router.get("/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    // Get project from orchestrator (checks cache, then Supabase)
    const project = await orchestrator.getProjectAsync(projectId);

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    // Fetch completed_substeps from Supabase (with retry logic)
    let supabaseProject: any = null;
    try {
      supabaseProject = await withRetry(async () => {
        const result = await supabase
          .from("projects")
          .select("completed_substeps, current_substep")
          .eq("id", projectId)
          .single();
        return result;
      });
    } catch (err) {
      console.error("[Projects] Error fetching from Supabase:", err);
      // Continue without Supabase data if fetch fails
    }

    // Merge Supabase data with orchestrator project
    const mergedProject = {
      ...project,
      completed_substeps: supabaseProject?.completed_substeps || [],
      current_substep:
        supabaseProject?.current_substep || project.current_substep,
    };

    // Enrich substeps with completed status
    const completedSubsteps = mergedProject.completed_substeps || [];

    // Check both mergedProject.phases and mergedProject.roadmap.phases
    const phasesArray = mergedProject.phases || mergedProject.roadmap?.phases;

    if (phasesArray && Array.isArray(phasesArray)) {
      const enrichedPhases = phasesArray.map((phase: any) => ({
        ...phase,
        substeps: phase.substeps?.map((substep: any) => ({
          ...substep,
          completed: completedSubsteps.some(
            (cs: any) =>
              cs.phase_number === phase.phase_number &&
              cs.substep_number === substep.step_number,
          ),
        })),
      }));

      // Update both locations to be safe
      if (mergedProject.phases) {
        mergedProject.phases = enrichedPhases;
      }
      if (mergedProject.roadmap?.phases) {
        mergedProject.roadmap.phases = enrichedPhases;
      }
    }

    return res.json({
      ok: true,
      project: mergedProject,
    });
  } catch (error) {
    console.error("Error fetching project:", error);

    if (error instanceof DatabaseError) {
      return res.status(503).json({
        error: "Database connection error. Please try again.",
        details: error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to fetch project",
    });
  }
});

// GET /api/projects - Get all projects
router.get("/", async (_req, res) => {
  try {
    const projects = await orchestrator.getAllProjects();

    return res.json({
      ok: true,
      projects,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);

    if (error instanceof DatabaseError) {
      return res.status(503).json({
        error: "Database connection error. Please try again.",
        details: error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to fetch projects",
    });
  }
});

// POST /api/projects/:projectId/execute-step/stream - Execute step with streaming (AI rate limited)
router.post("/:projectId/execute-step/stream", aiLimiter, async (req, res) => {
  try {
    console.log(
      "🚀 [API] Streaming step execution request for project:",
      req.params.projectId,
    );

    const { projectId } = req.params;
    const { master_prompt, user_message } = req.body;

    if (!projectId || typeof projectId !== "string") {
      console.error("❌ [API] Invalid project ID:", projectId);
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    if (!master_prompt || typeof master_prompt !== "string") {
      console.error("❌ [API] Missing master prompt");
      return res.status(400).json({
        error: "Master prompt is required",
      });
    }

    const project = await orchestrator.getProjectAsync(projectId);
    if (!project) {
      console.error("❌ [API] Project not found:", projectId);
      return res.status(404).json({
        error: "Project not found",
      });
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Use streaming execution
    await orchestrator.executeStepStreaming({
      project_id: projectId,
      master_prompt,
      user_message,
      res,
    });

    console.log("✅ [API] Streaming step executed successfully");
    // Response already sent via streaming
    return;
  } catch (error) {
    console.error("❌ [API] Error executing streaming step:", error);
    res.write(`event: error\n`);
    res.write(
      `data: ${JSON.stringify({ error: "Failed to execute step" })}\n\n`,
    );
    res.end();
    return;
  }
});

// POST /api/projects/:projectId/execute-step - Execute step with AI guidance (AI rate limited)
router.post("/:projectId/execute-step", aiLimiter, async (req, res) => {
  try {
    console.log(
      "🚀 [API] Step execution request for project:",
      req.params.projectId,
    );

    const { projectId } = req.params;
    const { master_prompt, user_message } = req.body;

    if (!projectId || typeof projectId !== "string") {
      console.error("❌ [API] Invalid project ID:", projectId);
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    if (!master_prompt || typeof master_prompt !== "string") {
      console.error("❌ [API] Missing master prompt");
      return res.status(400).json({
        error: "Master prompt is required",
      });
    }

    const project = await orchestrator.getProjectAsync(projectId);
    if (!project) {
      console.error("❌ [API] Project not found:", projectId);
      return res.status(404).json({
        error: "Project not found",
      });
    }

    const result = await orchestrator.executeStep({
      project_id: projectId,
      master_prompt,
      user_message,
    });

    console.log("✅ [API] Step executed successfully");
    return res.json(result);
  } catch (error) {
    console.error("❌ [API] Error executing step:", error);

    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (error instanceof Error && error.message === "AI not configured") {
      return res.status(503).json({
        error: "AI service not available",
      });
    }

    return res.status(500).json({
      error: "Failed to execute step",
    });
  }
});

// POST /api/projects/:projectId/expand - Expand phase with master prompt (AI rate limited)
router.post("/:projectId/expand", aiLimiter, async (req, res) => {
  try {
    console.log(
      "🎯 [API] Phase expansion request for project:",
      req.params.projectId,
    );
    console.log("📝 [API] Input length:", req.body.thinking_input?.length || 0);

    const { projectId } = req.params;
    const { thinking_input } = req.body;

    if (!projectId || typeof projectId !== "string") {
      console.error("❌ [API] Invalid project ID:", projectId);
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    if (!thinking_input || typeof thinking_input !== "string") {
      console.error("❌ [API] Missing thinking input");
      return res.status(400).json({
        error: "Thinking input is required",
      });
    }

    const project = await orchestrator.getProjectAsync(projectId);
    if (!project) {
      console.error("❌ [API] Project not found:", projectId);
      return res.status(404).json({
        error: "Project not found",
      });
    }

    console.log("📋 [API] Project has", project.phases?.length || 0, "phases");

    const detectedPhaseId = orchestrator.detectMasterPrompt(
      thinking_input,
      project.phases,
    );

    if (detectedPhaseId) {
      console.log(
        "✅ [API] Master prompt detected, expanding phase:",
        detectedPhaseId,
      );
      const result = await orchestrator.expandPhase({
        project_id: projectId,
        phase_id: detectedPhaseId,
        master_prompt_input: thinking_input,
      });

      return res.json({
        ok: true,
        phase_expanded: true,
        ...result,
      });
    } else {
      console.log("❌ [API] No master prompt detected");
      return res.json({
        ok: true,
        phase_expanded: false,
        message:
          "No master prompt detected - treating as general clarification",
      });
    }
  } catch (error) {
    console.error("❌ [API] Error expanding phase:", error);
    return res.status(500).json({
      error: "Failed to expand phase",
    });
  }
});

// GET /api/projects/:projectId/threads - Get threads for a project
router.get("/:projectId/threads", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: {
          message: "Valid project ID is required",
          type: "invalid_request_error",
          param: "projectId",
          code: "missing_required_parameter",
        },
      });
    }

    const { threadService } = await import("../services/threadService.js");
    const threads = await threadService.listThreads(projectId);

    return res.json({
      object: "list",
      data: threads,
    });
  } catch (error) {
    console.error("Error fetching threads:", error);
    return res.status(500).json({
      error: {
        message: "Failed to fetch threads",
        type: "internal_server_error",
        code: "thread_fetch_failed",
      },
    });
  }
});

// GET /api/projects/:projectId/checkpoints - Get checkpoints for a project
router.get("/:projectId/checkpoints", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: {
          message: "Valid project ID is required",
          type: "invalid_request_error",
          param: "projectId",
          code: "missing_required_parameter",
        },
      });
    }

    const { data: checkpoints, error } = await supabase
      .from("checkpoints")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ [Projects] Checkpoint fetch error:", error);
      return res.status(500).json({
        error: {
          message: "Failed to fetch checkpoints",
          type: "internal_server_error",
          code: "checkpoint_fetch_failed",
        },
      });
    }

    return res.json({
      object: "list",
      data: checkpoints || [],
    });
  } catch (error) {
    console.error("Error fetching checkpoints:", error);
    return res.status(500).json({
      error: {
        message: "Failed to fetch checkpoints",
        type: "internal_server_error",
        code: "checkpoint_fetch_failed",
      },
    });
  }
});

// GET /api/projects/:projectId/artifacts - Get artifacts for a project
router.get("/:projectId/artifacts", async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: {
          message: "Valid project ID is required",
          type: "invalid_request_error",
          param: "projectId",
          code: "missing_required_parameter",
        },
      });
    }

    const { data: artifacts, error } = await supabase
      .from("artifacts")
      .select(
        `
        *,
        artifact_signals (*)
      `,
      )
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("❌ [Projects] Artifact fetch error:", error);
      return res.status(500).json({
        error: {
          message: "Failed to fetch artifacts",
          type: "internal_server_error",
          code: "artifact_fetch_failed",
        },
      });
    }

    return res.json({
      object: "list",
      data: artifacts || [],
    });
  } catch (error) {
    console.error("Error fetching artifacts:", error);
    return res.status(500).json({
      error: {
        message: "Failed to fetch artifacts",
        type: "internal_server_error",
        code: "artifact_fetch_failed",
      },
    });
  }
});

// GET /api/projects/stream/:projectId - Stream roadmap generation progress
router.get("/stream/:projectId", async (req, res) => {
  const { projectId } = req.params;

  console.log(
    `📡 [Projects] Starting SSE stream for roadmap generation: ${projectId}`,
  );

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send initial heartbeat
  res.write(`: heartbeat\n\n`);

  // Store the response object for this project
  projectStreamResponses.set(projectId, res);

  // Send start event
  res.write(`event: roadmap_start\n`);
  res.write(`data: ${JSON.stringify({ projectId })}\n\n`);

  // Clean up when client disconnects
  req.on("close", () => {
    console.log(
      `📡 [Projects] SSE connection closed for project: ${projectId}`,
    );
    projectStreamResponses.delete(projectId);
    res.end();
  });
});

export default router;
