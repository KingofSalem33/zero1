import { inject, injectable } from "tsyringe";
import { TYPES } from "../../../di/types";
import { IProjectRepository } from "../../../domain/projects/repositories/IProjectRepository";
import { ILogger } from "../../../infrastructure/logging/ILogger";
import { IUseCase } from "../../shared/interfaces/IUseCase";
import { ProjectDto } from "../dto/ProjectDto";
import { EntityNotFoundError } from "../../../shared/errors/DomainError";

/**
 * Get Project By ID Use Case
 *
 * Retrieves a project by its unique identifier
 */
@injectable()
export class GetProjectByIdUseCase implements IUseCase<string, ProjectDto> {
  constructor(
    @inject(TYPES.ProjectRepository)
    private projectRepository: IProjectRepository,
    @inject(TYPES.Logger) private logger: ILogger,
  ) {}

  async execute(projectId: string): Promise<ProjectDto> {
    this.logger.info("Fetching project by ID", { projectId });

    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      this.logger.warn("Project not found", { projectId });
      throw new EntityNotFoundError("Project", projectId);
    }

    this.logger.info("Project found successfully", { projectId });

    return {
      id: project.id,
      goal: project.goal.getValue(),
      status: project.status.getValue(),
      currentPhase: project.currentPhaseNumber,
      currentSubstep: project.currentSubstepNumber,
      phases: project.phases.map((phase) => ({
        id: phase.id,
        phaseNumber: phase.phaseNumber,
        title: phase.title,
        description: phase.description,
        goal: phase.goal,
        expanded: phase.expanded,
        locked: phase.locked,
        completed: phase.completed,
        substeps: phase.substeps.map((substep) => ({
          id: substep.id,
          number: substep.number,
          title: substep.title,
          description: substep.description,
          estimatedMinutes: substep.estimatedMinutes,
          toolsNeeded: substep.toolsNeeded,
          completed: substep.completed,
          completedAt: substep.completedAt?.toISOString(),
        })),
      })),
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      userId: project.userId,
    };
  }
}
