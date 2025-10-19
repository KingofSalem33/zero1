import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { CreateProjectUseCase } from "../../../application/projects/use-cases/CreateProjectUseCase";
import { CreateProjectDto } from "../../../application/projects/dto/CreateProjectDto";
import { TYPES } from "../../../di/types";
import { ValidationError } from "../../../shared/errors/DomainError";
import { BadRequestError } from "../../../shared/errors/HttpError";

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

  // TODO: Add other methods (getById, update, delete, etc.)
}
