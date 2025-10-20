/**
 * Service Factory
 *
 * Creates and wires together all domain services with proper dependencies.
 * Provides singleton instances for the entire application.
 */

import { ProjectStateManager } from "../../../services/projectStateManager";
import { phaseGenerationService } from "./PhaseGenerationService";
import { substepGenerationService } from "./SubstepGenerationService";
import { createProjectCreationService } from "./ProjectCreationService";
import { createCompletionService } from "./CompletionService";
import { createExecutionService } from "./ExecutionService";
import type { StepOrchestrator } from "../../../engine/orchestrator";

/**
 * Service container holds all initialized services
 */
export class ServiceContainer {
  // Services
  public readonly phaseGeneration = phaseGenerationService;
  public readonly substepGeneration = substepGenerationService;
  public readonly projectCreation = createProjectCreationService(
    phaseGenerationService,
    substepGenerationService,
  );

  // These require orchestrator instance, so they're created lazily
  private completionService: ReturnType<typeof createCompletionService> | null =
    null;
  private executionService: ReturnType<typeof createExecutionService> | null =
    null;

  /**
   * Initialize services that depend on orchestrator
   */
  initialize(orchestrator: StepOrchestrator): void {
    const stateManager = new ProjectStateManager(orchestrator);

    // Create completion service
    this.completionService = createCompletionService(
      stateManager,
      (projectId: string) => orchestrator.getProjectAsync(projectId),
    );

    // Create execution service
    this.executionService = createExecutionService(
      this.completionService,
      (projectId: string) => orchestrator.getProjectAsync(projectId),
    );

    console.log("✅ [ServiceContainer] All services initialized");
  }

  /**
   * Get completion service (throws if not initialized)
   */
  get completion() {
    if (!this.completionService) {
      throw new Error(
        "ServiceContainer not initialized. Call initialize(orchestrator) first.",
      );
    }
    return this.completionService;
  }

  /**
   * Get execution service (throws if not initialized)
   */
  get execution() {
    if (!this.executionService) {
      throw new Error(
        "ServiceContainer not initialized. Call initialize(orchestrator) first.",
      );
    }
    return this.executionService;
  }
}

/**
 * Global service container instance
 */
export const services = new ServiceContainer();
