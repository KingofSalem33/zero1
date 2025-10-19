import { describe, it, expect } from "@jest/globals";
import { ProjectGoal } from "../ProjectGoal";
import { ValidationError } from "../../../../shared/errors/DomainError";

describe("ProjectGoal", () => {
  describe("create", () => {
    it("should create a valid project goal", () => {
      const goal = ProjectGoal.create("Build a task management app");

      expect(goal).toBeInstanceOf(ProjectGoal);
      expect(goal.getValue()).toBe("Build a task management app");
    });

    it("should trim whitespace from goal", () => {
      const goal = ProjectGoal.create("  Build a task management app  ");

      expect(goal.getValue()).toBe("Build a task management app");
    });

    it("should throw ValidationError when goal is too short", () => {
      expect(() => ProjectGoal.create("App")).toThrow(ValidationError);
      expect(() => ProjectGoal.create("App")).toThrow(
        "Goal must be at least 5 characters long",
      );
    });

    it("should throw ValidationError when goal is too long", () => {
      const longGoal = "a".repeat(501);

      expect(() => ProjectGoal.create(longGoal)).toThrow(ValidationError);
      expect(() => ProjectGoal.create(longGoal)).toThrow(
        "Goal must be 500 characters or less",
      );
    });

    it("should throw ValidationError when goal is empty", () => {
      expect(() => ProjectGoal.create("")).toThrow(ValidationError);
      expect(() => ProjectGoal.create("")).toThrow(
        "Goal must be at least 5 characters long",
      );
    });

    it("should throw ValidationError when goal is only whitespace", () => {
      expect(() => ProjectGoal.create("     ")).toThrow(ValidationError);
      expect(() => ProjectGoal.create("     ")).toThrow(
        "Goal must be at least 5 characters long",
      );
    });

    it("should accept goal at minimum length boundary (5 chars)", () => {
      const goal = ProjectGoal.create("Build");

      expect(goal.getValue()).toBe("Build");
    });

    it("should accept goal at maximum length boundary (500 chars)", () => {
      const longGoal = "a".repeat(500);
      const goal = ProjectGoal.create(longGoal);

      expect(goal.getValue()).toBe(longGoal);
      expect(goal.getValue().length).toBe(500);
    });
  });

  describe("equals", () => {
    it("should return true for goals with same value", () => {
      const goal1 = ProjectGoal.create("Build a task management app");
      const goal2 = ProjectGoal.create("Build a task management app");

      expect(goal1.equals(goal2)).toBe(true);
    });

    it("should return false for goals with different values", () => {
      const goal1 = ProjectGoal.create("Build a task management app");
      const goal2 = ProjectGoal.create("Build an e-commerce platform");

      expect(goal1.equals(goal2)).toBe(false);
    });

    it("should be case-sensitive", () => {
      const goal1 = ProjectGoal.create("Build a task management app");
      const goal2 = ProjectGoal.create("build a task management app");

      expect(goal1.equals(goal2)).toBe(false);
    });
  });
});
