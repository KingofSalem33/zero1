import { inject, injectable } from "tsyringe";
import { TYPES } from "../../../di/types";
import { IProjectRepository } from "../../../domain/projects/repositories/IProjectRepository";
import { ILogger } from "../../../infrastructure/logging/ILogger";
import { IUseCase } from "../../shared/interfaces/IUseCase";
import { CompleteSubstepDto } from "../dto/CompleteSubstepDto";
import { ProjectDto } from "../dto/ProjectDto";
import {
  EntityNotFoundError,
  BusinessRuleViolation,
} from "../../../shared/errors/DomainError";

/**
 * Complete Substep Use Case
 *
 * Marks a substep as completed and handles auto-advancement logic
 */
@injectable()
export class CompleteSubstepUseCase
  implements IUseCase<CompleteSubstepDto, ProjectDto>
{
  constructor(
    @inject(TYPES.ProjectRepository)
    private projectRepository: IProjectRepository,
    @inject(TYPES.Logger) private logger: ILogger,
  ) {}

  async execute(dto: CompleteSubstepDto): Promise<ProjectDto> {
    this.logger.info("Completing substep", {
      projectId: dto.projectId,
      phaseNumber: dto.phaseNumber,
      substepNumber: dto.substepNumber,
    });

    // Find the project
    const project = await this.projectRepository.findById(dto.projectId);

    if (!project) {
      this.logger.warn("Project not found for substep completion", {
        projectId: dto.projectId,
      });
      throw new EntityNotFoundError("Project", dto.projectId);
    }

    // Complete the substep (this handles auto-advancement)
    try {
      project.completeSubstep(dto.phaseNumber, dto.substepNumber);
      this.logger.info("Substep completed successfully", {
        projectId: dto.projectId,
        phaseNumber: dto.phaseNumber,
        substepNumber: dto.substepNumber,
        newCurrentPhase: project.currentPhaseNumber,
        newCurrentSubstep: project.currentSubstepNumber,
      });
    } catch (error) {
      if (error instanceof BusinessRuleViolation) {
        this.logger.warn("Failed to complete substep", {
          projectId: dto.projectId,
          phaseNumber: dto.phaseNumber,
          substepNumber: dto.substepNumber,
          error: error.message,
        });
        throw error;
      }
      throw error;
    }

    // Persist the changes
    await this.projectRepository.update(project);

    this.logger.info("Project updated after substep completion", {
      projectId: dto.projectId,
      currentStatus: project.status.getValue(),
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
