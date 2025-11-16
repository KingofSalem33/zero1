/**
 * Dynamic Prompt Builder
 *
 * Builds fresh, context-aware system messages on every AI turn.
 * Injects real-time progress tracking so the LLM always knows:
 * - Exactly what substep it's on
 * - What's been completed in this conversation
 * - What still needs to be done
 * - Progress against acceptance criteria
 */

import type { Message } from "../../../services/threadService";

export interface SubstepContext {
  step_number: number;
  title: string;
  description: string;
  acceptance_criteria: string[];
  phase_id?: string; // e.g., "P0", "P1", etc.
}

export interface CriterionContext {
  criterion_index: number; // 0-based index within substep
  criterion_text: string;
  previous_criterion?: string; // What was just completed
  next_criterion?: string; // What comes after this
  substep_title: string;
  substep_number: number;
}

export interface RoadmapStep {
  step_number: number;
  title: string;
  description: string;
  acceptance_criteria?: string[];
  status: string;
}

export interface DynamicPromptContext {
  project_goal: string;
  current_substep: SubstepContext;
  current_criterion?: CriterionContext; // NEW: Criterion-level focus
  master_prompt: string;
  conversation_messages: Message[];
  completed_steps_summary: string;
  all_steps?: RoadmapStep[]; // NEW: Full roadmap for visibility
}

/**
 * DynamicPromptBuilder
 *
 * Generates real-time, roadmap-aware system messages
 */
export class DynamicPromptBuilder {
  /**
   * Build a dynamic system message with real-time progress
   */
  buildSystemMessage(context: DynamicPromptContext): string {
    const {
      master_prompt,
      current_criterion,
      current_substep,
      project_goal,
      all_steps,
    } = context;

    // If we have criterion-level context, use laser-focused mode
    if (current_criterion) {
      return this.buildCriterionFocusedMessage(
        project_goal,
        current_criterion,
        master_prompt,
        all_steps,
      );
    }

    // Fallback: use master_prompt as-is (for backward compatibility)
    return `${master_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**YOUR FOCUS:** Complete the acceptance criteria for "${current_substep.title}".`;
  }

  /**
   * Build laser-focused message for a SINGLE acceptance criterion
   */
  private buildCriterionFocusedMessage(
    projectGoal: string,
    criterion: CriterionContext,
    masterPrompt: string,
    allSteps?: RoadmapStep[],
  ): string {
    const previousSection = criterion.previous_criterion
      ? `## ✅ PREVIOUS CRITERION (COMPLETED):
${criterion.previous_criterion}

`
      : "";

    const nextSection = criterion.next_criterion
      ? `## 📍 NEXT CRITERION (AFTER THIS ONE):
${criterion.next_criterion}

`
      : `## 🎉 FINAL CRITERION:
This is the last criterion for "${criterion.substep_title}". After this, the substep is complete.

`;

    // Build full roadmap visibility
    let roadmapSection = "";
    if (allSteps && allSteps.length > 0) {
      const currentStepNum = criterion.substep_number;

      // Show previous step (if exists)
      const prevStep = allSteps.find(s => s.step_number === currentStepNum - 1);
      const prevStepText = prevStep
        ? `**Step ${prevStep.step_number}** (Completed): ${prevStep.title}`
        : "";

      // Show current step
      const currentStepText = `**Step ${currentStepNum}** (Current): ${criterion.substep_title}`;

      // Show next 2-3 steps
      const nextSteps = allSteps
        .filter(s => s.step_number > currentStepNum && s.step_number <= currentStepNum + 3)
        .map(s => `**Step ${s.step_number}** (Upcoming): ${s.title}`)
        .join("\n");

      roadmapSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🗺️ YOUR ROADMAP (Full Project Journey):

${prevStepText ? prevStepText + "\n" : ""}${currentStepText}
${nextSteps}

When user says "next step", refer to Step ${currentStepNum + 1} above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    return `You are building: "${projectGoal}"
${roadmapSection}

## 🎯 CURRENT TASK (Step ${criterion.substep_number}):
${criterion.substep_title}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${previousSection}## 🔨 YOUR ONE JOB RIGHT NOW:

**Criterion ${criterion.criterion_index + 1}:** ${criterion.criterion_text}

${nextSection}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## HOW TO EXECUTE:

${masterPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## YOUR WORKFLOW:

1. **BUILD** - Complete the criterion above using your tools
2. **CONFIRM** - When done, say "✅ Criterion ${criterion.criterion_index + 1} complete. Ready to advance?"
3. **WAIT** - User confirms, then you move to next criterion

**CRITICAL RULES:**
- Focus ONLY on criterion ${criterion.criterion_index + 1} above
- Do NOT work on previous or next criteria
- Do NOT ask "should I...?" - JUST BUILD IT
- Present completed work, ask for confirmation to advance
- Use tools immediately (Write, Bash, Edit, WebSearch)
- When user says "next step", reference the roadmap above

**BEGIN NOW:** Build criterion ${criterion.criterion_index + 1}. Show your work.`;
  }

}

export const dynamicPromptBuilder = new DynamicPromptBuilder();
