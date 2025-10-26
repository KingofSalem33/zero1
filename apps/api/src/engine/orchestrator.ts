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
   */
  async expandPhaseWithSubsteps(phase: any, goal: string): Promise<any> {
    return services.substepGeneration.expandPhaseWithSubsteps(phase, goal);
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
    console.log(`🎯 [Orchestrator] Expanding phase ${request.phase_id}`);

    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const phase = project.phases?.find(
      (p: any) => p.phase_id === request.phase_id,
    );
    if (!phase) {
      throw new Error("Phase not found");
    }

    // Expand the phase
    const expandedPhase = await this.expandPhaseWithSubsteps(
      phase,
      project.goal,
    );

    // Update project
    const phaseIndex = project.phases!.findIndex(
      (p: any) => p.phase_id === request.phase_id,
    );
    project.phases![phaseIndex] = {
      ...expandedPhase,
      expanded: true,
      locked: false,
    };

    projects.set(request.project_id, project);

    // Persist to Supabase
    try {
      await withRetry(async () => {
        const result = await supabase
          .from("projects")
          .update({
            roadmap: project.phases,
            updated_at: new Date().toISOString(),
          })
          .eq("id", request.project_id)
          .select()
          .single();
        return result;
      });
    } catch (err) {
      console.error("[Orchestrator] Error persisting phase expansion:", err);
    }

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

      // Map Supabase project to our Project type
      const project: Project = {
        id: result.id,
        goal: result.goal,
        status: result.status || "active",
        current_phase: result.current_phase || 1,
        current_substep: result.current_substep || 1,
        phases: result.roadmap?.phases || result.roadmap || [],
        history: [],
        created_at: result.created_at,
        updated_at: result.updated_at,
      };

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
