import { describe, it, expect } from "@jest/globals";
import { Substep } from "../Substep";

describe("Substep", () => {
  describe("constructor", () => {
    it("should create a substep with all properties", () => {
      const substep = new Substep(
        "substep-1",
        1,
        "Setup environment",
        "Install required dependencies",
        30,
        ["npm", "git"],
        false,
      );

      expect(substep.id).toBe("substep-1");
      expect(substep.number).toBe(1);
      expect(substep.title).toBe("Setup environment");
      expect(substep.description).toBe("Install required dependencies");
      expect(substep.estimatedMinutes).toBe(30);
      expect(substep.toolsNeeded).toEqual(["npm", "git"]);
      expect(substep.completed).toBe(false);
      expect(substep.completedAt).toBeUndefined();
    });

    it("should create a completed substep", () => {
      const completedAt = new Date();
      const substep = new Substep(
        "substep-1",
        1,
        "Setup environment",
        "Install required dependencies",
        30,
        ["npm", "git"],
        true,
        completedAt,
      );

      expect(substep.completed).toBe(true);
      expect(substep.completedAt).toEqual(completedAt);
    });
  });

  describe("complete", () => {
    it("should mark substep as completed", () => {
      const substep = new Substep(
        "substep-1",
        1,
        "Setup environment",
        "Install required dependencies",
        30,
        ["npm", "git"],
      );

      const beforeComplete = new Date();
      substep.complete();
      const afterComplete = new Date();

      expect(substep.completed).toBe(true);
      expect(substep.completedAt).toBeDefined();
      expect(substep.completedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeComplete.getTime(),
      );
      expect(substep.completedAt!.getTime()).toBeLessThanOrEqual(
        afterComplete.getTime(),
      );
    });

    it("should throw error when completing already completed substep", () => {
      const substep = new Substep(
        "substep-1",
        1,
        "Setup environment",
        "Install required dependencies",
        30,
        ["npm", "git"],
      );

      substep.complete();

      expect(() => substep.complete()).toThrow(
        "Substep substep-1 is already completed",
      );
    });
  });

  describe("uncomplete", () => {
    it("should mark substep as not completed", () => {
      const substep = new Substep(
        "substep-1",
        1,
        "Setup environment",
        "Install required dependencies",
        30,
        ["npm", "git"],
      );

      substep.complete();
      expect(substep.completed).toBe(true);

      substep.uncomplete();
      expect(substep.completed).toBe(false);
      expect(substep.completedAt).toBeUndefined();
    });
  });
});
