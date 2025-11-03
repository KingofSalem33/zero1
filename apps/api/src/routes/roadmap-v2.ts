/**
 * Dynamic Roadmap API Routes (V2)
 *
 * New API endpoints for LLM-driven, linear roadmap system.
 * Replaces static P0-P7 phase structure.
 */

import { Router, Request, Response } from "express";
import { supabase } from "../db";
import { RoadmapGenerationService } from "../domain/projects/services/RoadmapGenerationService";
import { StepCompletionService } from "../domain/projects/services/StepCompletionService";
import { randomUUID } from "crypto";
import { orchestrator } from "./projects";
import { aiLimiter } from "../middleware/rateLimit";

const router = Router();
const roadmapService = new RoadmapGenerationService();
const completionService = new StepCompletionService();

// Helper to check if a string is a valid UUID
function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// ============================================================================
// POST /api/v2/projects - Create project with dynamic roadmap
// ============================================================================
router.post("/projects", async (req: Request, res: Response) => {
  console.log("🚀 [Roadmap V2] POST /projects route hit!");
  try {
    const { vision, user_id, clarification_context, skill_level } = req.body;

    if (!vision) {
      return res.status(400).json({ error: "Vision is required" });
    }

    console.log("[Roadmap V2] Creating project with vision:", vision);

    // Generate dynamic roadmap
    const roadmapResponse = await roadmapService.generateRoadmap({
      vision,
      clarification_context,
      user_skill_level: skill_level || "beginner",
    });

    console.log(`[Roadmap V2] Generated ${roadmapResponse.total_steps} steps`);

    // Ensure user_id is a valid UUID
    let validUserId: string;
    if (user_id && isValidUUID(user_id)) {
      validUserId = user_id;
    } else {
      // Generate a new UUID if user_id is missing or invalid
      validUserId = randomUUID();
      if (user_id) {
        console.log(
          `[Roadmap V2] Invalid UUID "${user_id}", generated new UUID: ${validUserId}`,
        );
      }
    }

    // Create project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: validUserId,
        goal: vision,
        status: "active",
        current_step: 1,
        roadmap_status: "ready",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (projectError || !project) {
      console.error("[Roadmap V2] Error creating project:", projectError);
      return res.status(500).json({ error: "Failed to create project" });
    }

    // Create roadmap metadata
    const { error: metadataError } = await supabase
      .from("project_roadmap_metadata")
      .insert({
        project_id: project.id,
        total_steps: roadmapResponse.total_steps,
        current_step: 1,
        completion_percentage: 0,
        roadmap_version: 1,
        generated_by: roadmapResponse.generated_by,
        generation_prompt: vision,
        created_at: new Date().toISOString(),
      });

    if (metadataError) {
      console.error("[Roadmap V2] Error creating metadata:", metadataError);
      return res
        .status(500)
        .json({ error: "Failed to create roadmap metadata" });
    }

    // Insert roadmap steps
    const stepsToInsert = roadmapResponse.steps.map((step) => ({
      project_id: project.id,
      step_number: step.step_number,
      title: step.title,
      description: step.description,
      master_prompt: step.master_prompt,
      context: step.context,
      acceptance_criteria: step.acceptance_criteria,
      estimated_complexity: step.estimated_complexity,
      status: step.status,
      created_at: new Date().toISOString(),
    }));

    const { error: stepsError } = await supabase
      .from("roadmap_steps")
      .insert(stepsToInsert);

    if (stepsError) {
      console.error("[Roadmap V2] Error creating steps:", stepsError);
      return res.status(500).json({ error: "Failed to create roadmap steps" });
    }

    // Fetch complete project with steps
    const completeProject = await fetchProjectWithSteps(project.id);

    return res.status(201).json(completeProject);
  } catch (error) {
    console.error("[Roadmap V2] Error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// GET /api/v2/projects/:id - Get project with roadmap
// ============================================================================
router.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await fetchProjectWithSteps(id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    return res.json(project);
  } catch (error) {
    console.error("[Roadmap V2] Error fetching project:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// GET /api/v2/projects/:id/current-step - Get current step with context
// ============================================================================
router.get(
  "/projects/:id/current-step",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const project = await fetchProjectWithSteps(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const currentStep = project.steps.find(
        (s: any) => s.step_number === project.current_step,
      );

      if (!currentStep) {
        return res.status(404).json({ error: "Current step not found" });
      }

      return res.json({
        project_id: project.id,
        project_goal: project.goal,
        current_step: currentStep,
        progress: {
          current: project.current_step,
          total: project.metadata.total_steps,
          percentage: project.metadata.completion_percentage,
        },
        completed_steps: project.steps.filter(
          (s: any) => s.status === "completed",
        ).length,
        upcoming_steps: project.steps
          .filter((s: any) => s.step_number > project.current_step)
          .slice(0, 3)
          .map((s: any) => ({ step_number: s.step_number, title: s.title })),
      });
    } catch (error) {
      console.error("[Roadmap V2] Error fetching current step:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ============================================================================
// POST /api/v2/projects/:id/check-completion - Check if step is complete
// ============================================================================
router.post(
  "/projects/:id/check-completion",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { conversation, artifacts } = req.body;

      const project = await fetchProjectWithSteps(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const currentStep = project.steps.find(
        (s: any) => s.step_number === project.current_step,
      );

      if (!currentStep) {
        return res.status(404).json({ error: "Current step not found" });
      }

      // Analyze completion
      const suggestion = await completionService.analyzeCompletion({
        step: currentStep,
        conversation: conversation || [],
        artifacts,
      });

      // Store suggestion if completion is recommended
      if (suggestion.should_complete && suggestion.confidence_score >= 70) {
        await supabase.from("completion_suggestions").insert({
          project_id: id,
          step_id: currentStep.id,
          suggestion_type: artifacts ? "artifact_based" : "auto_detected",
          confidence_score: suggestion.confidence_score,
          reasoning: suggestion.reasoning,
          evidence: suggestion.evidence,
          created_at: new Date().toISOString(),
        });
      }

      return res.json(suggestion);
    } catch (error) {
      console.error("[Roadmap V2] Error checking completion:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ============================================================================
// POST /api/v2/projects/:id/complete-step - Mark current step complete
// ============================================================================
router.post(
  "/projects/:id/complete-step",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const project = await fetchProjectWithSteps(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const currentStep = project.steps.find(
        (s: any) => s.step_number === project.current_step,
      );

      if (!currentStep) {
        return res.status(404).json({ error: "Current step not found" });
      }

      if (currentStep.status === "completed") {
        return res.status(400).json({ error: "Step already completed" });
      }

      // Mark step as completed
      const { error: stepError } = await supabase
        .from("roadmap_steps")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", currentStep.id);

      if (stepError) {
        console.error("[Roadmap V2] Error completing step:", stepError);
        return res.status(500).json({ error: "Failed to complete step" });
      }

      console.log(
        `[Roadmap V2] Step ${currentStep.step_number} marked complete`,
      );

      // Update suggestion as accepted
      await supabase
        .from("completion_suggestions")
        .update({
          user_action: "accepted",
          actioned_at: new Date().toISOString(),
        })
        .eq("project_id", id)
        .eq("step_id", currentStep.id)
        .is("user_action", null);

      // Calculate new completion percentage
      const completedCount =
        project.steps.filter(
          (s: any) =>
            s.status === "completed" ||
            s.step_number === currentStep.step_number,
        ).length + 1;
      const completionPercentage = Math.round(
        (completedCount / project.metadata.total_steps) * 100,
      );

      // Update metadata
      await supabase
        .from("project_roadmap_metadata")
        .update({
          completion_percentage: completionPercentage,
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", id);

      // Return updated project
      const updatedProject = await fetchProjectWithSteps(id);

      return res.json({
        ...updatedProject,
        step_completed: true,
        completion_message: `Step ${currentStep.step_number} complete! ${completionPercentage}% done.`,
      });
    } catch (error) {
      console.error("[Roadmap V2] Error completing step:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ============================================================================
// POST /api/v2/projects/:id/continue - Continue to next step
// ============================================================================
router.post("/projects/:id/continue", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await fetchProjectWithSteps(id);

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const currentStep = project.steps.find(
      (s: any) => s.step_number === project.current_step,
    );

    if (!currentStep) {
      return res.status(404).json({ error: "Current step not found" });
    }

    if (currentStep.status !== "completed") {
      return res
        .status(400)
        .json({ error: "Current step must be completed first" });
    }

    const nextStepNumber = project.current_step + 1;

    if (nextStepNumber > project.metadata.total_steps) {
      // Project complete!
      await supabase
        .from("projects")
        .update({ status: "completed", roadmap_status: "completed" })
        .eq("id", id);

      return res.json({
        project_complete: true,
        message: "🎉 Congratulations! You've completed your project!",
      });
    }

    // Update project to next step
    const { error: updateError } = await supabase
      .from("projects")
      .update({ current_step: nextStepNumber })
      .eq("id", id);

    if (updateError) {
      console.error("[Roadmap V2] Error advancing to next step:", updateError);
      return res.status(500).json({ error: "Failed to advance to next step" });
    }

    // Mark next step as active
    const nextStep = project.steps.find(
      (s: any) => s.step_number === nextStepNumber,
    );

    if (nextStep) {
      await supabase
        .from("roadmap_steps")
        .update({ status: "active" })
        .eq("id", nextStep.id);
    }

    // Update metadata
    await supabase
      .from("project_roadmap_metadata")
      .update({
        current_step: nextStepNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", id);

    console.log(`[Roadmap V2] Advanced to step ${nextStepNumber}`);

    // Return updated project
    const updatedProject = await fetchProjectWithSteps(id);

    return res.json({
      ...updatedProject,
      step_advanced: true,
      message: `Now on Step ${nextStepNumber}: ${nextStep?.title}`,
    });
  } catch (error) {
    console.error("[Roadmap V2] Error continuing to next step:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// POST /api/v2/projects/:id/execute-step - Execute step with expert AI guidance
// ============================================================================
router.post(
  "/projects/:id/execute-step",
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { master_prompt, user_message } = req.body;

      console.log(
        `🚀 [Roadmap V2] ============================================`,
      );
      console.log(`🚀 [Roadmap V2] Execute step endpoint hit!`);
      console.log(`🚀 [Roadmap V2] Project ID: ${id}`);
      console.log(`🚀 [Roadmap V2] User message: ${user_message || "(none)"}`);
      console.log(
        `🚀 [Roadmap V2] Master prompt length: ${master_prompt?.length || 0} chars`,
      );
      console.log(
        `🚀 [Roadmap V2] ============================================`,
      );

      if (!master_prompt || typeof master_prompt !== "string") {
        console.error(`❌ [Roadmap V2] Master prompt missing or invalid`);
        return res.status(400).json({ error: "Master prompt is required" });
      }

      // Set SSE headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      console.log(`🚀 [Roadmap V2] SSE headers set, calling orchestrator...`);

      // Use the orchestrator's streaming execution
      // This has the expert builder logic that executes FOR the user
      await orchestrator.executeStepStreaming({
        project_id: id,
        master_prompt,
        user_message: user_message || "",
        res,
      });

      console.log(
        `✅ [Roadmap V2] Step execution completed for project: ${id}`,
      );
      return;
    } catch (error) {
      console.error("❌ [Roadmap V2] Error executing step:", error);
      console.error("❌ [Roadmap V2] Error stack:", (error as Error).stack);
      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({ error: "Failed to execute step" })}\n\n`,
      );
      res.end();
      return;
    }
  },
);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch project with all steps and metadata
 */
async function fetchProjectWithSteps(projectId: string) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return null;
  }

  const { data: metadata, error: metadataError } = await supabase
    .from("project_roadmap_metadata")
    .select("*")
    .eq("project_id", projectId)
    .single();

  const { data: steps, error: stepsError } = await supabase
    .from("roadmap_steps")
    .select("*")
    .eq("project_id", projectId)
    .order("step_number", { ascending: true });

  if (metadataError || stepsError) {
    console.error("[Roadmap V2] Error fetching project data:", {
      metadataError,
      stepsError,
    });
    return null;
  }

  return {
    ...project,
    metadata: metadata || {},
    steps: steps || [],
  };
}

export default router;
