import { injectable, inject } from "tsyringe";
import { IUseCase } from "../../shared/interfaces/IUseCase";
import { CreateProjectDto, ProjectDto } from "../dto/CreateProjectDto";
import { IProjectRepository } from "../../../domain/projects/repositories/IProjectRepository";
import { Project } from "../../../domain/projects/entities/Project";
import { ProjectGoal } from "../../../domain/projects/value-objects/ProjectGoal";
import { ProjectStatus } from "../../../domain/projects/value-objects/ProjectStatus";
import { ILogger } from "../../../infrastructure/logging/ILogger";
import { TYPES } from "../../../di/types";
import { randomUUID } from "crypto";

/**
 * Create Project Use Case
 *
 * Creates a new project with initial phase structure.
 * This is Phase 1 of the refactoring - currently creates project without AI-generated phases.
 * Phase expansion will be added in later iterations.
 */
@injectable()
export class CreateProjectUseCase
  implements IUseCase<CreateProjectDto, ProjectDto>
{
  constructor(
    @inject(TYPES.ProjectRepository)
    private projectRepository: IProjectRepository,

    @inject(TYPES.Logger)
    private logger: ILogger,
  ) {}

  async execute(dto: CreateProjectDto): Promise<ProjectDto> {
    this.logger.info("Creating new project", { goal: dto.goal });

    try {
      // 1. Create value objects
      const goal = ProjectGoal.create(dto.goal);
      const status = ProjectStatus.active();

      // 2. Create project entity
      const project = new Project(
        randomUUID(),
        goal,
        status,
        [], // Phases will be generated asynchronously
        0,
        1,
        new Date(),
        new Date(),
        dto.userId,
      );

      // 3. Persist to database
      await this.projectRepository.save(project);

      this.logger.info("Project created successfully", {
        projectId: project.id,
        goal: dto.goal,
      });

      // 4. Return DTO
      return this.toDto(project);
    } catch (error) {
      this.logger.error("Failed to create project", error as Error, {
        goal: dto.goal,
      });
      throw error;
    }
  }

  private toDto(project: Project): ProjectDto {
    const json = project.toJSON();

    return new ProjectDto(
      json.id,
      json.goal,
      json.status,
      json.currentPhase,
      json.currentSubstep,
      json.phases,
      json.createdAt,
      json.updatedAt,
      json.userId,
    );
  }
}
