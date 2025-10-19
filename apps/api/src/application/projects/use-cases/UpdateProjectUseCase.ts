import { inject, injectable } from "tsyringe";
import { TYPES } from "../../../di/types";
import { IProjectRepository } from "../../../domain/projects/repositories/IProjectRepository";
import { ILogger } from "../../../infrastructure/logging/ILogger";
import { IUseCase } from "../../shared/interfaces/IUseCase";
import { UpdateProjectDto } from "../dto/UpdateProjectDto";
import { ProjectDto } from "../dto/ProjectDto";
import {
  EntityNotFoundError,
  ValidationError,
} from "../../../shared/errors/DomainError";
import { ProjectGoal } from "../../../domain/projects/value-objects/ProjectGoal";
import { ProjectStatus } from "../../../domain/projects/value-objects/ProjectStatus";

/**
 * Update Project Use Case
 *
 * Updates an existing project's properties (goal, status, etc.)
 */
@injectable()
export class UpdateProjectUseCase
  implements IUseCase<UpdateProjectDto, ProjectDto>
{
  constructor(
    @inject(TYPES.ProjectRepository)
    private projectRepository: IProjectRepository,
    @inject(TYPES.Logger) private logger: ILogger,
  ) {}

  async execute(dto: UpdateProjectDto): Promise<ProjectDto> {
    this.logger.info("Updating project", { projectId: dto.projectId });

    // Find the project
    const project = await this.projectRepository.findById(dto.projectId);

    if (!project) {
      this.logger.warn("Project not found for update", {
        projectId: dto.projectId,
      });
      throw new EntityNotFoundError("Project", dto.projectId);
    }

    // Update goal if provided
    if (dto.hasGoal()) {
      try {
        const newGoal = ProjectGoal.create(dto.goal!);
        project.changeGoal(newGoal);
        this.logger.info("Project goal updated", {
          projectId: dto.projectId,
          newGoal: dto.goal,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw error;
      }
    }

    // Update status if provided
    if (dto.hasStatus()) {
      const newStatus = ProjectStatus.create(dto.status!);

      // Apply appropriate status change method
      if (newStatus.isActive()) {
        project.resume();
      } else if (newStatus.isPaused()) {
        project.pause();
      } else if (newStatus.isArchived()) {
        project.archive();
      }
      // Note: We don't allow manually setting to 'completed' as that's handled by business logic

      this.logger.info("Project status updated", {
        projectId: dto.projectId,
        newStatus: dto.status,
      });
    }

    // Persist the changes
    await this.projectRepository.update(project);

    this.logger.info("Project updated successfully", {
      projectId: dto.projectId,
    });

    // Return updated project DTO
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
