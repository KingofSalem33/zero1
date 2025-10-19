import "reflect-metadata";
import { container } from "tsyringe";
import { TYPES } from "./types";

// Configuration
import { IConfig } from "../shared/config/IConfig";
import { EnvConfig } from "../shared/config/EnvConfig";

// Logging
import { ILogger } from "../infrastructure/logging/ILogger";
import { PinoLogger } from "../infrastructure/logging/PinoLogger";

// Persistence
import { SupabaseClient } from "../infrastructure/persistence/supabase/SupabaseClient";
import { IProjectRepository } from "../domain/projects/repositories/IProjectRepository";
import { SupabaseProjectRepository } from "../infrastructure/persistence/supabase/repositories/SupabaseProjectRepository";

// Use Cases
import { CreateProjectUseCase } from "../application/projects/use-cases/CreateProjectUseCase";
import { GetProjectByIdUseCase } from "../application/projects/use-cases/GetProjectByIdUseCase";
import { UpdateProjectUseCase } from "../application/projects/use-cases/UpdateProjectUseCase";

/**
 * Dependency Injection Container Configuration
 *
 * Registers all dependencies and their implementations
 */
export class DIContainer {
  static initialize(): void {
    // Configuration
    container.register<IConfig>(TYPES.Config, {
      useClass: EnvConfig,
    });

    // Logging
    container.register<ILogger>(TYPES.Logger, {
      useClass: PinoLogger,
    });

    // Database
    container.registerSingleton<SupabaseClient>(
      TYPES.SupabaseClient,
      SupabaseClient,
    );

    // Repositories
    container.register<IProjectRepository>(TYPES.ProjectRepository, {
      useClass: SupabaseProjectRepository,
    });

    // Use Cases
    container.register(TYPES.CreateProjectUseCase, {
      useClass: CreateProjectUseCase,
    });
    container.register(TYPES.GetProjectByIdUseCase, {
      useClass: GetProjectByIdUseCase,
    });
    container.register(TYPES.UpdateProjectUseCase, {
      useClass: UpdateProjectUseCase,
    });
  }

  static getContainer() {
    return container;
  }
}

// Initialize container on module load
DIContainer.initialize();

export { container };
