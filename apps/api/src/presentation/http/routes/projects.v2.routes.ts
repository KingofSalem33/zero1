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

  // GET /api/projects/:id - Get project by ID
  router.get("/:id", (req, res, next) => controller.getById(req, res, next));

  // PUT /api/projects/:id - Update project
  router.put("/:id", (req, res, next) => controller.update(req, res, next));

  // POST /api/projects/:id/complete-substep - Complete a substep
  router.post("/:id/complete-substep", (req, res, next) =>
    controller.completeSubstep(req, res, next),
  );

  // TODO: Add other routes
  // router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

  return router;
}
