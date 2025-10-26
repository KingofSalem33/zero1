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
  phaseData?: any; // The actual phase object for incremental UI updates
  substeps?: any[]; // Substeps when type is "substep_expansion"
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

    const now = new Date().toISOString();
    const phase1 = phaseResponse.phases[0];
    if (!phase1) {
      throw new Error("Failed to generate Phase 1");
    }

    // SEND P1 FIRST for immediate user feedback
    if (onProgress) {
      const phase1Data = {
        ...phase1,
        phase_number: 1,
        substeps: [], // Will be filled shortly
        expanded: false,
        locked: false,
        completed: false,
        created_at: now,
      };

      onProgress({
        phase: 1,
        total: phaseResponse.phases.length,
        title: phase1.goal || "Phase 1",
        type: "phase_generation",
        phaseData: phase1Data,
      });
    }

    // EXPAND P1 IMMEDIATELY (before sending P2-P7)
    const expandedPhase1 =
      await this.substepGenerationService.expandPhaseWithSubsteps(phase1, goal);

    // SEND P1 SUBSTEPS - User sees P1.1, P1.2, etc. right away
    if (onProgress && expandedPhase1.substeps) {
      onProgress({
        phase: 1,
        total: expandedPhase1.substeps.length,
        title: `Expanded Phase 1 with ${expandedPhase1.substeps.length} substeps`,
        type: "substep_expansion",
        phaseData: {
          ...expandedPhase1,
          phase_number: 1,
          expanded: true,
          locked: false,
          completed: false,
          created_at: now,
        },
        substeps: expandedPhase1.substeps,
      });
    }

    // NOW send P2-P7 (these fill in after user already sees P1.1)
    if (onProgress) {
      phaseResponse.phases.slice(1).forEach((phase, index) => {
        const phaseNumber = index + 2; // Starting from P2
        const phaseData = {
          ...phase,
          phase_number: phaseNumber,
          substeps: [],
          expanded: false,
          locked: true,
          completed: false,
          created_at: now,
        };

        onProgress({
          phase: phaseNumber,
          total: phaseResponse.phases.length,
          title: phase.goal || `Phase ${phaseNumber}`,
          type: "phase_generation",
          phaseData,
        });
      });
    }

    // Build project with Phase 1 expanded, rest locked
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
