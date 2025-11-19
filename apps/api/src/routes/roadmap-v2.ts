/**
 * Dynamic Roadmap API Routes (V2)
 *
 * New API endpoints for LLM-driven, linear roadmap system.
 * Replaces static P0-P7 phase structure.
 */

import { Router, Request, Response } from "express";
import { supabase } from "../db";
import { RoadmapGenerationServiceV3 } from "../domain/projects/services/RoadmapGenerationServiceV3";
import { StepCompletionService } from "../domain/projects/services/StepCompletionService";
import { ExecutionService } from "../domain/projects/services/ExecutionService";
import { threadService } from "../services/threadService";
import { randomUUID } from "crypto";
import { aiLimiter, readOnlyLimiter } from "../middleware/rateLimit";
import { requireAuth } from "../middleware/auth";
import {
  captureVision,
  linkVisionToProject,
  logActivity,
  ActivityActions,
} from "../services/ActivityLogger";

const router = Router();
const roadmapServiceV3 = new RoadmapGenerationServiceV3();
const completionService = new StepCompletionService();

// Helper function to fetch V2 project for ExecutionService
async function getV2Project(projectId: string) {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return undefined;
  }

  const { data: steps, error: stepsError } = await supabase
    .from("roadmap_steps")
    .select("*")
    .eq("project_id", projectId)
    .order("step_number", { ascending: true });

  if (stepsError || !steps) {
    return undefined;
  }

  return {
    id: project.id,
    goal: project.goal,
    current_step: project.current_step || 1,
    steps: steps.map((s) => ({
      step_number: s.step_number,
      title: s.title,
      description: s.description,
      status: s.status,
    })),
  };
}

const executionService = new ExecutionService(getV2Project);

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
  const startTime = Date.now();

  // Declare outside try block for access in catch
  // Initialize with a default UUID to ensure it's always defined
  let validUserId: string = randomUUID();
  let visionId: string | undefined;

  try {
    const {
      vision,
      user_id,
      clarification_context,
      skill_level,
      build_approach,
      project_purpose,
    } = req.body;

    if (!vision) {
      return res.status(400).json({ error: "Vision is required" });
    }

    console.log("[Roadmap V2] Creating project with vision:", vision);
    console.log("[Roadmap V2] Build approach:", build_approach || "auto");
    console.log("[Roadmap V2] Project purpose:", project_purpose || "personal");

    // Ensure user_id is valid for analytics
    validUserId = user_id && isValidUUID(user_id) ? user_id : randomUUID();

    // STEP 1: Capture vision BEFORE generating roadmap
    // This is critical data - capture it even if roadmap generation fails
    const visionRecord = await captureVision({
      userId: validUserId,
      rawVision: vision,
      buildApproach: build_approach,
      projectPurpose: project_purpose,
      userAgent: req.headers["user-agent"],
    });

    visionId = visionRecord?.id;

    // STEP 2: Log roadmap generation start
    if (visionId) {
      await logActivity(
        ActivityActions.ROADMAP_GENERATION_STARTED,
        { userId: validUserId },
        {
          visionId,
          visionLength: vision.length,
          buildApproach: build_approach || "auto",
          projectPurpose: project_purpose || "personal",
        },
      );
    }

    // STEP 3: Generate P0-P7 phase-based roadmap
    const roadmapResponse = await roadmapServiceV3.generateRoadmap({
      vision,
      clarification_context,
      user_skill_level: skill_level || "beginner",
      build_approach: build_approach || "auto",
      project_purpose: project_purpose || "personal",
    });

    console.log(
      `[Roadmap V3] Generated ${roadmapResponse.total_phases} phases with substeps`,
    );

    // Create project (backward compatible - doesn't require migration)
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: validUserId,
        goal: vision, // Use goal field for now (vision_statement requires migration)
        status: "active",
        current_step: 1,
        // current_phase: 0, // Requires migration - commented out for backward compatibility
        roadmap_status: "ready",
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (projectError || !project) {
      console.error("[Roadmap V3] Error creating project:", projectError);
      return res.status(500).json({ error: "Failed to create project" });
    }

    // Create roadmap metadata (backward compatible)
    const { error: metadataError } = await supabase
      .from("project_roadmap_metadata")
      .insert({
        project_id: project.id,
        total_steps: 0, // Will be calculated from substeps
        // total_phases: roadmapResponse.total_phases, // Requires migration
        current_step: 1,
        // current_phase: 0, // Requires migration
        completion_percentage: 0,
        roadmap_version: 1,
        // roadmap_type: "phase_based", // Requires migration
        generated_by: roadmapResponse.generated_by,
        generation_prompt: vision,
        // estimated_timeline: roadmapResponse.estimated_timeline, // Requires migration
        created_at: new Date().toISOString(),
      });

    if (metadataError) {
      console.error("[Roadmap V3] Error creating metadata:", metadataError);
      return res
        .status(500)
        .json({ error: "Failed to create roadmap metadata" });
    }

    // Insert steps (backward compatible - flatten all substeps into regular steps)
    // NOTE: This is a fallback for when the migration hasn't been run yet
    // Once migration is run, this will properly create phases and substeps
    let stepNumber = 1;
    const allSteps: any[] = [];

    for (const phase of roadmapResponse.phases) {
      // Flatten all substeps from all phases into a single array of steps
      for (const substep of phase.substeps) {
        allSteps.push({
          project_id: project.id,
          step_number: stepNumber,
          title: `${phase.phase_id}: ${substep.title}`,
          description: substep.description,
          // Use substep-specific master prompt if available, fallback to phase prompt
          master_prompt: substep.master_prompt || phase.master_prompt,
          acceptance_criteria: substep.acceptance_criteria,
          estimated_complexity: substep.estimated_complexity,
          status: stepNumber === 1 ? "active" : "pending", // First step is active
          created_at: new Date().toISOString(),
        });
        stepNumber++;
      }
    }

    if (allSteps.length > 0) {
      const { error: stepsError } = await supabase
        .from("roadmap_steps")
        .insert(allSteps);

      if (stepsError) {
        console.error(`[Roadmap V3] Error creating steps:`, stepsError);
        return res
          .status(500)
          .json({ error: "Failed to create roadmap steps" });
      }
    }

    // Update total_steps in metadata
    await supabase
      .from("project_roadmap_metadata")
      .update({ total_steps: allSteps.length })
      .eq("project_id", project.id);

    console.log(
      `✅ [Roadmap V3] Created project ${project.id} with ${allSteps.length} steps`,
    );

    // STEP 4: Link vision to project (if vision was captured)
    if (visionId) {
      await linkVisionToProject(visionId, project.id);
      console.log(
        `📊 [Analytics] Linked vision ${visionId} to project ${project.id}`,
      );
    }

    // STEP 5: Log successful roadmap generation
    if (visionId) {
      await logActivity(
        ActivityActions.ROADMAP_GENERATED,
        { userId: validUserId, projectId: project.id },
        {
          visionId,
          phaseCount: roadmapResponse.total_phases,
          stepCount: allSteps.length,
          generationTimeMs: Date.now() - startTime,
          buildApproach: build_approach || "auto",
          projectPurpose: project_purpose || "personal",
        },
      );
      console.log(
        `📊 [Analytics] Logged successful roadmap generation for project ${project.id}`,
      );
    }

    // Fetch complete project (backward compatible - uses flat steps)
    const completeProject = await fetchProjectWithSteps(project.id);

    return res.status(201).json(completeProject);
  } catch (error) {
    console.error("[Roadmap V2] Error:", error);

    // STEP 6: Log roadmap generation failure
    if (visionId && validUserId) {
      await logActivity(
        ActivityActions.ROADMAP_GENERATION_FAILED,
        { userId: validUserId },
        {
          visionId,
          errorMessage: error instanceof Error ? error.message : String(error),
          failedAtMs: Date.now() - startTime,
        },
      );
      console.log(
        `📊 [Analytics] Logged roadmap generation failure for vision ${visionId}`,
      );
    }

    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// GET /api/v2/projects - List all projects for authenticated user
// ============================================================================
router.get(
  "/projects",
  requireAuth,
  readOnlyLimiter,
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      console.log(`[Roadmap V2] Fetching projects for user: ${userId}`);

      // Fetch all projects for this user, ordered by created date
      // TODO: Add last_accessed_at column to database and use for sorting
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select(
          `
          id,
          goal,
          status,
          created_at,
          current_step
        `,
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (projectsError) {
        console.error("[Roadmap V2] Error fetching projects:", projectsError);
        return res.status(500).json({ error: "Failed to fetch projects" });
      }

      // Fetch metadata for each project to get phase info and completion
      const projectsWithMeta = await Promise.all(
        (projects || []).map(async (project) => {
          const { data: metadata } = await supabase
            .from("project_roadmap_metadata")
            .select("current_phase, completion_percentage")
            .eq("project_id", project.id)
            .single();

          return {
            ...project,
            current_phase: metadata?.current_phase || 0,
            completion_percentage: metadata?.completion_percentage || 0,
          };
        }),
      );

      console.log(
        `[Roadmap V2] Found ${projectsWithMeta.length} projects for user`,
      );

      return res.json({
        projects: projectsWithMeta,
        total: projectsWithMeta.length,
      });
    } catch (error) {
      console.error("[Roadmap V2] Error in GET /projects:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ============================================================================
// GET /api/v2/projects/:id - Get project with roadmap
// ============================================================================
router.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Update last_accessed_at timestamp (silently fail if column doesn't exist yet)
    try {
      await supabase
        .from("projects")
        .update({ last_accessed_at: new Date().toISOString() })
        .eq("id", id);
    } catch {
      // Silently fail if column doesn't exist yet
    }

    // Check if project uses phase-based roadmap
    const { data: metadata } = await supabase
      .from("project_roadmap_metadata")
      .select("roadmap_type")
      .eq("project_id", id)
      .single();

    const isPhaseBasedProject = metadata?.roadmap_type === "phase_based";

    const project = isPhaseBasedProject
      ? await fetchProjectWithPhases(id)
      : await fetchProjectWithSteps(id);

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
// DELETE /api/v2/projects/:id - Delete a project
// ============================================================================
router.delete(
  "/projects/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      console.log(`[Roadmap V2] Deleting project ${id} for user ${userId}`);

      // Verify project belongs to user
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id, user_id")
        .eq("id", id)
        .single();

      if (projectError || !project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (project.user_id !== userId) {
        return res.status(403).json({ error: "Forbidden: Not your project" });
      }

      // Delete project (cascade should handle related records)
      const { error: deleteError } = await supabase
        .from("projects")
        .delete()
        .eq("id", id);

      if (deleteError) {
        console.error("[Roadmap V2] Error deleting project:", deleteError);
        return res.status(500).json({ error: "Failed to delete project" });
      }

      console.log(`✅ [Roadmap V2] Project ${id} deleted successfully`);

      return res.json({ success: true, message: "Project deleted" });
    } catch (error) {
      console.error("[Roadmap V2] Error in DELETE /projects/:id:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ============================================================================
// GET /api/v2/projects/:id/thread - Get or create thread for project
// ============================================================================
router.get(
  "/projects/:id/thread",
  readOnlyLimiter,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify project exists
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", id)
        .single();

      if (projectError || !project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get or create thread for this project
      const thread = await threadService.getOrCreateThread(id);

      if (!thread) {
        return res
          .status(500)
          .json({ error: "Failed to get or create thread" });
      }

      return res.json({
        thread_id: thread.id,
        project_id: thread.project_id,
        title: thread.title,
        created_at: thread.created_at,
      });
    } catch (error) {
      console.error("[Roadmap V2] Error fetching thread:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

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

      // Generate step summary from conversation
      let stepSummary: string | undefined;
      try {
        const { data: threadData } = await supabase
          .from("threads")
          .select("id")
          .eq("project_id", id)
          .single();

        if (threadData) {
          const stepStartTime =
            currentStep.created_at || new Date(0).toISOString();
          const { data: messages } = await supabase
            .from("messages")
            .select("role, content, created_at")
            .eq("thread_id", threadData.id)
            .gte("created_at", stepStartTime)
            .order("created_at", { ascending: true });

          const threadMessages = (messages || []).map((msg: any) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
            timestamp: msg.created_at,
          }));

          const completionService = new StepCompletionService();
          stepSummary = await completionService.generateStepSummary(
            currentStep,
            threadMessages,
          );

          console.log(`📝 [Complete Step] Generated summary: ${stepSummary}`);
        }
      } catch (summaryError) {
        console.error(
          "[Complete Step] Error generating summary:",
          summaryError,
        );
        // Continue without summary - it's not critical
      }

      // Mark step as completed with summary
      const stepCompletedAt = new Date().toISOString();
      const { error: stepError } = await supabase
        .from("roadmap_steps")
        .update({
          status: "completed",
          completed_at: stepCompletedAt,
          completion_summary: stepSummary || null,
        })
        .eq("id", currentStep.id);

      if (stepError) {
        console.error("[Roadmap V2] Error completing step:", stepError);
        return res.status(500).json({ error: "Failed to complete step" });
      }

      console.log(
        `✅ [Roadmap V2] Step ${currentStep.step_number} "${currentStep.title}" marked complete`,
      );

      // Log step completion activity
      if (project.user_id && isValidUUID(project.user_id)) {
        await logActivity(
          ActivityActions.STEP_COMPLETED,
          { userId: project.user_id, projectId: id },
          {
            stepId: currentStep.id,
            stepNumber: currentStep.step_number,
            stepTitle: currentStep.title,
            manualComplete: true,
          },
        );
      }

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

      // AUTOMATICALLY ADVANCE TO NEXT STEP (instead of requiring separate /continue call)
      const nextStepNumber = project.current_step + 1;

      if (nextStepNumber <= project.metadata.total_steps) {
        // Advance to next step
        console.log(
          `🚀 [Roadmap V2] Auto-advancing from step ${project.current_step} to step ${nextStepNumber}`,
        );

        await supabase
          .from("projects")
          .update({ current_step: nextStepNumber })
          .eq("id", id);

        // Mark next step as active
        const nextStep = project.steps.find(
          (s: any) => s.step_number === nextStepNumber,
        );

        if (nextStep) {
          await supabase
            .from("roadmap_steps")
            .update({ status: "active" })
            .eq("id", nextStep.id);

          console.log(
            `✅ [Roadmap V2] Now on Step ${nextStepNumber}: "${nextStep.title}"`,
          );
        }
      } else {
        // All steps complete!
        console.log(`🎉 [Roadmap V2] All steps completed for project ${id}`);

        await supabase
          .from("projects")
          .update({ status: "completed", roadmap_status: "completed" })
          .eq("id", id);
      }

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

      // Log project completion
      if (project.user_id && isValidUUID(project.user_id)) {
        await logActivity(
          ActivityActions.PROJECT_COMPLETED,
          { userId: project.user_id, projectId: id },
          {
            totalSteps: project.metadata.total_steps,
            projectGoal: project.goal,
          },
        );
      }

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
      console.log(
        `🔄 [Roadmap V2] Activating step ${nextStepNumber}: "${nextStep.title}"`,
      );
      await supabase
        .from("roadmap_steps")
        .update({ status: "active" })
        .eq("id", nextStep.id);
    } else {
      console.error(
        `❌ [Roadmap V2] Next step ${nextStepNumber} not found in steps array`,
      );
    }

    // Update metadata
    await supabase
      .from("project_roadmap_metadata")
      .update({
        current_step: nextStepNumber,
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", id);

    console.log(
      `✅ [Roadmap V2] Advanced to step ${nextStepNumber}: "${nextStep?.title}"`,
    );

    // Return updated project
    const updatedProject = await fetchProjectWithSteps(id);

    console.log(
      `📊 [Roadmap V2] Updated project current_step: ${updatedProject?.current_step}`,
    );

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
      const { user_message } = req.body;

      console.log(
        `🚀 [Roadmap V2] ============================================`,
      );
      console.log(`🚀 [Roadmap V2] Execute step endpoint hit!`);
      console.log(`🚀 [Roadmap V2] Project ID: ${id}`);
      console.log(`🚀 [Roadmap V2] User message: ${user_message || "(none)"}`);

      // Get current step details from database (source of truth)
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

      // ALWAYS use master_prompt from database, not from frontend
      const master_prompt = currentStep.master_prompt;

      if (!master_prompt || typeof master_prompt !== "string") {
        console.error(
          `❌ [Roadmap V2] Master prompt missing in database for step ${project.current_step}`,
        );
        return res
          .status(500)
          .json({ error: "Master prompt not found for current step" });
      }

      console.log(
        `🚀 [Roadmap V2] Using master prompt from Step ${project.current_step}: "${currentStep.title}"`,
      );
      console.log(
        `🚀 [Roadmap V2] Master prompt length: ${master_prompt.length} chars`,
      );
      console.log(
        `🚀 [Roadmap V2] Acceptance criteria count: ${currentStep.acceptance_criteria?.length || 0}`,
      );
      console.log(
        `🚀 [Roadmap V2] ============================================`,
      );

      // Set SSE headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      console.log(
        `🚀 [Roadmap V2] SSE headers set, calling execution service...`,
      );

      // Use the execution service's streaming execution
      // This has the expert builder logic that executes FOR the user
      await executionService.executeStepStreaming({
        project_id: id,
        master_prompt,
        user_message: user_message || "",
        res,
        current_step_context: {
          step_number: currentStep.step_number,
          title: currentStep.title,
          description: currentStep.description,
          acceptance_criteria: currentStep.acceptance_criteria || [],
        },
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
// MICRO-STEP ENDPOINTS - Plan → Approve → Execute Workflow
// ============================================================================

import { MicroStepService } from "../domain/projects/services/MicroStepService";
const microStepService = new MicroStepService();

// POST /api/v2/projects/:id/steps/:stepId/generate-plan - Generate micro-step plan
router.post(
  "/projects/:id/steps/:stepId/generate-plan",
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const { id, stepId } = req.params;

      console.log(
        `[Roadmap V2] Generating micro-step plan for step: ${stepId}`,
      );

      // Fetch step details
      const { data: step, error: stepError } = await supabase
        .from("roadmap_steps")
        .select("*")
        .eq("id", stepId)
        .eq("project_id", id)
        .single();

      if (stepError || !step) {
        return res.status(404).json({ error: "Step not found" });
      }

      // Fetch project goal
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("goal")
        .eq("id", id)
        .single();

      if (projectError || !project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Generate plan
      const result = await microStepService.generatePlan({
        step_id: stepId,
        step_title: step.title,
        step_description: step.description || "",
        acceptance_criteria: step.acceptance_criteria || [],
        project_goal: project.goal,
      });

      return res.json(result);
    } catch (error) {
      console.error("[Roadmap V2] Error generating micro-step plan:", error);
      return res.status(500).json({ error: "Failed to generate plan" });
    }
  },
);

// POST /api/v2/projects/:id/steps/:stepId/approve-plan - Approve generated plan
router.post(
  "/projects/:id/steps/:stepId/approve-plan",
  async (req: Request, res: Response) => {
    try {
      const { stepId } = req.params;

      console.log(`[Roadmap V2] Approving plan for step: ${stepId}`);

      const result = await microStepService.approvePlan(stepId);

      return res.json(result);
    } catch (error) {
      console.error("[Roadmap V2] Error approving plan:", error);
      return res.status(500).json({ error: "Failed to approve plan" });
    }
  },
);

// POST /api/v2/projects/:id/steps/:stepId/reject-plan - Reject and regenerate plan
router.post(
  "/projects/:id/steps/:stepId/reject-plan",
  async (req: Request, res: Response) => {
    try {
      const { stepId } = req.params;

      console.log(`[Roadmap V2] Rejecting plan for step: ${stepId}`);

      const result = await microStepService.rejectPlan(stepId);

      return res.json(result);
    } catch (error) {
      console.error("[Roadmap V2] Error rejecting plan:", error);
      return res.status(500).json({ error: "Failed to reject plan" });
    }
  },
);

// GET /api/v2/projects/:id/steps/:stepId/micro-steps - Get micro-steps for a step
router.get(
  "/projects/:id/steps/:stepId/micro-steps",
  readOnlyLimiter,
  async (req: Request, res: Response) => {
    try {
      const { stepId } = req.params;

      const microSteps = await microStepService.getMicroSteps(stepId);

      return res.json({ micro_steps: microSteps });
    } catch (error) {
      console.error("[Roadmap V2] Error fetching micro-steps:", error);
      return res.status(500).json({ error: "Failed to fetch micro-steps" });
    }
  },
);

// POST /api/v2/projects/:id/steps/:stepId/execute-micro-step - Execute current micro-step with streaming
router.post(
  "/projects/:id/steps/:stepId/execute-micro-step",
  aiLimiter,
  async (req: Request, res: Response) => {
    try {
      const { id: projectId, stepId } = req.params;

      console.log(
        `[Roadmap V2] Executing micro-step for project: ${projectId}, step: ${stepId}`,
      );

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      // Execute micro-step with streaming
      await executionService.executeMicroStepStreaming({
        project_id: projectId,
        step_id: stepId,
        res,
      });

      res.write("data: [DONE]\n\n");
      res.end();
      return;
    } catch (error) {
      console.error("[Roadmap V2] Error executing micro-step:", error);

      // Send error via SSE if headers already sent, otherwise JSON
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Failed to execute micro-step" })}\n\n`,
        );
        res.end();
        return;
      } else {
        return res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to execute micro-step",
        });
      }
    }
  },
);

// POST /api/v2/projects/:id/steps/:stepId/complete-micro-step - Complete a micro-step
router.post(
  "/projects/:id/steps/:stepId/complete-micro-step",
  async (req: Request, res: Response) => {
    try {
      const { stepId } = req.params;
      const { micro_step_number } = req.body;

      if (!micro_step_number) {
        return res.status(400).json({ error: "micro_step_number required" });
      }

      console.log(
        `[Roadmap V2] Completing micro-step ${micro_step_number} for step: ${stepId}`,
      );

      const result = await microStepService.completeMicroStep(
        stepId,
        micro_step_number,
      );

      return res.json(result);
    } catch (error) {
      console.error("[Roadmap V2] Error completing micro-step:", error);
      return res.status(500).json({ error: "Failed to complete micro-step" });
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

async function fetchProjectWithPhases(projectId: string) {
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

  // Fetch phases
  const { data: phases, error: phasesError } = await supabase
    .from("roadmap_phases")
    .select("*")
    .eq("project_id", projectId)
    .order("phase_number", { ascending: true });

  if (metadataError || phasesError) {
    console.error("[Roadmap V3] Error fetching project data:", {
      metadataError,
      phasesError,
    });
    return null;
  }

  // Fetch substeps for each phase
  const phasesWithSubsteps = await Promise.all(
    (phases || []).map(async (phase) => {
      const { data: substeps } = await supabase
        .from("roadmap_steps")
        .select("*")
        .eq("phase_id", phase.id)
        .eq("is_substep", true)
        .order("substep_number", { ascending: true });

      return {
        ...phase,
        substeps: substeps || [],
      };
    }),
  );

  return {
    ...project,
    metadata: metadata || {},
    phases: phasesWithSubsteps,
  };
}

// ============================================================================
// POST /api/v2/projects/:id/check-completion - Check if current step should auto-advance
// ============================================================================
router.post(
  "/projects/:id/check-completion",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { step_number } = req.body;

      const project = await fetchProjectWithSteps(id);

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      const currentStep = project.steps.find(
        (s: any) =>
          s.step_number === step_number ||
          s.step_number === project.current_step,
      );

      if (!currentStep) {
        return res.status(404).json({ error: "Step not found" });
      }

      // Fetch thread messages for analysis - ONLY messages for this step
      const { data: threadData } = await supabase
        .from("threads")
        .select("id")
        .eq("project_id", id)
        .single();

      if (!threadData) {
        return res.status(404).json({ error: "Thread not found" });
      }

      // Get the timestamp when this step became active
      const stepStartTime = currentStep.created_at || new Date(0).toISOString();

      // Only get messages since this step started
      const { data: messages } = await supabase
        .from("messages")
        .select("role, content, created_at")
        .eq("thread_id", threadData.id)
        .gte("created_at", stepStartTime)
        .order("created_at", { ascending: true });

      const threadMessages = (messages || []).map((msg: any) => ({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: msg.content,
        timestamp: msg.created_at,
      }));

      console.log(
        `[Check Completion] Analyzing ${threadMessages.length} messages for step ${currentStep.step_number} (since ${stepStartTime})`,
      );

      // Analyze completion
      const suggestion = await completionService.analyzeCompletion({
        step: {
          step_number: currentStep.step_number,
          title: currentStep.title,
          description: currentStep.description,
          acceptance_criteria: currentStep.acceptance_criteria || [],
          estimated_complexity: currentStep.estimated_complexity || 5,
          status: currentStep.status,
        },
        conversation: threadMessages,
      });

      console.log(
        `[Check Completion] Step ${currentStep.step_number}: ${suggestion.status_recommendation} (${suggestion.confidence_score}% confidence, auto-advance: ${suggestion.auto_advance})`,
      );

      return res.json(suggestion);
    } catch (error) {
      console.error("[Check Completion] Error:", error);
      return res.status(500).json({
        error: "Failed to check completion",
        status_recommendation: "BLOCKED" as const,
        auto_advance: false,
        confidence_score: 0,
      });
    }
  },
);

export default router;
