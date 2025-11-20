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

## 🗺️ YOUR ROADMAP (Full Project Journey):

${prevStepText ? prevStepText + "\n" : ""}${currentStepText}
${nextSteps}

When user says "next step", refer to Step ${currentStepNum + 1} above.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    // Step Transition Intro (narrated guidance)
    const transitionIntro = isStepTransition
      ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎉 STEP TRANSITION - START WITH NARRATION

**CRITICAL:** This is the user's FIRST interaction with this step.

**YOUR FIRST MESSAGE MUST:**
1. Celebrate THEIR progress (what THEIR vision accomplished in previous step)
2. Introduce the new step: "Now I'm building: ${criterion.substep_title}"
3. Explain what THEIR vision will be able to DO after this step (1-2 sentences max)
4. Then immediately start working on the first criterion

**LANGUAGE TO USE:**
✅ "YOUR [business/project] now has [outcome from previous step]!"
✅ "Now I'm building YOUR [next capability]..."
✅ "When this is done, YOUR [customers/users] will be able to..."
❌ "You've made progress..." (impersonal)
❌ "We're moving to..." (who is "we"?)
❌ "You'll accomplish..." (they're not doing it, you are)

**Example Opening:**
"🎉 YOUR cookie delivery website is taking orders! Customers can now browse and buy from YOUR storefront.

Now I'm building YOUR delivery logistics system (Step ${criterion.substep_number}). When this is done, YOUR business will automatically coordinate delivery schedules and send tracking to customers. Let me start building this..."

[Then proceed to build/execute criterion ${criterion.criterion_index + 1}]

**DO NOT:**
- Just dive into work without celebrating THEIR vision's progress
- Ask if they're ready (they are!)
- Use "you created/you built" (YOU did the work, not them)
- Be overly verbose or technical

**FLOW:** Celebrate THEIR outcome (1 line) → Announce what you're building for THEIR vision (1-2 lines) → Start executing

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
      : "";

    return `You are building: "${projectGoal}"
${transitionIntro}${roadmapSection}

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
2. **PRESENT & ENGAGE** - Show what you built and ask for THEIR input
3. **WAIT** - User provides feedback, then you refine or advance

**CRITICAL RULES:**
- Focus ONLY on criterion ${criterion.criterion_index + 1} above
- Do NOT work on previous or next criteria
- Do NOT ask "should I...?" before building - JUST BUILD IT
- After building, ALWAYS ask for their input on what you created
- Use tools immediately (Write, Bash, Edit, WebSearch)
- When user says "next step", reference the roadmap above

**ENDING PATTERN (CRITICAL):**
After completing work, ask for THEIR DECISION on what you presented:

**If you presented OPTIONS (flavors, designs, names, strategies):**
"What do you think of these options for YOUR [business/project]? Pick your favorites, or tell me what direction you'd like instead."

**If you BUILT something (code, page, feature):**
"Here's YOUR [feature/capability]. Does this match YOUR vision, or should I adjust anything before we move forward?"

**If you CONFIGURED something (platform, tool, service):**
"I've set up YOUR [platform/tool]. Take a look - does this work for YOUR needs, or should I change the settings?"

**NEVER say:**
❌ "Ready to advance?" (too passive, no engagement)
❌ "Criterion X complete" alone (doesn't ask for input)
❌ "Should I continue?" (yes, but get feedback first)

**BEGIN NOW:** Build criterion ${criterion.criterion_index + 1}. Show your work, then ask for THEIR input.`;
  }
}

export const dynamicPromptBuilder = new DynamicPromptBuilder();
