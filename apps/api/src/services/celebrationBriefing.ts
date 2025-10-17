/**
 * Celebration & Briefing System
 *
 * Generates encouraging messages when substeps complete and provides
 * seamless transitions to the next substep, maintaining conversational flow.
 */

import { runModel } from "../ai/runModel";
import type {
  Project,
  ProjectSubstep,
  ArtifactAnalysis,
} from "../engine/types";
import type { NormalizedProjectState } from "./projectStateManager";

export interface CelebrationMessage {
  celebration: string;
  briefing: string;
  fullMessage: string;
  nextSubstep: {
    phase: string;
    step: number;
    label: string;
  };
}

/**
 * Generate celebration + briefing when a substep completes
 */
export async function generateCelebrationAndBriefing(
  project: Project,
  completedAnalysis: ArtifactAnalysis,
  newState: NormalizedProjectState,
  completedSubstep: ProjectSubstep,
  nextSubstep: ProjectSubstep,
): Promise<CelebrationMessage> {
  console.log(
    `[CelebrationBriefing] Generating for ${project.id}: ${completedSubstep.label} → ${nextSubstep.label}`,
  );

  const prompt = `You are Workshop AI, working with a user on their Zero-to-One project.

**PROJECT VISION:**
"${project.goal}"

**WHAT THE USER JUST COMPLETED:**
Substep: ${completedSubstep.label}
Quality: ${completedAnalysis.quality_score}/10
State: ${completedAnalysis.implementation_state}
Tech Stack: ${completedAnalysis.tech_stack.join(", ") || "N/A"}

**NEXT SUBSTEP:**
Label: ${nextSubstep.label}
Requirements: ${nextSubstep.prompt_to_send?.substring(0, 300)}...

**YOUR TASK:**
Generate a message that:
1. **Celebrates** their achievement (1-2 sentences, specific to what they built)
2. **Transitions smoothly** to the next substep (no gap, no asking permission)
3. **Briefs them** on what's next (why it matters, what they'll build)
4. **Starts the work** with a concrete first action

**FORMAT:**
✅ [Specific celebration about what they achieved]

🎯 Next: [Next substep title]
[1-2 sentences: why this substep matters]

[Concrete first action or guidance to start the work]

**TONE:**
- Encouraging but not patronizing
- Specific to their project (use their vision/tech)
- Action-oriented (momentum, not explanation)
- Natural conversational flow

**EXAMPLE (for a teacher app):**
✅ Excellent work! Your environment is fully configured with React, Node.js, and PostgreSQL. You ran the Hello World successfully—everything is working.

🎯 Next: Build the Core Loop
Now we're creating the heart of your lesson-sharing platform: the ability for teachers to upload a lesson and see it displayed in a feed. This proves the concept works before we add complexity.

I'm going to help you build:
- Database schema for lessons (title, content, author)
- Upload form component
- Feed display component

Let's start with the database. Here's the schema we need...

Return ONLY the message (no meta-commentary).`;

  try {
    const response = await runModel(
      [
        {
          role: "system",
          content:
            "You maintain conversational flow between substeps. Be encouraging and action-oriented.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      { toolSpecs: [], toolMap: {} },
    );

    const fullMessage = response.text.trim();

    // Extract celebration and briefing sections for structured storage
    const celebrationMatch = fullMessage.match(/✅\s*([^\n]+)/);
    const briefingMatch = fullMessage.match(/🎯\s*Next:\s*([^\n]+)/);

    return {
      celebration:
        celebrationMatch?.[1] || "Great work on completing this step!",
      briefing: briefingMatch?.[1] || `Now moving to: ${nextSubstep.label}`,
      fullMessage,
      nextSubstep: {
        phase: newState.current_phase,
        step: newState.current_substep,
        label: nextSubstep.label,
      },
    };
  } catch (error) {
    console.error("[CelebrationBriefing] Error generating message:", error);

    // Fallback message if LLM fails
    return {
      celebration: `Great work completing ${completedSubstep.label}!`,
      briefing: `Next up: ${nextSubstep.label}`,
      fullMessage: `✅ Great work completing ${completedSubstep.label}!

🎯 Next: ${nextSubstep.label}
Let's keep the momentum going. I'm ready to help you with this next step.

What would you like to start with?`,
      nextSubstep: {
        phase: newState.current_phase,
        step: newState.current_substep,
        label: nextSubstep.label,
      },
    };
  }
}

/**
 * Generate briefing for next substep (for manual completions without artifact analysis)
 */
export async function generateSubstepBriefing(
  project: Project,
  newState: NormalizedProjectState,
  nextSubstep: ProjectSubstep,
  previousSubstep?: ProjectSubstep,
): Promise<string> {
  console.log(
    `[CelebrationBriefing] Generating briefing for ${project.id}: ${nextSubstep.label}`,
  );

  const prompt = `You are Workshop AI, working with a user on their Zero-to-One project.

**PROJECT VISION:**
"${project.goal}"

${previousSubstep ? `**WHAT THEY JUST COMPLETED:**\nSubstep: ${previousSubstep.label}\n` : ""}

**NEXT SUBSTEP:**
Label: ${nextSubstep.label}
Requirements: ${nextSubstep.prompt_to_send?.substring(0, 300)}...

**YOUR TASK:**
Generate a brief message that:
${previousSubstep ? "1. Acknowledges completion (1 sentence)\n" : ""}${previousSubstep ? "2" : "1"}. Explains the next substep (why it matters)
${previousSubstep ? "3" : "2"}. Provides a concrete first action to start

**FORMAT:**
${previousSubstep ? "✅ [Quick acknowledgment]\n\n" : ""}🎯 ${nextSubstep.label}
[1-2 sentences: why this matters]

[Concrete first action]

**TONE:**
- Direct and action-oriented
- Specific to their project
- Maintain momentum

Return ONLY the message.`;

  try {
    const response = await runModel(
      [
        {
          role: "system",
          content: "You provide concise, action-oriented briefings.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      { toolSpecs: [], toolMap: {} },
    );

    return response.text.trim();
  } catch (error) {
    console.error("[CelebrationBriefing] Error generating briefing:", error);

    // Fallback
    return `${previousSubstep ? `✅ ${previousSubstep.label} complete!\n\n` : ""}🎯 ${nextSubstep.label}
I'm ready to help you with this step. Let's start working on it together.`;
  }
}

/**
 * Generate a phase completion celebration
 */
export async function generatePhaseCompletion(
  project: Project,
  completedPhase: string,
  nextPhase?: string,
): Promise<string> {
  console.log(
    `[CelebrationBriefing] Generating phase completion for ${completedPhase}`,
  );

  const prompt = `You are Workshop AI celebrating a major milestone.

**PROJECT VISION:**
"${project.goal}"

**COMPLETED PHASE:**
${completedPhase} - The user just finished an entire phase!

${nextPhase ? `**NEXT PHASE:**\n${nextPhase}` : "**PROJECT COMPLETE!**"}

**YOUR TASK:**
Generate an enthusiastic but professional celebration message that:
1. Celebrates the completed phase (2-3 sentences)
2. Summarizes what they accomplished
${nextPhase ? "3. Teases what's coming next" : "3. Congratulates them on finishing"}

**TONE:**
- Genuinely excited for their progress
- Specific to what they built
- Encouraging momentum

Return ONLY the celebration message (no meta-commentary).`;

  try {
    const response = await runModel(
      [
        {
          role: "system",
          content: "You celebrate major milestones with genuine enthusiasm.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      { toolSpecs: [], toolMap: {} },
    );

    return response.text.trim();
  } catch (error) {
    console.error(
      "[CelebrationBriefing] Error generating phase completion:",
      error,
    );

    return `🎉 Congratulations! You've completed ${completedPhase}!

This is a major milestone. ${nextPhase ? `Next up: ${nextPhase}` : "You've finished the entire roadmap!"}`;
  }
}
