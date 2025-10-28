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
    _phase: ProjectPhase,
    substep: ProjectSubstep,
  ): string {
    // The substep's prompt_to_send contains the expert instructions
    // We'll use a simplified version for the briefing
    return `Let's move forward with the next substep. I'll guide you through ${substep.label.toLowerCase()}.`;
  }

  /**
   * Generate an actionable acknowledgment when artifact is uploaded
   * Sets momentum by outlining what happens next
   */
  generateArtifactAcknowledgment(
    artifactName: string,
    substep: ProjectSubstep,
  ): string {
    // Extract key requirements from substep prompt
    const requirements = this.extractRequirements(substep);

    const message = `✅ **Received:** ${artifactName}

**Current Focus:** ${substep.label}

🔍 **Analyzing now...**
I'm checking your work against these criteria:
${requirements.map((req) => `- ${req}`).join("\n")}

⏳ **What happens next:**
1. I'll validate your deliverable meets the requirements above
2. You'll see a detailed analysis report with feedback
3. If everything looks good (100% complete), I'll automatically advance you to the next substep
4. If we need refinements, I'll tell you exactly what's missing

**While you wait:** Feel free to continue the conversation or upload another iteration. I'm working on this in the background!`;

    return message;
  }

  /**
   * Extract key requirements from substep prompt
   */
  private extractRequirements(substep: ProjectSubstep): string[] {
    const prompt = substep.prompt_to_send || "";

    // Try to extract bullet points or numbered requirements from the prompt
    const bulletPattern = /^[\s]*[-•*]\s+(.+)$/gm;
    const numberedPattern = /^[\s]*\d+\.\s+(.+)$/gm;

    const requirements: string[] = [];

    // Extract bullet points
    let match;
    while ((match = bulletPattern.exec(prompt)) !== null) {
      if (match[1] && match[1].length < 200) {
        // Only include concise points
        requirements.push(match[1].trim());
      }
    }

    // Extract numbered items if no bullets found
    if (requirements.length === 0) {
      while ((match = numberedPattern.exec(prompt)) !== null) {
        if (match[1] && match[1].length < 200) {
          requirements.push(match[1].trim());
        }
      }
    }

    // Default requirements if none found
    if (requirements.length === 0) {
      return [
        "Deliverable matches the substep objectives",
        "Quality meets professional standards",
        "All critical elements are present",
      ];
    }

    // Limit to first 5 requirements for clarity
    return requirements.slice(0, 5);
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
