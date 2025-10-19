/**
 * ProjectStatus Value Object
 *
 * Represents valid project statuses
 */
export enum ProjectStatusEnum {
  ACTIVE = "active",
  COMPLETED = "completed",
  ARCHIVED = "archived",
  PAUSED = "paused",
}

export class ProjectStatus {
  private constructor(private readonly value: ProjectStatusEnum) {}

  static create(status: string): ProjectStatus {
    const normalizedStatus = status.toLowerCase();

    if (
      !Object.values(ProjectStatusEnum).includes(
        normalizedStatus as ProjectStatusEnum,
      )
    ) {
      throw new Error(`Invalid project status: ${status}`);
    }

    return new ProjectStatus(normalizedStatus as ProjectStatusEnum);
  }

  static active(): ProjectStatus {
    return new ProjectStatus(ProjectStatusEnum.ACTIVE);
  }

  static completed(): ProjectStatus {
    return new ProjectStatus(ProjectStatusEnum.COMPLETED);
  }

  static archived(): ProjectStatus {
    return new ProjectStatus(ProjectStatusEnum.ARCHIVED);
  }

  static paused(): ProjectStatus {
    return new ProjectStatus(ProjectStatusEnum.PAUSED);
  }

  getValue(): ProjectStatusEnum {
    return this.value;
  }

  isActive(): boolean {
    return this.value === ProjectStatusEnum.ACTIVE;
  }

  isCompleted(): boolean {
    return this.value === ProjectStatusEnum.COMPLETED;
  }

  equals(other: ProjectStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
