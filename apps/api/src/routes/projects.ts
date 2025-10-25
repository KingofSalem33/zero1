import { Router } from "express";
import { StepOrchestrator } from "../engine/orchestrator";
import { supabase, withRetry, DatabaseError } from "../db";
import { aiLimiter } from "../middleware/rateLimit";
import { generateSubstepBriefing } from "../services/celebrationBriefing";

const router = Router();
export const orchestrator = new StepOrchestrator();

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
          current_phase: "P0",
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
      .createProjectWithId(supabaseProject.id, goal.trim())
      .then(async (project) => {
        console.log("[Projects] Step 2 complete. Roadmap generated.");

        // Update Supabase with the full roadmap (with retry logic)
        try {
          await withRetry(async () => {
            const result = await supabase
              .from("projects")
              .update({
                current_phase: project.current_phase || "P0",
                roadmap: project.phases || {},
              })
              .eq("id", supabaseProject.id)
              .select()
              .single();
            return result;
          });
          console.log("[Projects] Roadmap persisted to Supabase");
        } catch (err) {
          console.error("[Projects] Error persisting roadmap:", err);
        }
      })
      .catch((err) => {
        console.error("[Projects] Error generating roadmap:", err);
      });

    console.log("[Projects] Created with UUID:", supabaseProject.id);

    // Return immediately with basic project info
    return res.status(201).json({
      ok: true,
      project: {
        id: supabaseProject.id,
        goal: goal.trim(),
        status: "active",
        current_phase: 1,
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

    // Use ProjectStateManager to atomically update state
    const newState = await orchestrator.stateManager.applyProjectUpdate(
      projectId,
      {
        completeSubstep: {
          phase: phase_id,
          substep: substep_number,
        },
        advanceSubstep: true,
      },
    );

    console.log(
      `✅ [Projects] Manual completion: ${phase_id}/${substep_number} → ${newState.current_phase}/${newState.current_substep}`,
    );

    // Get next substep for briefing
    const nextSubstep = orchestrator.stateManager.getCurrentSubstep(newState);

    // Generate briefing if there's a next substep
    let briefingMessage = null;
    if (nextSubstep) {
      briefingMessage = await generateSubstepBriefing(
        project,
        newState,
        nextSubstep,
        completedSubstep,
      );

      console.log(
        `🎯 [Projects] Briefing generated for next: ${nextSubstep.label}`,
      );

      // Store briefing in thread for user to see
      if (project.thread_id) {
        await supabase.from("messages").insert({
          thread_id: project.thread_id,
          role: "assistant",
          content: briefingMessage,
          created_at: new Date().toISOString(),
        });
      }
    } else {
      console.log("🏁 [Projects] Phase or project complete");
    }

    return res.json({
      ok: true,
      project: {
        current_phase: newState.current_phase,
        current_substep: newState.current_substep,
      },
      briefing: briefingMessage,
      completed: {
        phase: phase_id,
        substep: substep_number,
        label: completedSubstep.label,
      },
      next: nextSubstep
        ? {
            phase: newState.current_phase,
            substep: newState.current_substep,
            label: nextSubstep.label,
          }
        : null,
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

export default router;
