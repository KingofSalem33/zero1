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

    res.status(201).json({
      ok: true,
      project,
    });
  } catch (error) {
    console.error("Error creating project:", error);
    res.status(500).json({
      error: "Failed to create project",
    });
  }
});

// POST /api/projects/:projectId/advance - Advance a project
router.post("/:projectId/advance", async (req, res) => {
  try {
    const { projectId } = req.params;
    const {
      step_number,
      substep_id,
      completed_step_number,
      completed_substep_id,
      user_feedback,
      context_update,
    } = req.body;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    // Check if either substep completion or step completion is provided
    const hasSubstepCompletion = substep_id || completed_substep_id;
    const hasStepCompletion = step_number || completed_step_number;

    if (!hasSubstepCompletion && !hasStepCompletion) {
      return res.status(400).json({
        error: "Either substep_id or step_number is required",
      });
    }

    // Validate step number if provided
    if (hasStepCompletion) {
      const stepNum = step_number || completed_step_number;
      if (typeof stepNum !== "number" || stepNum < 1) {
        return res.status(400).json({
          error: "Valid step_number is required",
        });
      }
    }

    // Validate substep ID if provided
    if (hasSubstepCompletion) {
      const substepId = substep_id || completed_substep_id;
      if (typeof substepId !== "string" || !substepId.trim()) {
        return res.status(400).json({
          error: "Valid substep_id is required",
        });
      }
    }

    const result = await orchestrator.advanceProject(projectId, {
      step_number: step_number || completed_step_number,
      substep_id: substep_id || completed_substep_id,
      completed_step_number, // backward compatibility
      completed_substep_id, // backward compatibility
      user_feedback,
      context_update,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("Error advancing project:", error);

    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    res.status(500).json({
      error: "Failed to advance project",
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

    res.json({
      ok: true,
      project,
    });
  } catch (error) {
    console.error("Error fetching project:", error);
    res.status(500).json({
      error: "Failed to fetch project",
    });
  }
});

// GET /api/projects - Get all projects
router.get("/", async (req, res) => {
  try {
    const projects = orchestrator.getAllProjects();

    res.json({
      ok: true,
      projects,
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    res.status(500).json({
      error: "Failed to fetch projects",
    });
  }
});

// POST /api/projects/:projectId/clarify - Handle clarification Q&A
router.post("/:projectId/clarify", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { user_response } = req.body;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    const result = await orchestrator.handleClarification({
      project_id: projectId,
      user_response,
    });

    res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("Error handling clarification:", error);

    if (error instanceof Error && error.message === "Project not found") {
      return res.status(404).json({
        error: "Project not found",
      });
    }

    res.status(500).json({
      error: "Failed to handle clarification",
    });
  }
});

export default router;
