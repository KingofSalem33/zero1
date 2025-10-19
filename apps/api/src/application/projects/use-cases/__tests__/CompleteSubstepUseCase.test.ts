import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { CompleteSubstepUseCase } from "../CompleteSubstepUseCase";
import { CompleteSubstepDto } from "../../dto/CompleteSubstepDto";
import { InMemoryProjectRepository } from "../../../../infrastructure/persistence/in-memory/InMemoryProjectRepository";
import { MockLogger } from "../../../../infrastructure/logging/__tests__/MockLogger";
import {
  EntityNotFoundError,
  BusinessRuleViolation,
} from "../../../../shared/errors/DomainError";
import { Project } from "../../../../domain/projects/entities/Project";
import { ProjectGoal } from "../../../../domain/projects/value-objects/ProjectGoal";
import { ProjectStatus } from "../../../../domain/projects/value-objects/ProjectStatus";
import { Phase } from "../../../../domain/projects/entities/Phase";
import { Substep } from "../../../../domain/projects/entities/Substep";

describe("CompleteSubstepUseCase", () => {
  let useCase: CompleteSubstepUseCase;
  let repository: InMemoryProjectRepository;
  let logger: MockLogger;
  let testProject: Project;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    logger = new MockLogger();

    // Spy on logger methods
    jest.spyOn(logger, "info");
    jest.spyOn(logger, "warn");

    useCase = new CompleteSubstepUseCase(repository, logger);

    // Create a test project with multiple phases and substeps
    const goal = ProjectGoal.create("Build a task management app");
    const status = ProjectStatus.active();

    // Phase 0 with 2 substeps
    const phase0Substeps = [
      new Substep(
        "substep-0-1",
        1,
        "Extract problem",
        "Analyze the problem",
        15,
        ["whiteboard"],
      ),
      new Substep(
        "substep-0-2",
        2,
        "Write vision",
        "Create vision statement",
        20,
        ["document"],
      ),
    ];

    const phase0 = new Phase(
      "phase-0",
      0,
      "Define Vision",
      "Craft your vision statement",
      "Define what you want to build",
      phase0Substeps,
      true,
      false,
      false,
    );

    // Phase 1 with 2 substeps
    const phase1Substeps = [
      new Substep(
        "substep-1-1",
        1,
        "Select stack",
        "Choose technology stack",
        30,
        ["research"],
      ),
      new Substep(
        "substep-1-2",
        2,
        "Install tools",
        "Set up development environment",
        45,
        ["terminal"],
      ),
    ];

    const phase1 = new Phase(
      "phase-1",
      1,
      "Build Environment",
      "Set up your development environment",
      "Get ready to code",
      phase1Substeps,
      false,
      true,
      false,
    );

    testProject = new Project(
      "project-123",
      goal,
      status,
      [phase0, phase1],
      0, // Current phase 0
      1, // Current substep 1
      new Date("2025-01-01"),
      new Date("2025-01-01"),
      "user-123",
    );
  });

  describe("execute", () => {
    it("should complete a substep successfully", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 0, 1);
      const result = await useCase.execute(dto);

      expect(result).toBeDefined();
      expect(result.id).toBe("project-123");

      // Verify substep is completed
      const completedSubstep = result.phases[0].substeps[0];
      expect(completedSubstep.completed).toBe(true);
      expect(completedSubstep.completedAt).toBeDefined();
    });

    it("should auto-advance to next substep when completing current substep", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 0, 1);
      const result = await useCase.execute(dto);

      // Should auto-advance from substep 1 to substep 2
      expect(result.currentPhase).toBe(0);
      expect(result.currentSubstep).toBe(2);
    });

    it("should auto-advance to next phase when completing last substep of phase", async () => {
      await repository.save(testProject);

      // Complete first substep
      const dto1 = new CompleteSubstepDto("project-123", 0, 1);
      await useCase.execute(dto1);

      // Complete second (last) substep of phase 0
      const dto2 = new CompleteSubstepDto("project-123", 0, 2);
      const result = await useCase.execute(dto2);

      // Should auto-advance to phase 1, substep 1
      expect(result.currentPhase).toBe(1);
      expect(result.currentSubstep).toBe(1);

      // Phase 0 should be marked as completed
      expect(result.phases[0].completed).toBe(true);
    });

    it("should mark project as completed when all substeps are done", async () => {
      await repository.save(testProject);

      // Complete all substeps in phase 0
      await useCase.execute(new CompleteSubstepDto("project-123", 0, 1));
      await useCase.execute(new CompleteSubstepDto("project-123", 0, 2));

      // Complete all substeps in phase 1
      await useCase.execute(new CompleteSubstepDto("project-123", 1, 1));
      const result = await useCase.execute(
        new CompleteSubstepDto("project-123", 1, 2),
      );

      // Project should be marked as completed
      expect(result.status).toBe("completed");
      expect(result.phases[0].completed).toBe(true);
      expect(result.phases[1].completed).toBe(true);
    });

    it("should allow completing substeps out of order", async () => {
      await repository.save(testProject);

      // Complete substep 2 before substep 1 (out of order)
      const dto = new CompleteSubstepDto("project-123", 0, 2);
      const result = await useCase.execute(dto);

      // Substep 2 should be completed
      expect(result.phases[0].substeps[1].completed).toBe(true);

      // Current substep should not auto-advance (because we didn't complete current substep)
      expect(result.currentPhase).toBe(0);
      expect(result.currentSubstep).toBe(1);
    });

    it("should throw EntityNotFoundError when project does not exist", async () => {
      const dto = new CompleteSubstepDto("non-existent-id", 0, 1);

      await expect(useCase.execute(dto)).rejects.toThrow(EntityNotFoundError);
      await expect(useCase.execute(dto)).rejects.toThrow(
        "Project with id non-existent-id not found",
      );
    });

    it("should throw BusinessRuleViolation when phase does not exist", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 99, 1);

      await expect(useCase.execute(dto)).rejects.toThrow(BusinessRuleViolation);
      await expect(useCase.execute(dto)).rejects.toThrow("Phase 99 not found");
    });

    it("should throw BusinessRuleViolation when substep does not exist", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 0, 99);

      await expect(useCase.execute(dto)).rejects.toThrow(BusinessRuleViolation);
      await expect(useCase.execute(dto)).rejects.toThrow(
        "Substep 99 not found in phase 0",
      );
    });

    it("should persist changes to repository", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 0, 1);
      await useCase.execute(dto);

      // Verify changes were persisted
      const updatedProject = await repository.findById("project-123");
      expect(updatedProject).toBeDefined();
      expect(updatedProject!.currentSubstepNumber).toBe(2);
      expect(updatedProject!.phases[0].substeps[0].completed).toBe(true);
    });

    it("should log completion successfully", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 0, 1);
      await useCase.execute(dto);

      expect(logger.info).toHaveBeenCalledWith(
        "Completing substep",
        expect.objectContaining({
          projectId: "project-123",
          phaseNumber: 0,
          substepNumber: 1,
        }),
      );

      expect(logger.info).toHaveBeenCalledWith(
        "Substep completed successfully",
        expect.objectContaining({
          projectId: "project-123",
          phaseNumber: 0,
          substepNumber: 1,
          newCurrentPhase: 0,
          newCurrentSubstep: 2,
        }),
      );
    });

    it("should log warning when substep completion fails", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 99, 1);

      await expect(useCase.execute(dto)).rejects.toThrow();

      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to complete substep",
        expect.objectContaining({
          projectId: "project-123",
          phaseNumber: 99,
          substepNumber: 1,
        }),
      );
    });

    it("should update project updatedAt timestamp", async () => {
      await repository.save(testProject);

      const originalUpdatedAt = testProject.updatedAt;

      // Wait a tick to ensure time has passed
      await new Promise((resolve) => setTimeout(resolve, 10));

      const dto = new CompleteSubstepDto("project-123", 0, 1);
      const result = await useCase.execute(dto);

      const resultUpdatedAt = new Date(result.updatedAt);
      expect(resultUpdatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });

    it("should return complete project DTO with all phases and substeps", async () => {
      await repository.save(testProject);

      const dto = new CompleteSubstepDto("project-123", 0, 1);
      const result = await useCase.execute(dto);

      expect(result.id).toBe("project-123");
      expect(result.goal).toBe("Build a task management app");
      expect(result.status).toBe("active");
      expect(result.currentPhase).toBe(0);
      expect(result.currentSubstep).toBe(2);
      expect(result.phases).toHaveLength(2);
      expect(result.phases[0].substeps).toHaveLength(2);
      expect(result.phases[1].substeps).toHaveLength(2);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
      expect(result.userId).toBe("user-123");
    });

    it("should throw error when completing already completed substep", async () => {
      await repository.save(testProject);

      // Complete substep once
      const dto = new CompleteSubstepDto("project-123", 0, 1);
      await useCase.execute(dto);

      // Trying to complete same substep again should throw error
      await expect(useCase.execute(dto)).rejects.toThrow(
        "Substep substep-0-1 is already completed",
      );
    });
  });

  describe("CompleteSubstepDto", () => {
    it("should create DTO from request body", () => {
      const dto = CompleteSubstepDto.fromRequest("project-123", {
        phaseNumber: 0,
        substepNumber: 1,
      });

      expect(dto.projectId).toBe("project-123");
      expect(dto.phaseNumber).toBe(0);
      expect(dto.substepNumber).toBe(1);
    });
  });
});
