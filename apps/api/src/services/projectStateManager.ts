/**
 * ProjectStateManager - Single source of truth for all project state changes
 *
 * This service ensures that roadmap phases, locks, completion flags, and
 * current pointers stay consistent across all operations.
 */

import type {
  Project,
  ProjectPhase,
  ProjectSubstep,
  SubstepCompletionResult,
} from "../engine/types";
import { supabase } from "../db";
import type { StepOrchestrator } from "../engine/orchestrator";

// Type definitions for state updates
export interface ProjectStateUpdate {
  completeSubstep?: {
    phase: string; // e.g., "P1"
    substep: number; // e.g., 2
  };
  advanceSubstep?: boolean; // Advance to next UNCOMPLETED substep (AI mode)
  advanceSubstepSequential?: boolean; // Advance to next substep number (manual mode)
  advancePhase?: boolean;
  unlockPhase?: string; // e.g., "P2"
  addCompletionResult?: SubstepCompletionResult;
}

export interface NormalizedProjectState {
  current_phase: number | string;
  current_substep: number;
  roadmap: {
    phases: ProjectPhase[];
  };
  completed_substeps: SubstepCompletionResult[];
}

export interface StateChangeEvent {
  projectId: string;
  previousState: {
    current_phase: number | string;
    current_substep: number;
  };
  newState: NormalizedProjectState;
  changes: {
    substepCompleted?: { phase: string; substep: number };
    phaseCompleted?: string | number;
    phaseUnlocked?: string;
    advanced?: boolean;
  };
}

type StateChangeListener = (event: StateChangeEvent) => void | Promise<void>;

export class ProjectStateManager {
  private orchestrator: StepOrchestrator;
  private listeners: StateChangeListener[] = [];

  constructor(orchestrator: StepOrchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Register a listener for state change events
   */
  onStateChange(listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  /**
   * Apply a project update atomically
   * This ensures roadmap phases, locks, and completion flags stay consistent
   */
  async applyProjectUpdate(
    projectId: string,
    update: ProjectStateUpdate,
  ): Promise<{ state: NormalizedProjectState; summary: string }> {
    console.log(
      `[ProjectStateManager] Applying update to project ${projectId}:`,
      JSON.stringify(update, null, 2),
    );

    // 1. Load current state
    const project = await this.orchestrator.getProjectAsync(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    const previousState = {
      current_phase: project.current_phase,
      current_substep: project.current_substep,
    };

    // 2. Apply update with normalization
    const newState = this.normalizeProjectState(project, update);

    // 3. Validate consistency
    this.validateStateConsistency(newState);

    // 4. Persist atomically (both cache + DB)
    await this.persistState(projectId, newState);

    // 5. Emit event for listeners (Workshop AI, UI)
    const changes = this.detectChanges(previousState, newState, update);
    await this.emitStateChange(projectId, previousState, newState, changes);

    // 6. Build a compact summary string for downstream prompts
    const summaryParts: string[] = [];
    if (changes.substepCompleted) {
      summaryParts.push(
        `Completed ${changes.substepCompleted.phase}.${changes.substepCompleted.substep}`,
      );
    }
    if (changes.phaseCompleted) {
      summaryParts.push(`Phase ${changes.phaseCompleted} completed`);
    }
    if (changes.phaseUnlocked) {
      summaryParts.push(`Unlocked ${changes.phaseUnlocked}`);
    }
    summaryParts.push(
      `Now at ${String(newState.current_phase)}.${newState.current_substep}`,
    );
    const summary = summaryParts.join(" | ");

    console.log(
      `[ProjectStateManager] Update complete. New state: ${newState.current_phase}/${newState.current_substep}`,
    );

    return { state: newState, summary };
  }

  /**
   * Normalize project state after any update
   * Ensures phases, locks, completion flags are consistent
   */
  private normalizeProjectState(
    project: Project,
    update: ProjectStateUpdate,
  ): NormalizedProjectState {
    console.log(
      `[ProjectStateManager] normalizeProjectState - project.roadmap exists: ${!!project.roadmap}, phases count: ${project.roadmap?.phases?.length || 0}`,
    );
    console.log(
      `[ProjectStateManager] normalizeProjectState - project.phases exists: ${!!project.phases}, count: ${project.phases?.length || 0}`,
    );

    // Create a deep copy to avoid mutations
    // Check both project.roadmap.phases and project.phases for phase data
    const phases =
      project.roadmap?.phases && project.roadmap.phases.length > 0
        ? project.roadmap.phases
        : project.phases || [];

    const normalized: NormalizedProjectState = {
      current_phase: project.current_phase,
      current_substep: project.current_substep,
      roadmap: JSON.parse(JSON.stringify({ phases })),
      completed_substeps: [...(project.completed_substeps || [])],
    };

    // Apply completion result if provided
    if (update.addCompletionResult) {
      this.addCompletionResult(normalized, update.addCompletionResult);
    }

    // Mark substep as complete
    if (update.completeSubstep) {
      const { phase, substep } = update.completeSubstep;
      this.markSubstepComplete(normalized, phase, substep);
    }

    // Advance to next substep if requested (AI mode: finds next uncompleted)
    if (update.advanceSubstep) {
      this.advanceToNextSubstep(normalized);
    }

    // Advance sequentially to next substep (manual mode: just increment)
    if (update.advanceSubstepSequential) {
      this.advanceToNextSubstepSequential(normalized);
    }

    // Advance to next phase if requested
    if (update.advancePhase) {
      this.advanceToNextPhase(normalized);
    }

    // Unlock specific phase if requested
    if (update.unlockPhase) {
      this.unlockPhase(normalized, update.unlockPhase);
    }

    // Auto-complete phase if all substeps done
    this.checkPhaseCompletion(normalized);

    // Auto-unlock next phase if current phase complete
    this.checkPhaseUnlock(normalized);

    // Auto-advance into next phase's first substep when current phase completes
    // Determine if the (pre-advance) current phase is completed
    const normalizeToNumber = (val: string | number): number =>
      typeof val === "string" ? parseInt(val.replace("P", "")) : val;
    const currentPhaseNum = normalizeToNumber(normalized.current_phase);
    const currentPhaseObj = normalized.roadmap.phases.find((p) => {
      const phaseNum = normalizeToNumber(p.phase_number);
      return (
        p.phase_id === normalized.current_phase || phaseNum === currentPhaseNum
      );
    });
    if (currentPhaseObj?.completed) {
      this.advanceToNextPhase(normalized);
    }

    // Validate current_phase and current_substep are valid
    this.validateCurrentPointer(normalized);

    return normalized;
  }

  /**
   * Add a completion result to the list
   */
  private addCompletionResult(
    state: NormalizedProjectState,
    result: SubstepCompletionResult,
  ): void {
    // Avoid duplicates
    const exists = state.completed_substeps.some(
      (r) =>
        r.phase_number === result.phase_number &&
        r.substep_number === result.substep_number,
    );

    if (!exists) {
      state.completed_substeps.push(result);
    }
  }

  /**
   * Mark a specific substep as complete in the roadmap
   */
  private markSubstepComplete(
    state: NormalizedProjectState,
    phaseId: string,
    substepNumber: number,
  ): void {
    const phase = state.roadmap.phases.find((p) => p.phase_id === phaseId);
    if (!phase) {
      console.warn(
        `[ProjectStateManager] Phase ${phaseId} not found in roadmap`,
      );
      return;
    }

    const substep = phase.substeps?.find(
      (s) => s.step_number === substepNumber,
    );
    if (!substep) {
      console.warn(
        `[ProjectStateManager] Substep ${substepNumber} not found in phase ${phaseId}`,
      );
      return;
    }

    // Mark substep as complete in roadmap
    substep.completed = true;

    // Add to completed_substeps array for persistence and GET endpoint
    const completionResult = {
      phase_number: phase.phase_number,
      substep_number: substepNumber,
      completed_at: new Date().toISOString(),
    };
    this.addCompletionResult(state, completionResult);

    console.log(
      `[ProjectStateManager] Marked ${phaseId} substep ${substepNumber} as complete`,
    );
  }

  /**
   * Advance to the next substep sequentially (for manual checkbox completion)
   * Simply increments substep number by 1, regardless of completion status
   */
  private advanceToNextSubstepSequential(state: NormalizedProjectState): void {
    const currentPhaseNum =
      typeof state.current_phase === "string"
        ? parseInt(state.current_phase.replace("P", ""))
        : state.current_phase;

    const currentPhase = state.roadmap.phases.find(
      (p) => p.phase_number === currentPhaseNum,
    );
    if (!currentPhase) {
      console.log(
        `[ProjectStateManager] Cannot advance: phase ${currentPhaseNum} not found`,
      );
      return;
    }

    // Find the next substep by step_number (just increment by 1)
    const nextSubstep = currentPhase.substeps?.find(
      (s) => s.step_number === state.current_substep + 1,
    );

    if (nextSubstep) {
      state.current_substep = nextSubstep.step_number;
      console.log(
        `[ProjectStateManager] ✅ Advanced sequentially to substep ${nextSubstep.step_number}`,
      );
    } else {
      // No more substeps in this phase
      console.log(
        `[ProjectStateManager] ⚠️ No more substeps in phase ${state.current_phase}`,
      );
    }
  }

  /**
   * Advance to the next substep within the current phase (AI mode)
   * Finds next UNCOMPLETED substep (may skip completed ones)
   */
  private advanceToNextSubstep(state: NormalizedProjectState): void {
    // Normalize current_phase to a number for comparison
    const currentPhaseNum =
      typeof state.current_phase === "string"
        ? parseInt(state.current_phase.replace("P", ""))
        : state.current_phase;

    // Find phase by phase_number (not phase_id) since current_phase might be a number
    const currentPhase = state.roadmap.phases.find(
      (p) => p.phase_number === currentPhaseNum,
    );
    if (!currentPhase) {
      console.log(
        `[ProjectStateManager] Cannot advance: phase with phase_number ${currentPhaseNum} not found`,
      );
      return;
    }

    console.log(
      `[ProjectStateManager] Looking for next substep after ${state.current_substep} in phase ${currentPhaseNum}`,
    );
    console.log(
      `[ProjectStateManager] Total substeps: ${currentPhase.substeps?.length}`,
    );
    console.log(
      `[ProjectStateManager] Completed substeps:`,
      state.completed_substeps,
    );

    // Find next uncompleted substep in current phase
    // Check against completed_substeps array instead of substep.completed property
    const nextSubstep = currentPhase.substeps?.find((s) => {
      const isCompleted = state.completed_substeps.some(
        (cs) =>
          cs.phase_number === currentPhaseNum &&
          cs.substep_number === s.step_number,
      );
      console.log(
        `[ProjectStateManager] Substep ${s.step_number}: step_number=${s.step_number}, current=${state.current_substep}, isCompleted=${isCompleted}`,
      );
      return s.step_number > state.current_substep && !isCompleted;
    });

    if (nextSubstep) {
      state.current_substep = nextSubstep.step_number;
      console.log(
        `[ProjectStateManager] ✅ Advanced to substep ${nextSubstep.step_number}`,
      );
    } else {
      console.log(
        `[ProjectStateManager] ⚠️ No more substeps in phase ${state.current_phase}`,
      );
    }
  }

  /**
   * Advance to the next phase
   */
  private advanceToNextPhase(state: NormalizedProjectState): void {
    const currentPhaseNum =
      typeof state.current_phase === "string"
        ? parseInt(state.current_phase.replace("P", ""))
        : state.current_phase;
    const nextPhaseId = `P${currentPhaseNum + 1}`;

    const nextPhase = state.roadmap.phases.find(
      (p) => p.phase_id === nextPhaseId,
    );

    if (nextPhase && !nextPhase.locked) {
      state.current_phase = nextPhaseId;
      state.current_substep = 1;
      console.log(`[ProjectStateManager] Advanced to phase ${nextPhaseId}`);
    } else {
      console.log(
        `[ProjectStateManager] Cannot advance to phase ${nextPhaseId} (locked or not found)`,
      );
    }
  }

  /**
   * Unlock a specific phase
   */
  private unlockPhase(state: NormalizedProjectState, phaseId: string): void {
    const phase = state.roadmap.phases.find((p) => p.phase_id === phaseId);
    if (phase) {
      phase.locked = false;
      console.log(`[ProjectStateManager] Unlocked phase ${phaseId}`);
    }
  }

  /**
   * Check if current phase is complete (all substeps done)
   * If yes, mark phase as complete
   */
  private checkPhaseCompletion(state: NormalizedProjectState): void {
    const normalizeToNumber = (val: string | number): number =>
      typeof val === "string" ? parseInt(val.replace("P", "")) : val;

    const currentPhaseNum = normalizeToNumber(state.current_phase);
    const currentPhase = state.roadmap.phases.find((p) => {
      const phaseNum = normalizeToNumber(p.phase_number);
      return p.phase_id === state.current_phase || phaseNum === currentPhaseNum;
    });

    if (!currentPhase || !currentPhase.substeps) return;

    const allSubstepsComplete = currentPhase.substeps.every((s) => s.completed);

    if (allSubstepsComplete && !currentPhase.completed) {
      currentPhase.completed = true;
      console.log(
        `[ProjectStateManager] Phase ${state.current_phase} is now complete`,
      );
    }
  }

  /**
   * Check if next phase should be unlocked
   * If current phase is complete, unlock next phase
   */
  private checkPhaseUnlock(state: NormalizedProjectState): void {
    const normalizeToNumber = (val: string | number): number =>
      typeof val === "string" ? parseInt(val.replace("P", "")) : val;

    const currentPhaseNum = normalizeToNumber(state.current_phase);
    const currentPhase = state.roadmap.phases.find((p) => {
      const phaseNum = normalizeToNumber(p.phase_number);
      return p.phase_id === state.current_phase || phaseNum === currentPhaseNum;
    });

    if (!currentPhase || !currentPhase.completed) return;

    // Unlock next phase
    const nextPhaseId = `P${currentPhaseNum + 1}`;
    const nextPhase = state.roadmap.phases.find(
      (p) => p.phase_id === nextPhaseId,
    );

    if (nextPhase && nextPhase.locked) {
      nextPhase.locked = false;
      console.log(
        `[ProjectStateManager] Auto-unlocked phase ${nextPhaseId} (previous phase complete)`,
      );
    }
  }

  /**
   * Validate that current_phase and current_substep point to valid locations
   */
  private validateCurrentPointer(state: NormalizedProjectState): void {
    // current_phase can be either phase_id (string like "P1") or phase_number (number like 1)
    console.log(
      `[ProjectStateManager] Validating current_phase: ${state.current_phase} (type: ${typeof state.current_phase})`,
    );
    console.log(
      `[ProjectStateManager] Available phases:`,
      state.roadmap.phases.map((p) => ({
        phase_id: p.phase_id,
        phase_number: p.phase_number,
      })),
    );

    // Normalize both current_phase and phase_number to numbers for comparison
    // This handles cases where one might be string "1" and other is number 1
    const normalizeToNumber = (val: string | number): number => {
      if (typeof val === "string") {
        // Handle both "P1" and "1" formats
        return parseInt(val.replace("P", ""));
      }
      return val;
    };

    const currentPhaseNum = normalizeToNumber(state.current_phase);

    const currentPhase = state.roadmap.phases.find((p) => {
      const phaseNum = normalizeToNumber(p.phase_number);
      return p.phase_id === state.current_phase || phaseNum === currentPhaseNum;
    });

    if (!currentPhase) {
      throw new Error(
        `Invalid state: current_phase ${state.current_phase} (normalized: ${currentPhaseNum}) not found in roadmap. Available phases: ${state.roadmap.phases.map((p) => `${p.phase_id}(${p.phase_number}, type: ${typeof p.phase_number})`).join(", ")}`,
      );
    }

    const currentSubstep = currentPhase.substeps?.find(
      (s) => s.step_number === state.current_substep,
    );

    if (!currentSubstep) {
      throw new Error(
        `Invalid state: current_substep ${state.current_substep} not found in phase ${state.current_phase}`,
      );
    }
  }

  /**
   * Validate overall state consistency
   */
  private validateStateConsistency(state: NormalizedProjectState): void {
    // Check that completed phases are marked correctly
    for (const phase of state.roadmap.phases) {
      if (phase.substeps) {
        const allComplete = phase.substeps.every((s) => s.completed);
        if (allComplete && !phase.completed) {
          console.warn(
            `[ProjectStateManager] Warning: Phase ${phase.phase_id} has all substeps complete but phase not marked complete`,
          );
        }
      }
    }

    // Check that locked phases come after unlocked phases
    let foundLocked = false;
    for (const phase of state.roadmap.phases) {
      if (phase.locked) {
        foundLocked = true;
      } else if (foundLocked) {
        console.warn(
          `[ProjectStateManager] Warning: Phase ${phase.phase_id} is unlocked but previous phase was locked`,
        );
      }
    }
  }

  /**
   * Persist state to both cache and database atomically
   */
  private async persistState(
    projectId: string,
    state: NormalizedProjectState,
  ): Promise<void> {
    // Update in-memory cache (orchestrator)
    const project = await this.orchestrator.getProjectAsync(projectId);
    if (project) {
      project.current_phase = state.current_phase;
      project.current_substep = state.current_substep;
      project.roadmap = state.roadmap;
      project.completed_substeps = state.completed_substeps;
    }

    // Update database
    const { error } = await supabase
      .from("projects")
      .update({
        current_phase: state.current_phase,
        current_substep: state.current_substep,
        roadmap: state.roadmap,
        completed_substeps: state.completed_substeps,
      })
      .eq("id", projectId);

    if (error) {
      throw new Error(`Failed to persist state: ${error.message}`);
    }

    console.log(`[ProjectStateManager] State persisted to DB and cache`);
  }

  /**
   * Detect what changed between states
   */
  private detectChanges(
    previousState: { current_phase: number | string; current_substep: number },
    newState: NormalizedProjectState,
    update: ProjectStateUpdate,
  ): StateChangeEvent["changes"] {
    const changes: StateChangeEvent["changes"] = {};

    if (update.completeSubstep) {
      changes.substepCompleted = update.completeSubstep;
    }

    const normalizeToNumber = (val: string | number): number =>
      typeof val === "string" ? parseInt(val.replace("P", "")) : val;
    const prevPhaseNum = normalizeToNumber(previousState.current_phase);
    const prevPhase = newState.roadmap.phases.find((p) => {
      const phaseNum = normalizeToNumber(p.phase_number);
      return (
        p.phase_id === previousState.current_phase || phaseNum === prevPhaseNum
      );
    });
    if (prevPhase?.completed) {
      changes.phaseCompleted = previousState.current_phase;
    }

    if (update.unlockPhase) {
      changes.phaseUnlocked = update.unlockPhase;
    }

    if (
      previousState.current_phase !== newState.current_phase ||
      previousState.current_substep !== newState.current_substep
    ) {
      changes.advanced = true;
    }

    return changes;
  }

  /**
   * Emit state change event to all listeners
   */
  private async emitStateChange(
    projectId: string,
    previousState: { current_phase: number | string; current_substep: number },
    newState: NormalizedProjectState,
    changes: StateChangeEvent["changes"],
  ): Promise<void> {
    const event: StateChangeEvent = {
      projectId,
      previousState,
      newState,
      changes,
    };

    // Call all listeners
    await Promise.all(
      this.listeners.map(async (listener) => {
        try {
          await listener(event);
        } catch (error) {
          console.error(
            "[ProjectStateManager] Error in state change listener:",
            error,
          );
        }
      }),
    );
  }

  /**
   * Get current substep details
   */
  getCurrentSubstep(state: NormalizedProjectState): ProjectSubstep | null {
    const currentPhase = state.roadmap.phases.find(
      (p) => p.phase_id === state.current_phase,
    );

    if (!currentPhase) return null;

    return (
      currentPhase.substeps?.find(
        (s) => s.step_number === state.current_substep,
      ) || null
    );
  }

  /**
   * Get previous substep details (useful for celebration messages)
   */
  getPreviousSubstep(
    state: NormalizedProjectState,
    phaseId?: string,
    substepNumber?: number,
  ): ProjectSubstep | null {
    const targetPhase = phaseId || state.current_phase;
    const targetSubstep = substepNumber || state.current_substep - 1;

    const phase = state.roadmap.phases.find((p) => p.phase_id === targetPhase);
    if (!phase) return null;

    return phase.substeps?.find((s) => s.step_number === targetSubstep) || null;
  }
}
