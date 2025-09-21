import { Router } from "express";
import { StepOrchestrator } from "../engine/orchestrator";

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

    const project = await orchestrator.createProject(goal.trim());

    return res.status(201).json({
      ok: true,
      project,
    });
  } catch (error) {
    console.error("Error creating project:", error);
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

    const project = orchestrator.getProject(projectId);

    if (!project) {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    return res.json({
      ok: true,
      project,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    return res.status(500).json({
      error: "Failed to fetch project",
    });
  }
});

// GET /api/projects - Get all projects
router.get("/", async (_req, res) => {
  try {
    const projects = orchestrator.getAllProjects();

    return res.json({
      ok: true,
      projects,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return res.status(500).json({
      error: "Failed to fetch projects",
    });
  }
});


// POST /api/projects/:projectId/expand - Expand phase with master prompt
router.post("/:projectId/expand", async (req, res) => {
  try {
    console.log("🎯 [API] Phase expansion request for project:", req.params.projectId);
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

    const project = orchestrator.getProject(projectId);
    if (!project) {
      console.error("❌ [API] Project not found:", projectId);
      return res.status(404).json({
        error: "Project not found",
      });
    }

    console.log("📋 [API] Project has", project.phases?.length || 0, "phases");

    const detectedPhaseId = orchestrator.detectMasterPrompt(thinking_input, project.phases);

    if (detectedPhaseId) {
      console.log("✅ [API] Master prompt detected, expanding phase:", detectedPhaseId);
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
        message: "No master prompt detected - treating as general clarification",
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
