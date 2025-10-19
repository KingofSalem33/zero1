/**
 * Substep Entity
 *
 * Represents a single actionable step within a phase
 */
export class Substep {
  constructor(
    public readonly id: string,
    public readonly number: number,
    public readonly title: string,
    public readonly description: string,
    public readonly estimatedMinutes: number,
    public readonly toolsNeeded: string[],
    private _completed: boolean = false,
    private _completedAt?: Date,
  ) {}

  get completed(): boolean {
    return this._completed;
  }

  get completedAt(): Date | undefined {
    return this._completedAt;
  }

  complete(): void {
    if (this._completed) {
      throw new Error(`Substep ${this.id} is already completed`);
    }
    this._completed = true;
    this._completedAt = new Date();
  }

  uncomplete(): void {
    this._completed = false;
    this._completedAt = undefined;
  }

  toJSON() {
    return {
      id: this.id,
      number: this.number,
      title: this.title,
      description: this.description,
      estimatedMinutes: this.estimatedMinutes,
      toolsNeeded: this.toolsNeeded,
      completed: this._completed,
      completedAt: this._completedAt?.toISOString(),
    };
  }
}
