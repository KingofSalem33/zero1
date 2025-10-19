import { describe, it, expect, beforeEach } from "@jest/globals";
import { Project } from "../Project";
import { Phase } from "../Phase";
import { Substep } from "../Substep";
import { ProjectGoal } from "../../value-objects/ProjectGoal";
import { ProjectStatus } from "../../value-objects/ProjectStatus";
import { BusinessRuleViolation } from "../../../../shared/errors/DomainError";

describe("Project", () => {
  let project: Project;
  let goal: ProjectGoal;
  let status: ProjectStatus;
  let phases: Phase[];

  beforeEach(() => {
    goal = ProjectGoal.create("Build a task management app");
    status = ProjectStatus.active();

    const substepsP0 = [
      new Substep("s-p0-1", 1, "Extract problem", "Analyze problem", 15, []),
      new Substep("s-p0-2", 2, "Write vision", "Create vision", 20, []),
    ];
    const substepsP1 = [
      new Substep("s-p1-1", 1, "Choose stack", "Select technologies", 30, []),
      new Substep("s-p1-2", 2, "Setup environment", "Install tools", 45, []),
    ];

    phases = [
      new Phase(
        "phase-0",
        0,
        "Define Vision",
        "Craft your vision statement",
        "Define what you want to build",
        substepsP0,
        true,
        false,
        false,
      ),
      new Phase(
        "phase-1",
        1,
        "Build Environment",
        "Set up your development environment",
        "Get tools ready",
        substepsP1,
        true,
        true,
        false,
      ),
    ];

    project = new Project(
      "project-1",
      goal,
      status,
      phases,
      0,
      1,
      new Date("2025-01-01"),
      new Date("2025-01-01"),
      "user-123",
    );
  });

  describe("constructor", () => {
    it("should create a project with all properties", () => {
      expect(project.id).toBe("project-1");
      expect(project.goal).toBe(goal);
      expect(project.status).toBe(status);
      expect(project.phases).toEqual(phases);
      expect(project.currentPhaseNumber).toBe(0);
      expect(project.currentSubstepNumber).toBe(1);
      expect(project.userId).toBe("user-123");
    });
  });

  describe("getCurrentPhase", () => {
    it("should return the current phase", () => {
      const currentPhase = project.getCurrentPhase();

      expect(currentPhase).toBe(phases[0]);
      expect(currentPhase?.phaseNumber).toBe(0);
    });

    it("should return null when no phases exist", () => {
      const emptyProject = new Project("project-2", goal, status, [], 0, 1);

      expect(emptyProject.getCurrentPhase()).toBeNull();
    });
  });

  describe("getCurrentSubstep", () => {
    it("should return the current substep", () => {
      const currentSubstep = project.getCurrentSubstep();

      expect(currentSubstep).toBeDefined();
      expect(currentSubstep?.number).toBe(1);
      expect(currentSubstep?.title).toBe("Extract problem");
    });

    it("should return null when current phase has no substeps", () => {
      const emptyPhase = new Phase(
        "phase-2",
        2,
        "Empty Phase",
        "Empty description",
        "Empty goal",
      );
      const projectWithEmptyPhase = new Project(
        "project-3",
        goal,
        status,
        [emptyPhase],
        2,
        1,
      );

      expect(projectWithEmptyPhase.getCurrentSubstep()).toBeNull();
    });
  });

  describe("completeSubstep", () => {
    it("should complete a substep and auto-advance to next", () => {
      expect(project.currentSubstepNumber).toBe(1);

      project.completeSubstep(0, 1);

      expect(phases[0].substeps[0].completed).toBe(true);
      expect(project.currentSubstepNumber).toBe(2);
    });

    it("should throw error when phase not found", () => {
      expect(() => project.completeSubstep(99, 1)).toThrow(
        BusinessRuleViolation,
      );
      expect(() => project.completeSubstep(99, 1)).toThrow(
        "Phase 99 not found",
      );
    });

    it("should advance to next phase when completing last substep", () => {
      project.completeSubstep(0, 1);
      project.completeSubstep(0, 2);

      expect(project.currentPhaseNumber).toBe(1);
      expect(project.currentSubstepNumber).toBe(1);
    });

    it("should mark project as completed when completing last substep of last phase", () => {
      // Complete all substeps in phase 0
      project.completeSubstep(0, 1);
      project.completeSubstep(0, 2);

      // Complete all substeps in phase 1
      project.completeSubstep(1, 1);
      project.completeSubstep(1, 2);

      expect(project.status.getValue()).toBe("completed");
    });
  });

  describe("getOverallProgress", () => {
    it("should return 0 when no phases exist", () => {
      const emptyProject = new Project("project-2", goal, status);

      expect(emptyProject.getOverallProgress()).toBe(0);
    });

    it("should return 0 when no substeps are completed", () => {
      expect(project.getOverallProgress()).toBe(0);
    });

    it("should return correct progress when some substeps are completed", () => {
      // Complete 1 substep in phase 0 (1/2 = 50%)
      phases[0].substeps[0].complete();
      // Complete 0 substeps in phase 1 (0/2 = 0%)
      // Overall: (50 + 0) / 2 = 25%

      expect(project.getOverallProgress()).toBe(25);
    });

    it("should return 100 when all substeps are completed", () => {
      phases.forEach((phase) => {
        phase.substeps.forEach((substep) => substep.complete());
      });

      expect(project.getOverallProgress()).toBe(100);
    });
  });

  describe("changeGoal", () => {
    it("should update the project goal", () => {
      const newGoal = ProjectGoal.create("Build an e-commerce platform");

      project.changeGoal(newGoal);

      expect(project.goal).toBe(newGoal);
      expect(project.goal.getValue()).toBe("Build an e-commerce platform");
    });
  });

  describe("pause", () => {
    it("should pause an active project", () => {
      project.pause();

      expect(project.status.getValue()).toBe("paused");
    });
  });

  describe("resume", () => {
    it("should resume a paused project", () => {
      project.pause();
      expect(project.status.getValue()).toBe("paused");

      project.resume();

      expect(project.status.getValue()).toBe("active");
    });
  });

  describe("archive", () => {
    it("should archive a project", () => {
      project.archive();

      expect(project.status.getValue()).toBe("archived");
    });
  });

  describe("updatedAt tracking", () => {
    it("should update the updatedAt timestamp when goal changes", async () => {
      const originalUpdatedAt = project.updatedAt;

      // Wait 10ms to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      const newGoal = ProjectGoal.create("New goal for testing");
      project.changeGoal(newGoal);

      expect(project.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
    });
  });
});
