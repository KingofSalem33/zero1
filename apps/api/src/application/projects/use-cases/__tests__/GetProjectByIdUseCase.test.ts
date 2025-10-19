import { describe, it, expect, beforeEach } from "@jest/globals";
import { GetProjectByIdUseCase } from "../GetProjectByIdUseCase";
import { InMemoryProjectRepository } from "../../../../infrastructure/persistence/in-memory/InMemoryProjectRepository";
import { MockLogger } from "../../../../infrastructure/logging/__tests__/MockLogger";
import { EntityNotFoundError } from "../../../../shared/errors/DomainError";
import { Project } from "../../../../domain/projects/entities/Project";
import { ProjectGoal } from "../../../../domain/projects/value-objects/ProjectGoal";
import { ProjectStatus } from "../../../../domain/projects/value-objects/ProjectStatus";
import { Phase } from "../../../../domain/projects/entities/Phase";
import { Substep } from "../../../../domain/projects/entities/Substep";

describe("GetProjectByIdUseCase", () => {
  let useCase: GetProjectByIdUseCase;
  let repository: InMemoryProjectRepository;
  let logger: MockLogger;
  let testProject: Project;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    logger = new MockLogger();
    useCase = new GetProjectByIdUseCase(repository, logger);

    // Create a test project with phases and substeps
    const goal = ProjectGoal.create("Build a task management app");
    const status = ProjectStatus.active();

    const substeps = [
      new Substep(
        "substep-1",
        1,
        "Extract problem",
        "Analyze the problem",
        15,
        ["whiteboard"],
      ),
      new Substep(
        "substep-2",
        2,
        "Write vision",
        "Create vision statement",
        20,
        ["document"],
      ),
    ];

    const phase = new Phase(
      "phase-0",
      0,
      "Define Vision",
      "Craft your vision statement",
      "Define what you want to build",
      substeps,
      true,
      false,
      false,
    );

    testProject = new Project(
      "project-123",
      goal,
      status,
      [phase],
      0,
      1,
      new Date("2025-01-01"),
      new Date("2025-01-01"),
      "user-123",
    );
  });

  describe("execute", () => {
    it("should return project when found by ID", async () => {
      await repository.save(testProject);

      const result = await useCase.execute("project-123");

      expect(result).toBeDefined();
      expect(result.id).toBe("project-123");
      expect(result.goal).toBe("Build a task management app");
      expect(result.status).toBe("active");
      expect(result.userId).toBe("user-123");
    });

    it("should return project with phases and substeps", async () => {
      await repository.save(testProject);

      const result = await useCase.execute("project-123");

      expect(result.phases).toHaveLength(1);
      expect(result.phases[0].phaseNumber).toBe(0);
      expect(result.phases[0].title).toBe("Define Vision");
      expect(result.phases[0].substeps).toHaveLength(2);
      expect(result.phases[0].substeps[0].title).toBe("Extract problem");
    });

    it("should return current phase and substep numbers", async () => {
      await repository.save(testProject);

      const result = await useCase.execute("project-123");

      expect(result.currentPhase).toBe(0);
      expect(result.currentSubstep).toBe(1);
    });

    it("should return timestamps as ISO strings", async () => {
      await repository.save(testProject);

      const result = await useCase.execute("project-123");

      expect(result.createdAt).toBe("2025-01-01T00:00:00.000Z");
      expect(result.updatedAt).toBe("2025-01-01T00:00:00.000Z");
    });

    it("should throw EntityNotFoundError when project does not exist", async () => {
      await expect(useCase.execute("non-existent-id")).rejects.toThrow(
        EntityNotFoundError,
      );
      await expect(useCase.execute("non-existent-id")).rejects.toThrow(
        "Project with id non-existent-id not found",
      );
    });

    it("should log when fetching project", async () => {
      await repository.save(testProject);

      await useCase.execute("project-123");

      expect(logger.infoCalls).toHaveLength(2);
      expect(logger.infoCalls[0].message).toBe("Fetching project by ID");
      expect(logger.infoCalls[0].context).toEqual({ projectId: "project-123" });
    });

    it("should log when project is found", async () => {
      await repository.save(testProject);

      await useCase.execute("project-123");

      expect(logger.infoCalls[1].message).toBe("Project found successfully");
      expect(logger.infoCalls[1].context).toEqual({ projectId: "project-123" });
    });

    it("should log warning when project is not found", async () => {
      try {
        await useCase.execute("non-existent-id");
      } catch {
        // Expected to throw
      }

      expect(logger.warnCalls).toHaveLength(1);
      expect(logger.warnCalls[0].message).toBe("Project not found");
      expect(logger.warnCalls[0].context).toEqual({
        projectId: "non-existent-id",
      });
    });

    it("should handle project without phases", async () => {
      const simpleProject = new Project(
        "simple-123",
        ProjectGoal.create("Simple project"),
        ProjectStatus.active(),
        [],
        0,
        1,
      );

      await repository.save(simpleProject);

      const result = await useCase.execute("simple-123");

      expect(result.phases).toEqual([]);
    });

    it("should handle project without userId", async () => {
      const noUserProject = new Project(
        "no-user-123",
        ProjectGoal.create("Project without user"),
        ProjectStatus.active(),
      );

      await repository.save(noUserProject);

      const result = await useCase.execute("no-user-123");

      expect(result.userId).toBeUndefined();
    });

    it("should return completed substep with completedAt timestamp", async () => {
      const completedDate = new Date("2025-01-15T12:00:00Z");
      const completedSubstep = new Substep(
        "completed-substep",
        1,
        "Completed task",
        "This is done",
        30,
        [],
        true,
        completedDate,
      );

      const phaseWithCompletedSubstep = new Phase(
        "phase-completed",
        0,
        "Test Phase",
        "Test description",
        "Test goal",
        [completedSubstep],
        true,
        false,
        false,
      );

      const projectWithCompleted = new Project(
        "completed-project",
        ProjectGoal.create("Test project"),
        ProjectStatus.active(),
        [phaseWithCompletedSubstep],
      );

      await repository.save(projectWithCompleted);

      const result = await useCase.execute("completed-project");

      expect(result.phases[0].substeps[0].completed).toBe(true);
      expect(result.phases[0].substeps[0].completedAt).toBe(
        "2025-01-15T12:00:00.000Z",
      );
    });
  });
});
