import { Router } from "express";
import { container } from "../../../di/Container";
import { ProjectsController } from "../controllers/ProjectsController";

/**
 * Projects Routes (v2 - Refactored)
 *
 * Uses new architecture with controllers, use cases, and DI
 */
export function createProjectsRouter(): Router {
  const router = Router();
  const controller = container.resolve(ProjectsController);

  // POST /api/projects - Create new project
  router.post("/", (req, res, next) => controller.create(req, res, next));

  // TODO: Add other routes
  // router.get('/:id', (req, res, next) => controller.getById(req, res, next));
  // router.put('/:id', (req, res, next) => controller.update(req, res, next));
  // router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

  return router;
}
