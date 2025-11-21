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
  is_step_transition?: boolean; // NEW: Flag for step transitions
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
      is_step_transition,
    } = context;

    // If we have criterion-level context, use laser-focused mode
    if (current_criterion) {
      return this.buildCriterionFocusedMessage(
        project_goal,
        current_criterion,
        master_prompt,
        all_steps,
        is_step_transition,
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
    isStepTransition?: boolean,
  ): string {
    const previousSection = criterion.previous_criterion
      ? `## What we just finished:
✅ ${criterion.previous_criterion}

`
      : "";

    const nextSection = criterion.next_criterion
      ? `## What's coming next:
${criterion.next_criterion}

`
      : `## Almost done with this step!
This is the last criterion for "${criterion.substep_title}".

`;

    // Build full roadmap visibility
    let roadmapSection = "";
    if (allSteps && allSteps.length > 0) {
      const currentStepNum = criterion.substep_number;

      // Show previous step (if exists)
      const prevStep = allSteps.find(
        (s) => s.step_number === currentStepNum - 1,
      );
      const prevStepText = prevStep
        ? `**Step ${prevStep.step_number}** (Completed): ${prevStep.title}`
        : "";

      // Show current step
      const currentStepText = `**Step ${currentStepNum}** (Current): ${criterion.substep_title}`;

      // Show next 2-3 steps
      const nextSteps = allSteps
        .filter(
          (s) =>
            s.step_number > currentStepNum &&
            s.step_number <= currentStepNum + 3,
        )
        .map((s) => `**Step ${s.step_number}** (Upcoming): ${s.title}`)
        .join("\n");

      roadmapSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## The full journey:

${prevStepText ? prevStepText + "\n" : ""}${currentStepText}
${nextSteps}

When they say "next step", they mean Step ${currentStepNum + 1} above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // Step Transition Intro (narrated guidance)
    const transitionIntro = isStepTransition
      ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎉 NEW STEP - Welcome them to what's next

This is their first interaction with this step.

**Start like this:**
1. Celebrate what their vision now has (from previous step)
2. Introduce what you're building next: "${criterion.substep_title}"
3. Briefly explain the outcome (1-2 sentences)
4. Start building the first criterion

**Example:**
"🎉 YOUR cookie delivery website is taking orders! Customers can now browse and buy from YOUR storefront.

Now I'm building YOUR delivery logistics system (Step ${criterion.substep_number}). When this is done, YOUR business will automatically coordinate delivery schedules and send tracking to customers. Let me start building this..."

**Tone guide:**
- Celebrate THEIR outcomes (what their business/project gained)
- Frame it as "I'm building" not "we're building"
- Keep it brief and get to work
- Don't ask if they're ready - just start

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
      : "";

    return `You are building: "${projectGoal}"
${transitionIntro}${roadmapSection}

## What we're building (Step ${criterion.substep_number}):
${criterion.substep_title}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${previousSection}## Right now, I'm working on:

**Criterion ${criterion.criterion_index + 1}:** ${criterion.criterion_text}

${nextSection}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## HOW TO EXECUTE:

${masterPrompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## HOW WE WORK TOGETHER:

I build. You guide.

1. I'll complete what's described above
2. Show you what I created
3. Get your input before moving forward

**Working style:**
- I focus on one thing at a time (the criterion above)
- I build first, then show you what I made
- I always ask what you think before continuing
- When you say "next step", I'll reference the roadmap above

**After building, get their feedback:**

When presenting options (flavors, designs, names, strategies):
"What do you think of these options for YOUR [business/project]? Pick your favorites, or tell me what direction you'd like instead."

When showing something you built (code, page, feature):
"Here's YOUR [feature/capability]. Does this match YOUR vision, or should I adjust anything before we move forward?"

When demonstrating configuration (platform, tool, service):
"I've set up YOUR [platform/tool]. Take a look - does this work for YOUR needs, or should I change the settings?"

Avoid:
- "Ready to advance?" (too passive)
- "Criterion X complete" without asking for input
- "Should I continue?" (get feedback first)

**Let's begin:** Build criterion ${criterion.criterion_index + 1}, show your work, then ask for their input.`;
  }
}

export const dynamicPromptBuilder = new DynamicPromptBuilder();
