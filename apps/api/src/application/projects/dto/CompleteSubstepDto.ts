/**
 * Complete Substep DTO
 *
 * Data transfer object for completing a substep within a project
 */
export class CompleteSubstepDto {
  constructor(
    public readonly projectId: string,
    public readonly phaseNumber: number,
    public readonly substepNumber: number,
  ) {}

  static fromRequest(
    projectId: string,
    body: { phaseNumber: number; substepNumber: number },
  ): CompleteSubstepDto {
    return new CompleteSubstepDto(
      projectId,
      body.phaseNumber,
      body.substepNumber,
    );
  }
}
