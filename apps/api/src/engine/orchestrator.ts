/**
 * Step Orchestrator (Refactored)
 *
 * Thin coordination layer that delegates to domain services.
 * Reduced from 2,190 lines to ~200 lines by extracting business logic.
 *
 * Responsibilities:
 * - Project persistence (Supabase + in-memory cache)
 * - Coordinating service calls
 * - Maintaining backward compatibility with routes
 */

import type { Response } from "express";
import { supabase, withRetry } from "../db";
import { ProjectStateManager } from "../services/projectStateManager";
import { services } from "../domain/projects/services/ServiceFactory";
import type {
  Project,
  PhaseGenerationRequest,
  PhaseGenerationResponse,
  CompleteSubstepRequest,
  CompleteSubstepResponse,
} from "./types";

// In-memory cache (will be removed once Supabase is fully integrated)
const projects: Map<string, Project> = new Map();

export class StepOrchestrator {
  public stateManager: ProjectStateManager;

  constructor() {
    this.stateManager = new ProjectStateManager(this);

    // Initialize services that depend on orchestrator
    services.initialize(this);

    console.log("✅ [Orchestrator] Initialized with new service architecture");
  }

  // ========================================
  // Project Creation
  // ========================================

  /**
   * Create project with generated ID
   */
  async createProject(goal: string): Promise<Project> {
    return this.createProjectWithPhase1(goal);
  }

  /**
   * Create project with Phase 1 expanded
   */
  async createProjectWithPhase1(goal: string): Promise<Project> {
    const project = await services.projectCreation.createProject(goal);
    projects.set(project.id, project);
    return project;
  }

  /**
   * Create project with specific ID (for Supabase UUID)
   */
  async createProjectWithId(
    id: string,
    goal: string,
    onProgress?: (progress: any) => void,
  ): Promise<Project> {
    const project = await services.projectCreation.createProjectWithId(
      id,
      goal,
      onProgress,
    );
    projects.set(project.id, project);
    console.log("✅ [Orchestrator] Project created with ID:", id);
    return project;
  }

  // ========================================
  // Phase & Substep Generation
  // ========================================

  /**
   * Generate phases for a project
   */
  async generatePhases(
    request: PhaseGenerationRequest,
  ): Promise<PhaseGenerationResponse> {
    return services.phaseGeneration.generatePhases(request);
  }

  /**
   * Expand a phase with substeps
   *
   * ✅ Gap #1 Fix: Now passes allPhases for context building
   */
  async expandPhaseWithSubsteps(
    phase: any,
    goal: string,
    stateSnapshot?: unknown,
    allPhases?: any[],
  ): Promise<any> {
    return services.substepGeneration.expandPhaseWithSubsteps(
      phase,
      goal,
      stateSnapshot,
      allPhases,
    );
  }

  // ========================================
  // Step Execution
  // ========================================

  /**
   * Execute step with streaming (SSE)
   *
   * This now includes automatic completion detection!
   */
  async executeStepStreaming(request: {
    project_id: string;
    master_prompt: string;
    user_message?: string;
    thread_id?: string;
    res: Response;
  }): Promise<void> {
    console.log(
      "🚀 [Orchestrator] Delegating streaming execution to ExecutionService",
    );

    return services.execution.executeStepStreaming(request);
  }

  /**
   * Execute step without streaming
   */
  async executeStep(request: {
    project_id: string;
    master_prompt: string;
    user_message?: string;
  }): Promise<any> {
    console.log("🚀 [Orchestrator] Delegating execution to ExecutionService");

    return services.execution.executeStep(request);
  }

  // ========================================
  // Completion
  // ========================================

  /**
   * Complete a substep
   *
   * Legacy method for backward compatibility
   * Routes should use this or call CompletionService directly
   */
  async completeSubstep(
    request: CompleteSubstepRequest,
  ): Promise<CompleteSubstepResponse> {
    console.log("✅ [Orchestrator] Delegating completion to CompletionService");

    // Find the substep by ID to get phase_id and step_number
    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    let phaseId = "";
    let substepNumber = 0;

    for (const phase of project.phases || []) {
      const substep = phase.substeps?.find(
        (s: any) => s.substep_id === request.substep_id,
      );
      if (substep) {
        phaseId = phase.phase_id;
        substepNumber = substep.step_number;
        break;
      }
    }

    if (!phaseId) {
      throw new Error("Substep not found");
    }

    const result = await services.completion.completeSubstep({
      project_id: request.project_id,
      phase_id: phaseId,
      substep_number: substepNumber,
    });

    // Refresh project from cache/db
    const updatedProject = await this.getProjectAsync(request.project_id);

    return {
      project: updatedProject!,
      phase_unlocked: undefined,
      message: result.briefing || "Substep completed",
    };
  }

  // ========================================
  // Phase Expansion
  // ========================================

  /**
   * Expand a phase with master prompt input
   */
  async expandPhase(request: {
    project_id: string;
    phase_id: string;
    master_prompt_input: string;
  }): Promise<any> {
    console.log(
      `🎯 [Orchestrator] Expanding phase ${request.phase_id} for project ${request.project_id}`,
    );

    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }
    console.log(`✅ [Orchestrator] Project loaded: ${project.goal}`);

    const phase = project.phases?.find(
      (p: any) => p.phase_id === request.phase_id,
    );
    if (!phase) {
      throw new Error(`Phase ${request.phase_id} not found`);
    }
    console.log(`✅ [Orchestrator] Phase found: ${phase.goal}`);
    console.log(
      `📊 [Orchestrator] Phase currently has ${phase.substeps?.length || 0} substeps`,
    );

    // Expand the phase
    // ✅ Gap #1 Fix: Pass all phases for context building
    console.log(`🔧 [Orchestrator] Starting expandPhaseWithSubsteps...`);
    const expandedPhase = await this.expandPhaseWithSubsteps(
      phase,
      project.goal,
      undefined,
      project.phases,
    );
    console.log(
      `✅ [Orchestrator] expandPhaseWithSubsteps completed. Generated ${expandedPhase.substeps?.length || 0} substeps`,
    );

    // Update project
    const phaseIndex = project.phases!.findIndex(
      (p: any) => p.phase_id === request.phase_id,
    );
    const updatedPhase = {
      ...expandedPhase,
      expanded: true,
      locked: false,
    };

    project.phases![phaseIndex] = updatedPhase;
    // CRITICAL: Also update roadmap to keep both structures in sync
    if (project.roadmap?.phases) {
      project.roadmap.phases[phaseIndex] = updatedPhase;
    }

    // CRITICAL: If this is the current phase and current_substep is 0 (needs expansion),
    // advance to substep 1 now that phase is expanded
    if (
      project.current_phase === request.phase_id &&
      project.current_substep === 0
    ) {
      project.current_substep = 1;
      console.log(
        `✅ [Orchestrator] Advanced current_substep from 0 to 1 after expansion`,
      );
    }

    projects.set(request.project_id, project);
    console.log(`✅ [Orchestrator] Updated in-memory cache`);

    // Persist to Supabase
    console.log(`💾 [Orchestrator] Persisting to Supabase...`);
    try {
      await withRetry(async () => {
        const result = await supabase
          .from("projects")
          .update({
            roadmap: { phases: project.phases }, // CRITICAL: Wrap in { phases: ... }
            current_substep: project.current_substep, // Save updated current_substep
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.project_id)
          .select()
          .single();
        return result;
      });
      console.log(`✅ [Orchestrator] Supabase update successful`);
    } catch (err) {
      console.error("❌ [Orchestrator] Error persisting phase expansion:", err);
    }

    console.log(
      `🎉 [Orchestrator] Phase expansion complete! Returning result.`,
    );
    return {
      phase: expandedPhase,
      project,
    };
  }

  /**
   * Detect master prompt in user input
   */
  detectMasterPrompt(input: string, phases: any[]): string | null {
    const lowerInput = input.toLowerCase();

    for (const phase of phases) {
      const phaseKeywords = [
        phase.phase_id.toLowerCase(),
        phase.goal.toLowerCase().split(" ")[0],
      ];

      for (const keyword of phaseKeywords) {
        if (lowerInput.includes(keyword)) {
          return phase.phase_id;
        }
      }
    }

    return null;
  }

  // ========================================
  // Project Persistence (Supabase + Cache)
  // ========================================

  /**
   * Load project from Supabase and cache in memory
   */
  private async loadProjectFromSupabase(
    projectId: string,
  ): Promise<Project | undefined> {
    try {
      const result = await withRetry(async () => {
        const res = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();
        return res;
      });

      if (!result) {
        return undefined;
      }

      // ✅ V2 Project Support: Check if this project has roadmap_steps
      console.log(
        `[Orchestrator] Checking for V2 steps for project: ${projectId}`,
      );
      const { data: v2Steps } = await supabase
        .from("roadmap_steps")
        .select("*")
        .eq("project_id", projectId)
        .order("step_number", { ascending: true });

      const isV2 = v2Steps && v2Steps.length > 0;
      console.log(
        `[Orchestrator] Project is ${isV2 ? "V2 (has " + v2Steps.length + " steps)" : "V1 (phases)"}`,
      );

      // Map Supabase project to our Project type
      const phases = result.roadmap?.phases || result.roadmap || [];
      const project: Project = {
        id: result.id,
        goal: result.goal,
        status: result.status || "active",
        current_phase: result.current_phase || 1,
        current_substep: result.current_substep || 1,
        phases: phases,
        roadmap: { phases: phases }, // CRITICAL: Keep both structures in sync
        history: [],
        created_at: result.created_at,
        updated_at: result.updated_at,
        completed_substeps: result.completed_substeps || [],
        // ✅ V2: Add steps and current_step if this is a V2 project
        ...(isV2
          ? { steps: v2Steps, current_step: result.current_step || 1 }
          : {}),
      } as any;

      // Cache in memory
      projects.set(projectId, project);

      return project;
    } catch (error) {
      console.error("[Orchestrator] Error loading from Supabase:", error);
      return undefined;
    }
  }

  /**
   * Get project (check cache first, then Supabase)
   */
  async getProjectAsync(projectId: string): Promise<Project | undefined> {
    // Check memory cache first
    if (projects.has(projectId)) {
      return projects.get(projectId);
    }

    // Load from Supabase
    return this.loadProjectFromSupabase(projectId);
  }

  /**
   * Clear cached project (forces fresh load from Supabase on next get)
   */
  clearProjectCache(projectId: string): void {
    projects.delete(projectId);
    console.log(`[Orchestrator] Cleared cache for project: ${projectId}`);
  }

  /**
   * Get all projects
   */
  async getAllProjects(): Promise<Project[]> {
    return Array.from(projects.values());
  }
}
