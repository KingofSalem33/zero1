import { describe, it, expect, beforeEach } from "@jest/globals";
import { Phase } from "../Phase";
import { Substep } from "../Substep";

describe("Phase", () => {
  let phase: Phase;
  let substeps: Substep[];

  beforeEach(() => {
    phase = new Phase(
      "phase-1",
      1,
      "Define Vision",
      "Craft your vision statement",
      "Define what you want to build",
    );
    substeps = [
      new Substep(
        "substep-1",
        1,
        "Extract problem",
        "Analyze the problem",
        15,
        [],
      ),
      new Substep(
        "substep-2",
        2,
        "Write vision",
        "Create vision statement",
        20,
        [],
      ),
      new Substep(
        "substep-3",
        3,
        "Set metrics",
        "Define success metrics",
        25,
        [],
      ),
    ];
  });

  describe("constructor", () => {
    it("should create a phase with default values", () => {
      expect(phase.id).toBe("phase-1");
      expect(phase.phaseNumber).toBe(1);
      expect(phase.title).toBe("Define Vision");
      expect(phase.substeps).toEqual([]);
      expect(phase.expanded).toBe(false);
      expect(phase.locked).toBe(true);
      expect(phase.completed).toBe(false);
    });

    it("should create a phase with custom values", () => {
      const customPhase = new Phase(
        "phase-2",
        2,
        "Build Environment",
        "Set up your development environment",
        "Get tools ready",
        substeps,
        true,
        false,
        true,
      );

      expect(customPhase.substeps).toEqual(substeps);
      expect(customPhase.expanded).toBe(true);
      expect(customPhase.locked).toBe(false);
      expect(customPhase.completed).toBe(true);
    });
  });

  describe("expand", () => {
    it("should expand phase with substeps", () => {
      phase.expand(substeps);

      expect(phase.expanded).toBe(true);
      expect(phase.substeps).toEqual(substeps);
    });

    it("should throw error when expanding already expanded phase", () => {
      phase.expand(substeps);

      expect(() => phase.expand(substeps)).toThrow(
        "Phase phase-1 is already expanded",
      );
    });
  });

  describe("unlock", () => {
    it("should unlock a locked phase", () => {
      expect(phase.locked).toBe(true);

      phase.unlock();

      expect(phase.locked).toBe(false);
    });
  });

  describe("lock", () => {
    it("should lock an unlocked phase", () => {
      phase.unlock();
      expect(phase.locked).toBe(false);

      phase.lock();

      expect(phase.locked).toBe(true);
    });
  });

  describe("complete", () => {
    it("should mark phase as completed when all substeps are done", () => {
      phase.expand(substeps);
      substeps.forEach((s) => s.complete());

      phase.complete();

      expect(phase.completed).toBe(true);
    });

    it("should throw error when completing phase with incomplete substeps", () => {
      phase.expand(substeps);
      substeps[0].complete();

      expect(() => phase.complete()).toThrow(
        "Cannot complete phase phase-1: not all substeps completed",
      );
    });
  });

  describe("areAllSubstepsCompleted", () => {
    it("should return false when phase has no substeps", () => {
      expect(phase.areAllSubstepsCompleted()).toBe(false);
    });

    it("should return false when some substeps are not completed", () => {
      phase.expand(substeps);
      substeps[0].complete();

      expect(phase.areAllSubstepsCompleted()).toBe(false);
    });

    it("should return true when all substeps are completed", () => {
      phase.expand(substeps);
      substeps.forEach((s) => s.complete());

      expect(phase.areAllSubstepsCompleted()).toBe(true);
    });
  });

  describe("getProgress", () => {
    it("should return 0 when phase has no substeps", () => {
      expect(phase.getProgress()).toBe(0);
    });

    it("should return 0 when no substeps are completed", () => {
      phase.expand(substeps);

      expect(phase.getProgress()).toBe(0);
    });

    it("should return 33.33 when 1 of 3 substeps are completed", () => {
      phase.expand(substeps);
      substeps[0].complete();

      expect(phase.getProgress()).toBeCloseTo(33.33, 1);
    });

    it("should return 66.67 when 2 of 3 substeps are completed", () => {
      phase.expand(substeps);
      substeps[0].complete();
      substeps[1].complete();

      expect(phase.getProgress()).toBeCloseTo(66.67, 1);
    });

    it("should return 100 when all substeps are completed", () => {
      phase.expand(substeps);
      substeps.forEach((s) => s.complete());

      expect(phase.getProgress()).toBe(100);
    });
  });

  describe("getCompletedSubstepsCount", () => {
    it("should return 0 when no substeps are completed", () => {
      phase.expand(substeps);

      expect(phase.getCompletedSubstepsCount()).toBe(0);
    });

    it("should return correct count when some substeps are completed", () => {
      phase.expand(substeps);
      substeps[0].complete();
      substeps[2].complete();

      expect(phase.getCompletedSubstepsCount()).toBe(2);
    });
  });
});
