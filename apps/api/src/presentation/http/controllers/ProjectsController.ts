import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { CreateProjectUseCase } from "../../../application/projects/use-cases/CreateProjectUseCase";
import { GetProjectByIdUseCase } from "../../../application/projects/use-cases/GetProjectByIdUseCase";
import { UpdateProjectUseCase } from "../../../application/projects/use-cases/UpdateProjectUseCase";
import { CompleteSubstepUseCase } from "../../../application/projects/use-cases/CompleteSubstepUseCase";
import { CreateProjectDto } from "../../../application/projects/dto/CreateProjectDto";
import { UpdateProjectDto } from "../../../application/projects/dto/UpdateProjectDto";
import { CompleteSubstepDto } from "../../../application/projects/dto/CompleteSubstepDto";
import { TYPES } from "../../../di/types";
import {
  ValidationError,
  EntityNotFoundError,
  BusinessRuleViolation,
} from "../../../shared/errors/DomainError";
import {
  BadRequestError,
  NotFoundError,
} from "../../../shared/errors/HttpError";

/**
 * Projects HTTP Controller
 *
 * Handles HTTP requests for project-related operations
 */
@injectable()
export class ProjectsController {
  constructor(
    @inject(TYPES.CreateProjectUseCase)
    private createProjectUseCase: CreateProjectUseCase,
    @inject(TYPES.GetProjectByIdUseCase)
    private getProjectByIdUseCase: GetProjectByIdUseCase,
    @inject(TYPES.UpdateProjectUseCase)
    private updateProjectUseCase: UpdateProjectUseCase,
    @inject(TYPES.CompleteSubstepUseCase)
    private completeSubstepUseCase: CompleteSubstepUseCase,
  ) {}

  /**
   * POST /api/projects - Create a new project
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const dto = CreateProjectDto.fromRequest(req.body);

      const project = await this.createProjectUseCase.execute(dto);

      res.status(201).json({
        ok: true,
        project,
        message: "Project created successfully",
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        next(new BadRequestError(error.message));
      } else {
        next(error);
      }
    }
  }

  /**
   * GET /api/projects/:id - Get project by ID
   */
  async getById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;

      const project = await this.getProjectByIdUseCase.execute(id);

      res.status(200).json({
        ok: true,
        project,
      });
    } catch (error) {
      if (error instanceof EntityNotFoundError) {
        next(new NotFoundError(error.message));
      } else {
        next(error);
      }
    }
  }

  /**
   * PUT /api/projects/:id - Update project
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const dto = UpdateProjectDto.fromRequest(id, req.body);

      const project = await this.updateProjectUseCase.execute(dto);

      res.status(200).json({
        ok: true,
        project,
        message: "Project updated successfully",
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        next(new BadRequestError(error.message));
      } else if (error instanceof EntityNotFoundError) {
        next(new NotFoundError(error.message));
      } else {
        next(error);
      }
    }
  }

  /**
   * POST /api/projects/:id/complete-substep - Complete a substep
   */
  async completeSubstep(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id } = req.params;
      const dto = CompleteSubstepDto.fromRequest(id, req.body);

      const project = await this.completeSubstepUseCase.execute(dto);

      res.status(200).json({
        ok: true,
        project,
        message: "Substep completed successfully",
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        next(new BadRequestError(error.message));
      } else if (error instanceof EntityNotFoundError) {
        next(new NotFoundError(error.message));
      } else if (error instanceof BusinessRuleViolation) {
        next(new BadRequestError(error.message));
      } else {
        next(error);
      }
    }
  }

  // TODO: Add other methods (delete, etc.)
}
