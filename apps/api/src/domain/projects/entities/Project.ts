import { Phase } from "./Phase";
import { ProjectGoal } from "../value-objects/ProjectGoal";
import { ProjectStatus } from "../value-objects/ProjectStatus";
import { BusinessRuleViolation } from "../../../shared/errors/DomainError";

/**
 * Project Aggregate Root
 *
 * Main domain entity representing a zero-to-one project
 */
export class Project {
  constructor(
    public readonly id: string,
    private _goal: ProjectGoal,
    private _status: ProjectStatus,
    private _phases: Phase[] = [],
    private _currentPhaseNumber: number = 0,
    private _currentSubstepNumber: number = 1,
    public readonly createdAt: Date = new Date(),
    private _updatedAt: Date = new Date(),
    public readonly userId?: string,
  ) {}

  get goal(): ProjectGoal {
    return this._goal;
  }

  get status(): ProjectStatus {
    return this._status;
  }

  get phases(): ReadonlyArray<Phase> {
    return this._phases;
  }

  get currentPhaseNumber(): number {
    return this._currentPhaseNumber;
  }

  get currentSubstepNumber(): number {
    return this._currentSubstepNumber;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  addPhase(phase: Phase): void {
    this._phases.push(phase);
    this.touch();
  }

  getCurrentPhase(): Phase | null {
    return (
      this._phases.find((p) => p.phaseNumber === this._currentPhaseNumber) ||
      null
    );
  }

  getCurrentSubstep() {
    const currentPhase = this.getCurrentPhase();
    if (!currentPhase || currentPhase.substeps.length === 0) {
      return null;
    }
    return currentPhase.substeps[this._currentSubstepNumber - 1] || null;
  }

  changeGoal(newGoal: ProjectGoal): void {
    this._goal = newGoal;
    this.touch();
  }

  moveToNextSubstep(): void {
    const currentPhase = this.getCurrentPhase();
    if (!currentPhase) {
      throw new BusinessRuleViolation(
        "Cannot move to next substep: no current phase",
        "NO_CURRENT_PHASE",
      );
    }

    this._currentSubstepNumber++;

    // Check if we've completed all substeps in current phase
    if (this._currentSubstepNumber > currentPhase.substeps.length) {
      this.moveToNextPhase();
    }

    this.touch();
  }

  moveToNextPhase(): void {
    const currentPhase = this.getCurrentPhase();

    // Complete current phase
    if (currentPhase && currentPhase.areAllSubstepsCompleted()) {
      currentPhase.complete();
    }

    // Move to next phase
    this._currentPhaseNumber++;
    this._currentSubstepNumber = 1;

    // Check if project is complete (all phases done)
    if (
      this._currentPhaseNumber >= this._phases.length &&
      this.areAllPhasesCompleted()
    ) {
      this._status = ProjectStatus.completed();
    }

    this.touch();
  }

  completeSubstep(phaseNumber: number, substepNumber: number): void {
    const phase = this._phases.find((p) => p.phaseNumber === phaseNumber);

    if (!phase) {
      throw new BusinessRuleViolation(
        `Phase ${phaseNumber} not found`,
        "PHASE_NOT_FOUND",
      );
    }

    const substep = phase.substeps[substepNumber - 1];

    if (!substep) {
      throw new BusinessRuleViolation(
        `Substep ${substepNumber} not found in phase ${phaseNumber}`,
        "SUBSTEP_NOT_FOUND",
      );
    }

    substep.complete();

    // Auto-advance if this is the current substep
    if (
      phaseNumber === this._currentPhaseNumber &&
      substepNumber === this._currentSubstepNumber
    ) {
      this.moveToNextSubstep();
    }

    this.touch();
  }

  expandPhase(phaseNumber: number): void {
    const phase = this._phases.find((p) => p.phaseNumber === phaseNumber);

    if (!phase) {
      throw new BusinessRuleViolation(
        `Phase ${phaseNumber} not found`,
        "PHASE_NOT_FOUND",
      );
    }

    if (phase.locked) {
      phase.unlock();
    }

    this.touch();
  }

  complete(): void {
    if (!this.areAllPhasesCompleted()) {
      throw new BusinessRuleViolation(
        "Cannot complete project: not all phases completed",
        "PHASES_INCOMPLETE",
      );
    }

    this._status = ProjectStatus.completed();
    this.touch();
  }

  archive(): void {
    this._status = ProjectStatus.archived();
    this.touch();
  }

  pause(): void {
    this._status = ProjectStatus.paused();
    this.touch();
  }

  resume(): void {
    this._status = ProjectStatus.active();
    this.touch();
  }

  areAllPhasesCompleted(): boolean {
    return this._phases.length > 0 && this._phases.every((p) => p.completed);
  }

  getOverallProgress(): number {
    if (this._phases.length === 0) return 0;

    const totalProgress = this._phases.reduce(
      (sum, phase) => sum + phase.getProgress(),
      0,
    );
    return totalProgress / this._phases.length;
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      goal: this._goal.getValue(),
      status: this._status.getValue(),
      phases: this._phases.map((p) => p.toJSON()),
      currentPhase: this._currentPhaseNumber,
      currentSubstep: this._currentSubstepNumber,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      userId: this.userId,
    };
  }
}
