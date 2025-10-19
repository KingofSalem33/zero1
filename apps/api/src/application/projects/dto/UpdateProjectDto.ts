/**
 * Update Project DTO
 *
 * Data transfer object for updating an existing project
 */
export class UpdateProjectDto {
  constructor(
    public readonly projectId: string,
    public readonly goal?: string,
    public readonly status?: string,
  ) {}

  static fromRequest(
    projectId: string,
    body: { goal?: string; status?: string },
  ): UpdateProjectDto {
    return new UpdateProjectDto(projectId, body.goal, body.status);
  }

  hasGoal(): boolean {
    return this.goal !== undefined && this.goal !== null;
  }

  hasStatus(): boolean {
    return this.status !== undefined && this.status !== null;
  }
}
