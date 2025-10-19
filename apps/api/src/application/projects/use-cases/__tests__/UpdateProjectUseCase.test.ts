import { describe, it, expect, beforeEach } from "@jest/globals";
import { UpdateProjectUseCase } from "../UpdateProjectUseCase";
import { UpdateProjectDto } from "../../dto/UpdateProjectDto";
import { InMemoryProjectRepository } from "../../../../infrastructure/persistence/in-memory/InMemoryProjectRepository";
import { MockLogger } from "../../../../infrastructure/logging/__tests__/MockLogger";
import {
  EntityNotFoundError,
  ValidationError,
} from "../../../../shared/errors/DomainError";
import { Project } from "../../../../domain/projects/entities/Project";
import { ProjectGoal } from "../../../../domain/projects/value-objects/ProjectGoal";
import { ProjectStatus } from "../../../../domain/projects/value-objects/ProjectStatus";

describe("UpdateProjectUseCase", () => {
  let useCase: UpdateProjectUseCase;
  let repository: InMemoryProjectRepository;
  let logger: MockLogger;
  let testProject: Project;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    logger = new MockLogger();
    useCase = new UpdateProjectUseCase(repository, logger);

    // Create a test project
    const goal = ProjectGoal.create("Build a task management app");
    const status = ProjectStatus.active();

    testProject = new Project(
      "project-123",
      goal,
      status,
      [],
      0,
      1,
      new Date("2025-01-01"),
      new Date("2025-01-01"),
      "user-123",
    );
  });

  describe("execute", () => {
    it("should update project goal", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto(
        "project-123",
        "Build an e-commerce platform",
        undefined,
      );

      const result = await useCase.execute(dto);

      expect(result.goal).toBe("Build an e-commerce platform");
    });

    it("should update project status to paused", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", undefined, "paused");

      const result = await useCase.execute(dto);

      expect(result.status).toBe("paused");
    });

    it("should update project status to archived", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", undefined, "archived");

      const result = await useCase.execute(dto);

      expect(result.status).toBe("archived");
    });

    it("should update project status to active (resume)", async () => {
      // First pause it
      testProject.pause();
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", undefined, "active");

      const result = await useCase.execute(dto);

      expect(result.status).toBe("active");
    });

    it("should update both goal and status", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto(
        "project-123",
        "New project goal",
        "paused",
      );

      const result = await useCase.execute(dto);

      expect(result.goal).toBe("New project goal");
      expect(result.status).toBe("paused");
    });

    it("should throw EntityNotFoundError when project does not exist", async () => {
      const dto = new UpdateProjectDto("non-existent", "New goal");

      await expect(useCase.execute(dto)).rejects.toThrow(EntityNotFoundError);
      await expect(useCase.execute(dto)).rejects.toThrow(
        "Project with id non-existent not found",
      );
    });

    it("should throw ValidationError for invalid goal", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", "Bad"); // Too short

      await expect(useCase.execute(dto)).rejects.toThrow(ValidationError);
    });

    it("should throw error for invalid status", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto(
        "project-123",
        undefined,
        "invalid-status",
      );

      await expect(useCase.execute(dto)).rejects.toThrow();
    });

    it("should persist changes to repository", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", "Updated goal");

      await useCase.execute(dto);

      // Fetch the project again and verify it was updated
      const updatedProject = await repository.findById("project-123");
      expect(updatedProject?.goal.getValue()).toBe("Updated goal");
    });

    it("should log when updating project", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", "New goal");

      await useCase.execute(dto);

      expect(logger.infoCalls).toContainEqual({
        message: "Updating project",
        context: { projectId: "project-123" },
      });
    });

    it("should log when goal is updated", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", "New goal");

      await useCase.execute(dto);

      expect(logger.infoCalls).toContainEqual({
        message: "Project goal updated",
        context: { projectId: "project-123", newGoal: "New goal" },
      });
    });

    it("should log when status is updated", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", undefined, "paused");

      await useCase.execute(dto);

      expect(logger.infoCalls).toContainEqual({
        message: "Project status updated",
        context: { projectId: "project-123", newStatus: "paused" },
      });
    });

    it("should log warning when project not found", async () => {
      const dto = new UpdateProjectDto("non-existent", "New goal");

      try {
        await useCase.execute(dto);
      } catch {
        // Expected to throw
      }

      expect(logger.warnCalls).toHaveLength(1);
      expect(logger.warnCalls[0].message).toBe("Project not found for update");
    });

    it("should return updated project with all fields", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123", "Updated goal");

      const result = await useCase.execute(dto);

      expect(result.id).toBe("project-123");
      expect(result.goal).toBe("Updated goal");
      expect(result.status).toBe("active");
      expect(result.currentPhase).toBe(0);
      expect(result.currentSubstep).toBe(1);
      expect(result.userId).toBe("user-123");
      expect(result.phases).toEqual([]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it("should handle update with no changes", async () => {
      await repository.save(testProject);

      const dto = new UpdateProjectDto("project-123");

      const result = await useCase.execute(dto);

      // Project should be returned unchanged
      expect(result.goal).toBe("Build a task management app");
      expect(result.status).toBe("active");
    });
  });
});
