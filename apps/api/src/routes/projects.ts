import { Router } from "express";
import { StepOrchestrator } from "../engine/orchestrator";
import { supabase, withRetry, DatabaseError } from "../db";
import { aiLimiter } from "../middleware/rateLimit";

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
    const { substep_id } = req.body;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    if (!substep_id || typeof substep_id !== "string") {
      return res.status(400).json({
        error: "Valid substep_id is required",
      });
    }

    const result = await orchestrator.completeSubstep({
      project_id: projectId,
      substep_id,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("Error completing substep:", error);

    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    if (error instanceof Error && error.message === "Substep not found") {
      return res.status(404).json({
        error: "Substep not found",
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

export default router;
