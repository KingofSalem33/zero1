/**
 * Test App Helper
 *
 * Creates an Express app instance for integration testing
 */

import "reflect-metadata";
import express, { Express } from "express";
import { container } from "tsyringe";
import { TYPES } from "../../di/types";
import { IProjectRepository } from "../../domain/projects/repositories/IProjectRepository";
import { InMemoryProjectRepository } from "../../infrastructure/persistence/in-memory/InMemoryProjectRepository";
import { ILogger } from "../../infrastructure/logging/ILogger";
import { MockLogger } from "../../infrastructure/logging/__tests__/MockLogger";
import { createProjectsRouter } from "../../presentation/http/routes/projects.v2.routes";
import { errorHandler } from "../../presentation/http/middleware/ErrorHandler";

// Use Cases
import { CreateProjectUseCase } from "../../application/projects/use-cases/CreateProjectUseCase";
import { GetProjectByIdUseCase } from "../../application/projects/use-cases/GetProjectByIdUseCase";
import { UpdateProjectUseCase } from "../../application/projects/use-cases/UpdateProjectUseCase";
import { CompleteSubstepUseCase } from "../../application/projects/use-cases/CompleteSubstepUseCase";

// Shared repository instance for all tests
let sharedRepository: InMemoryProjectRepository | null = null;

/**
 * Initialize test DI container
 */
function initializeTestContainer(): void {
  // Create shared repository if it doesn't exist
  if (!sharedRepository) {
    sharedRepository = new InMemoryProjectRepository();
  }

  // Clear any existing registrations
  container.clearInstances();

  // Register test implementations
  container.register<ILogger>(TYPES.Logger, {
    useClass: MockLogger,
  });

  container.registerInstance<IProjectRepository>(
    TYPES.ProjectRepository,
    sharedRepository,
  );

  // Register use cases
  container.register(TYPES.CreateProjectUseCase, {
    useClass: CreateProjectUseCase,
  });
  container.register(TYPES.GetProjectByIdUseCase, {
    useClass: GetProjectByIdUseCase,
  });
  container.register(TYPES.UpdateProjectUseCase, {
    useClass: UpdateProjectUseCase,
  });
  container.register(TYPES.CompleteSubstepUseCase, {
    useClass: CompleteSubstepUseCase,
  });
}

/**
 * Create a test Express app with in-memory repository
 */
export function createTestApp(): Express {
  // Initialize test container
  initializeTestContainer();

  const app = express();

  // Body parsing
  app.use(express.json());

  // API Routes (v2)
  app.use("/api/v2/projects", createProjectsRouter());

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });

  // Centralized error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Get the in-memory repository for test assertions
 */
export function getTestRepository(): InMemoryProjectRepository {
  if (!sharedRepository) {
    throw new Error("Test repository not initialized");
  }
  return sharedRepository;
}
