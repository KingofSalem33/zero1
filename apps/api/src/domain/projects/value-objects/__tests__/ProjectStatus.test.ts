import { describe, it, expect } from "@jest/globals";
import { ProjectStatus } from "../ProjectStatus";

describe("ProjectStatus", () => {
  describe("create", () => {
    it("should create active status", () => {
      const status = ProjectStatus.create("active");

      expect(status).toBeInstanceOf(ProjectStatus);
      expect(status.getValue()).toBe("active");
    });

    it("should create completed status", () => {
      const status = ProjectStatus.create("completed");

      expect(status.getValue()).toBe("completed");
    });

    it("should create archived status", () => {
      const status = ProjectStatus.create("archived");

      expect(status.getValue()).toBe("archived");
    });

    it("should create paused status", () => {
      const status = ProjectStatus.create("paused");

      expect(status.getValue()).toBe("paused");
    });

    it("should handle uppercase input", () => {
      const status = ProjectStatus.create("ACTIVE");

      expect(status.getValue()).toBe("active");
    });

    it("should handle mixed case input", () => {
      const status = ProjectStatus.create("CoMpLeTeD");

      expect(status.getValue()).toBe("completed");
    });

    it("should throw error for invalid status", () => {
      expect(() => ProjectStatus.create("invalid")).toThrow(
        "Invalid project status: invalid",
      );
    });

    it("should throw error for empty string", () => {
      expect(() => ProjectStatus.create("")).toThrow(
        "Invalid project status: ",
      );
    });
  });

  describe("factory methods", () => {
    it("should create active status via static method", () => {
      const status = ProjectStatus.active();

      expect(status.getValue()).toBe("active");
    });

    it("should create completed status via static method", () => {
      const status = ProjectStatus.completed();

      expect(status.getValue()).toBe("completed");
    });

    it("should create archived status via static method", () => {
      const status = ProjectStatus.archived();

      expect(status.getValue()).toBe("archived");
    });

    it("should create paused status via static method", () => {
      const status = ProjectStatus.paused();

      expect(status.getValue()).toBe("paused");
    });
  });

  describe("isActive", () => {
    it("should return true for active status", () => {
      const status = ProjectStatus.active();

      expect(status.isActive()).toBe(true);
    });

    it("should return false for non-active status", () => {
      expect(ProjectStatus.completed().isActive()).toBe(false);
      expect(ProjectStatus.paused().isActive()).toBe(false);
      expect(ProjectStatus.archived().isActive()).toBe(false);
    });
  });

  describe("isCompleted", () => {
    it("should return true for completed status", () => {
      const status = ProjectStatus.completed();

      expect(status.isCompleted()).toBe(true);
    });

    it("should return false for non-completed status", () => {
      expect(ProjectStatus.active().isCompleted()).toBe(false);
      expect(ProjectStatus.paused().isCompleted()).toBe(false);
      expect(ProjectStatus.archived().isCompleted()).toBe(false);
    });
  });

  describe("isPaused", () => {
    it("should return true for paused status", () => {
      const status = ProjectStatus.paused();

      expect(status.isPaused()).toBe(true);
    });

    it("should return false for non-paused status", () => {
      expect(ProjectStatus.active().isPaused()).toBe(false);
      expect(ProjectStatus.completed().isPaused()).toBe(false);
      expect(ProjectStatus.archived().isPaused()).toBe(false);
    });
  });

  describe("isArchived", () => {
    it("should return true for archived status", () => {
      const status = ProjectStatus.archived();

      expect(status.isArchived()).toBe(true);
    });

    it("should return false for non-archived status", () => {
      expect(ProjectStatus.active().isArchived()).toBe(false);
      expect(ProjectStatus.completed().isArchived()).toBe(false);
      expect(ProjectStatus.paused().isArchived()).toBe(false);
    });
  });

  describe("equals", () => {
    it("should return true for same status values", () => {
      const status1 = ProjectStatus.active();
      const status2 = ProjectStatus.active();

      expect(status1.equals(status2)).toBe(true);
    });

    it("should return false for different status values", () => {
      const status1 = ProjectStatus.active();
      const status2 = ProjectStatus.completed();

      expect(status1.equals(status2)).toBe(false);
    });
  });

  describe("toString", () => {
    it("should return string representation", () => {
      expect(ProjectStatus.active().toString()).toBe("active");
      expect(ProjectStatus.completed().toString()).toBe("completed");
      expect(ProjectStatus.paused().toString()).toBe("paused");
      expect(ProjectStatus.archived().toString()).toBe("archived");
    });
  });
});
