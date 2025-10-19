import { Substep } from "./Substep";

/**
 * Phase Entity
 *
 * Represents a major phase in a project (P0-P7)
 */
export class Phase {
  constructor(
    public readonly id: string,
    public readonly phaseNumber: number,
    public readonly title: string,
    public readonly description: string,
    public readonly goal: string,
    private _substeps: Substep[] = [],
    private _expanded: boolean = false,
    private _locked: boolean = true,
    private _completed: boolean = false,
    public readonly createdAt: Date = new Date(),
    private _completedAt?: Date,
  ) {}

  get substeps(): ReadonlyArray<Substep> {
    return this._substeps;
  }

  get expanded(): boolean {
    return this._expanded;
  }

  get locked(): boolean {
    return this._locked;
  }

  get completed(): boolean {
    return this._completed;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  addSubstep(substep: Substep): void {
    if (this._locked) {
      throw new Error(`Cannot add substep to locked phase ${this.id}`);
    }
    this._substeps.push(substep);
  }

  expand(substeps: Substep[]): void {
    if (this._expanded) {
      throw new Error(`Phase ${this.id} is already expanded`);
    }
    this._substeps = substeps;
    this._expanded = true;
  }

  unlock(): void {
    this._locked = false;
  }

  lock(): void {
    this._locked = true;
  }

  complete(): void {
    if (!this.areAllSubstepsCompleted()) {
      throw new Error(
        `Cannot complete phase ${this.id}: not all substeps completed`,
      );
    }
    this._completed = true;
    this._completedAt = new Date();
  }

  areAllSubstepsCompleted(): boolean {
    return (
      this._substeps.length > 0 && this._substeps.every((s) => s.completed)
    );
  }

  getCompletedSubstepsCount(): number {
    return this._substeps.filter((s) => s.completed).length;
  }

  getProgress(): number {
    if (this._substeps.length === 0) return 0;
    return (this.getCompletedSubstepsCount() / this._substeps.length) * 100;
  }

  toJSON() {
    return {
      id: this.id,
      phaseNumber: this.phaseNumber,
      title: this.title,
      description: this.description,
      goal: this.goal,
      substeps: this._substeps.map((s) => s.toJSON()),
      expanded: this._expanded,
      locked: this._locked,
      completed: this._completed,
      createdAt: this.createdAt.toISOString(),
      completedAt: this._completedAt?.toISOString(),
    };
  }
}
