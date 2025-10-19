/**
 * Create Project DTO
 *
 * Data Transfer Object for creating a new project
 */
export class CreateProjectDto {
  constructor(
    public readonly goal: string,
    public readonly userId?: string,
  ) {}

  static fromRequest(body: any): CreateProjectDto {
    return new CreateProjectDto(body.goal, body.userId);
  }
}

/**
 * Project DTO (Response)
 */
export class ProjectDto {
  constructor(
    public readonly id: string,
    public readonly goal: string,
    public readonly status: string,
    public readonly currentPhase: number,
    public readonly currentSubstep: number,
    public readonly phases: any[],
    public readonly createdAt: string,
    public readonly updatedAt: string,
    public readonly userId?: string,
  ) {}
}
