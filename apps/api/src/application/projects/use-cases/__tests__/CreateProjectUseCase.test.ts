import { describe, it, expect, beforeEach } from "@jest/globals";
import { CreateProjectUseCase } from "../CreateProjectUseCase";
import { CreateProjectDto } from "../../dto/CreateProjectDto";
import { InMemoryProjectRepository } from "../../../../infrastructure/persistence/in-memory/InMemoryProjectRepository";
import { MockLogger } from "../../../../infrastructure/logging/__tests__/MockLogger";
import { ValidationError } from "../../../../shared/errors/DomainError";

describe("CreateProjectUseCase", () => {
  let useCase: CreateProjectUseCase;
  let repository: InMemoryProjectRepository;
  let logger: MockLogger;

  beforeEach(() => {
    repository = new InMemoryProjectRepository();
    logger = new MockLogger();
    useCase = new CreateProjectUseCase(repository, logger);
  });

  describe("execute", () => {
    it("should create a new project with valid goal", async () => {
      const dto = new CreateProjectDto(
        "Build a task management app",
        "user-123",
      );

      const result = await useCase.execute(dto);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.goal).toBe("Build a task management app");
      expect(result.status).toBe("active");
      expect(result.currentPhase).toBe(0);
      expect(result.currentSubstep).toBe(1);
      expect(result.userId).toBe("user-123");
      expect(result.phases).toEqual([]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it("should create project without userId", async () => {
      const dto = new CreateProjectDto("Build a task management app");

      const result = await useCase.execute(dto);

      expect(result.userId).toBeUndefined();
    });

    it("should save project to repository", async () => {
      const dto = new CreateProjectDto(
        "Build a task management app",
        "user-123",
      );

      await useCase.execute(dto);

      expect(repository.count()).toBe(1);
    });

    it("should generate unique IDs for multiple projects", async () => {
      const dto1 = new CreateProjectDto("Build a task management app");
      const dto2 = new CreateProjectDto("Build an e-commerce platform");

      const result1 = await useCase.execute(dto1);
      const result2 = await useCase.execute(dto2);

      expect(result1.id).not.toBe(result2.id);
      expect(repository.count()).toBe(2);
    });

    it("should log project creation", async () => {
      const dto = new CreateProjectDto(
        "Build a task management app",
        "user-123",
      );

      await useCase.execute(dto);

      expect(logger.infoCalls).toHaveLength(2);
      expect(logger.infoCalls[0].message).toBe("Creating new project");
      expect(logger.infoCalls[0].context).toEqual({
        goal: "Build a task management app",
      });
      expect(logger.infoCalls[1].message).toBe("Project created successfully");
    });

    it("should throw ValidationError when goal is too short", async () => {
      const dto = new CreateProjectDto("App");

      await expect(useCase.execute(dto)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(dto)).rejects.toThrow(
        "Goal must be at least 5 characters long",
      );
    });

    it("should throw ValidationError when goal is too long", async () => {
      const longGoal = "a".repeat(501);
      const dto = new CreateProjectDto(longGoal);

      await expect(useCase.execute(dto)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(dto)).rejects.toThrow(
        "Goal must be 500 characters or less",
      );
    });

    it("should throw ValidationError when goal is empty", async () => {
      const dto = new CreateProjectDto("");

      await expect(useCase.execute(dto)).rejects.toThrow(ValidationError);
    });

    it("should log error when project creation fails", async () => {
      const dto = new CreateProjectDto("");

      try {
        await useCase.execute(dto);
      } catch {
        // Expected to throw
      }

      expect(logger.errorCalls).toHaveLength(1);
      expect(logger.errorCalls[0].message).toBe("Failed to create project");
      expect(logger.errorCalls[0].context).toEqual({ goal: "" });
    });

    it("should not save project when validation fails", async () => {
      const dto = new CreateProjectDto("App");

      try {
        await useCase.execute(dto);
      } catch {
        // Expected to throw
      }

      expect(repository.count()).toBe(0);
    });

    it("should trim whitespace from goal", async () => {
      const dto = new CreateProjectDto("  Build a task management app  ");

      const result = await useCase.execute(dto);

      expect(result.goal).toBe("Build a task management app");
    });
  });
});
