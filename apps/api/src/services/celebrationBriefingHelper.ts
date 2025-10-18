/**
 * Celebration & Briefing Helper
 *
 * Generates celebration messages for completed substeps and briefing for next substeps.
 * Creates visual dividers to mark chapter transitions in the conversation thread.
 */

import type { ProjectSubstep, ProjectPhase } from "../engine/types";

export interface CelebrationBriefing {
  celebration: string; // Markdown celebration for completed substep
  divider: string; // Visual separator
  briefing: string; // Briefing for next substep
}

export class CelebrationBriefingHelper {
  /**
   * Generate a complete celebration/briefing message for substep transition
   */
  generateTransitionMessage(
    completedPhase: ProjectPhase,
    completedSubstep: ProjectSubstep,
    nextPhase: ProjectPhase,
    nextSubstep: ProjectSubstep,
  ): CelebrationBriefing {
    const celebration = this.generateCelebration(
      completedPhase,
      completedSubstep,
    );
    const divider = this.generateDivider(nextPhase, nextSubstep);
    const briefing = this.generateBriefing(nextPhase, nextSubstep);

    return {
      celebration,
      divider,
      briefing,
    };
  }

  /**
   * Generate celebration message for a completed substep
   */
  private generateCelebration(
    phase: ProjectPhase,
    substep: ProjectSubstep,
  ): string {
    return `## ✅ Substep Complete!

**${phase.phase_id} → Substep ${substep.step_number}: ${substep.label}**

Great work! You've successfully completed this substep.`;
  }

  /**
   * Generate a visual divider marking the transition
   */
  private generateDivider(
    nextPhase: ProjectPhase,
    nextSubstep: ProjectSubstep,
  ): string {
    return `

---

## 📍 Now Starting: ${nextPhase.phase_id} → Substep ${nextSubstep.step_number}

**${nextSubstep.label}**

`;
  }

  /**
   * Generate briefing for the next substep
   */
  private generateBriefing(
    phase: ProjectPhase,
    substep: ProjectSubstep,
  ): string {
    // The substep's prompt_to_send contains the expert instructions
    // We'll use a simplified version for the briefing
    return `Let's move forward with the next substep. I'll guide you through ${substep.label.toLowerCase()}.`;
  }

  /**
   * Generate a simplified acknowledgment when artifact is uploaded
   */
  generateArtifactAcknowledgment(
    artifactName: string,
    substep: ProjectSubstep,
  ): string {
    return `✅ **Received:** ${artifactName}

I've analyzed your work on "${substep.label}".

When you're ready to mark this substep as complete and move to the next one, just let me know by saying something like "mark complete" or "next substep".`;
  }

  /**
   * Generate phase completion celebration
   */
  generatePhaseCompletion(
    completedPhase: ProjectPhase,
    nextPhase: ProjectPhase | null,
  ): string {
    const celebration = `## 🎉 Phase Complete!

**${completedPhase.phase_id}: ${completedPhase.goal}**

Congratulations! You've completed all substeps in this phase.`;

    if (nextPhase) {
      return `${celebration}

---

## 🚀 Next Phase Unlocked: ${nextPhase.phase_id}

**${nextPhase.goal}**

${nextPhase.why_it_matters}

Ready to begin when you are!`;
    }

    return `${celebration}

🏆 **Project Complete!** You've successfully completed all phases!`;
  }
}

export const celebrationBriefingHelper = new CelebrationBriefingHelper();
