import { ValidationError } from "../../../shared/errors/DomainError";

/**
 * ProjectGoal Value Object
 *
 * Encapsulates validation rules for project goals
 */
export class ProjectGoal {
  private static readonly MIN_LENGTH = 5;
  private static readonly MAX_LENGTH = 500;

  private constructor(private readonly value: string) {
    this.validate();
  }

  static create(goal: string): ProjectGoal {
    return new ProjectGoal(goal.trim());
  }

  private validate(): void {
    if (this.value.length < ProjectGoal.MIN_LENGTH) {
      throw new ValidationError(
        `Goal must be at least ${ProjectGoal.MIN_LENGTH} characters long`,
        "goal",
      );
    }

    if (this.value.length > ProjectGoal.MAX_LENGTH) {
      throw new ValidationError(
        `Goal must be ${ProjectGoal.MAX_LENGTH} characters or less`,
        "goal",
      );
    }

    if (!/[a-zA-Z]/.test(this.value)) {
      throw new ValidationError(
        "Goal must contain at least one letter",
        "goal",
      );
    }
  }

  getValue(): string {
    return this.value;
  }

  equals(other: ProjectGoal): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
