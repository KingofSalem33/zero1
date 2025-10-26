/**
 * Project Creation Service
 *
 * Creates new projects with:
 * - AI-generated P1-P7 roadmap
 * - Phase 1 expanded with substeps
 * - Progressive revelation (only P1 unlocked initially)
 */

import type { PhaseGenerationService } from "./PhaseGenerationService";
import type { SubstepGenerationService } from "./SubstepGenerationService";
import type { Project } from "../../../engine/types";

/**
 * Progress callback for project creation
 */
export interface ProjectCreationProgress {
  phase: number;
  total: number;
  title: string;
  type: "phase_generation" | "substep_expansion";
}

export type ProgressCallback = (progress: ProjectCreationProgress) => void;

/**
 * ProjectCreationService - Handle project creation logic
 */
export class ProjectCreationService {
  constructor(
    private phaseGenerationService: PhaseGenerationService,
    private substepGenerationService: SubstepGenerationService,
  ) {}

  /**
   * Create a new project with given ID (for Supabase UUID)
   */
  async createProjectWithId(
    id: string,
    goal: string,
    onProgress?: ProgressCallback,
  ): Promise<Project> {
    console.log(`🎯 [ProjectCreationService] Creating project with ID: ${id}`);

    // Generate P1-P7 phases
    const phaseResponse = await this.phaseGenerationService.generatePhases({
      goal,
      clarification_context:
        "Initial project creation - no clarification needed.",
    });

    // Send progress updates for each phase generated
    if (onProgress) {
      phaseResponse.phases.forEach((phase, index) => {
        onProgress({
          phase: index + 1,
          total: phaseResponse.phases.length,
          title: phase.goal || `Phase ${index + 1}`,
          type: "phase_generation",
        });
      });
    }

    // Expand Phase 1 with substeps
    const phase1 = phaseResponse.phases[0];
    if (!phase1) {
      throw new Error("Failed to generate Phase 1");
    }

    const expandedPhase1 =
      await this.substepGenerationService.expandPhaseWithSubsteps(phase1, goal);

    // Send progress for substep expansion
    if (onProgress && expandedPhase1.substeps) {
      onProgress({
        phase: 1,
        total: expandedPhase1.substeps.length,
        title: `Expanded Phase 1 with ${expandedPhase1.substeps.length} substeps`,
        type: "substep_expansion",
      });
    }

    // Build project with Phase 1 expanded, rest locked
    const now = new Date().toISOString();
    const project: Project = {
      id,
      goal,
      status: "active",
      current_phase: "P1", // Use phase_id format for consistency
      current_substep: 1,
      phases: [
        // Phase 1: Fully expanded with substeps
        {
          ...expandedPhase1,
          phase_number: 1,
          expanded: true,
          locked: false,
          completed: false,
          created_at: now,
        },
        // Phase 2+: High-level only, locked
        ...phaseResponse.phases.slice(1).map((phase, index) => ({
          ...phase,
          phase_number: index + 2,
          substeps: [], // No substeps until unlocked
          expanded: false,
          locked: true,
          completed: false,
          created_at: now,
        })),
      ],
      history: [],
      created_at: now,
      updated_at: now,
    };

    console.log(
      `✅ [ProjectCreationService] Project created with ${project.phases?.length} phases`,
    );

    return project;
  }

  /**
   * Create a new project (generates new ID internally)
   */
  async createProject(goal: string): Promise<Project> {
    const id = this.generateId();
    return this.createProjectWithId(id, goal);
  }

  /**
   * Generate unique project ID
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

/**
 * Factory function to create ProjectCreationService
 */
export function createProjectCreationService(
  phaseGenerationService: PhaseGenerationService,
  substepGenerationService: SubstepGenerationService,
): ProjectCreationService {
  return new ProjectCreationService(
    phaseGenerationService,
    substepGenerationService,
  );
}
