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
    const { completed_step_number, user_feedback, context_update } = req.body;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({
        error: "Valid project ID is required",
      });
    }

    if (
      typeof completed_step_number !== "number" ||
      completed_step_number < 1
    ) {
      return res.status(400).json({
        error: "Valid completed_step_number is required",
      });
    }

    const result = await orchestrator.advanceProject(projectId, {
      completed_step_number,
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

export default router;
