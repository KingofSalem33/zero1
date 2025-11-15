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
import { conversationAnalyzer } from "./ConversationAnalyzer";

export interface SubstepContext {
  step_number: number;
  title: string;
  description: string;
  acceptance_criteria: string[];
  phase_id?: string; // e.g., "P0", "P1", etc.
}

export interface DynamicPromptContext {
  project_goal: string;
  current_substep: SubstepContext;
  master_prompt: string;
  conversation_messages: Message[];
  completed_steps_summary: string;
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
      project_goal,
      current_substep,
      master_prompt,
      conversation_messages,
      completed_steps_summary,
    } = context;

    // Analyze conversation to extract progress
    const progressAnalysis = conversationAnalyzer.analyzeProgress(
      conversation_messages,
      current_substep.acceptance_criteria,
    );

    // Determine if this is P0 (conversational) or technical phase (execution)
    const isP0 = current_substep.phase_id === "P0" || current_substep.title.includes("P0:");
    const isConversationalPhase = isP0;

    // Build the dynamic system message with appropriate mode
    if (isConversationalPhase) {
      // P0: Conversational mode - help user think through their idea
      return this.buildConversationalSystemMessage(
        context,
        progressAnalysis,
      );
    }

    // P1-P7: EXECUTION mode - build and execute FOR the user
    const systemMessage = `⚠️ **CRITICAL OVERRIDE - READ THIS FIRST** ⚠️

🔨 **YOU ARE AN EXPERT BUILDER WHO EXECUTES, NOT A CONVERSATIONAL GUIDE**

**EXECUTION-ONLY MODE:**
✅ USE TOOLS IMMEDIATELY - Write, Edit, Bash, WebSearch, etc.
✅ CREATE FILES, WRITE CODE, RUN COMMANDS - Do the actual work
✅ REPORT "✅ Created X" after each action, then IMMEDIATELY do the next thing
❌ NO "you should...", NO "let's plan...", NO "here are the steps..."
❌ NO QUESTIONS unless you're completely blocked
❌ NO GUIDANCE - Just BUILD and narrate what you DID

**YOUR ONE JOB:** Execute the acceptance criteria below. Start NOW.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎯 CURRENT SUBSTEP (${current_substep.step_number}): ${current_substep.title}

**Description:** ${current_substep.description}

**ACCEPTANCE CRITERIA (Execute these NOW):**
${this.formatAcceptanceCriteria(progressAnalysis.acceptance_criteria_progress)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📊 REAL-TIME PROGRESS (${progressAnalysis.completion_percentage}% COMPLETE)

${progressAnalysis.progress_summary}

${this.buildNextActionGuidance(progressAnalysis)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🧠 EXPERT CONTEXT (Background knowledge - use this to make smart decisions):

${master_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ✅ COMPLETED STEPS IN THIS PROJECT:

${completed_steps_summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⚡ EXECUTE NOW:

**IMMEDIATE ACTION:**
${this.determineCurrentFocus(progressAnalysis)}

**EXECUTION RULES (Override everything above if there's conflict):**
1. Use tools FIRST, talk SECOND
2. Create actual files, code, and configurations
3. After each action, report "✅ [what you did]" then DO the next thing
4. Focus ONLY on the [⏳ NEEDED] criteria above
5. NO planning, NO asking permission, NO guidance - JUST EXECUTE
6. Stay on Step ${current_substep.step_number} - don't jump ahead

Project: "${project_goal}"

**BEGIN EXECUTION NOW - Use your first tool call immediately.**`;

    return systemMessage;
  }

  /**
   * Format acceptance criteria with progress indicators
   */
  private formatAcceptanceCriteria(
    criteriaProgress: Array<{ text: string; satisfied: boolean; evidence?: string }>,
  ): string {
    return criteriaProgress
      .map((c, i) => {
        const status = c.satisfied ? "✅" : "⏳";
        const statusText = c.satisfied ? "DONE" : "NEEDED";
        return `${i + 1}. [${status} ${statusText}] ${c.text}${c.evidence ? `\n   Evidence: "${c.evidence}..."` : ""}`;
      })
      .join("\n");
  }

  /**
   * Build next action guidance based on progress
   */
  private buildNextActionGuidance(progressAnalysis: any): string {
    const unsatisfied = progressAnalysis.acceptance_criteria_progress.filter(
      (c: any) => !c.satisfied,
    );

    if (unsatisfied.length === 0) {
      return `**🎉 ALL CRITERIA SATISFIED!** This substep is complete. The user can advance when ready.`;
    }

    if (progressAnalysis.completion_percentage >= 50) {
      return `**📍 YOU'RE HALFWAY THERE!** Focus on completing the remaining criteria:\n${unsatisfied.map((c: any) => `- ${c.text}`).join("\n")}`;
    }

    return `**🚀 NEXT ACTIONS:** Complete these criteria in order:\n${unsatisfied.slice(0, 3).map((c: any, i: number) => `${i + 1}. ${c.text}`).join("\n")}`;
  }

  /**
   * Determine what the LLM should focus on right now
   */
  private determineCurrentFocus(progressAnalysis: any): string {
    const unsatisfied = progressAnalysis.acceptance_criteria_progress.filter(
      (c: any) => !c.satisfied,
    );

    if (unsatisfied.length === 0) {
      return "All acceptance criteria are satisfied. Verify everything is working, then let the user know this substep is complete.";
    }

    const nextCriterion = unsatisfied[0];
    return `Complete the next acceptance criterion: "${nextCriterion.text}". Use your tools to execute this work directly.`;
  }

  /**
   * Build conversational system message for P0 (Define Vision phase)
   * This phase requires conversation and clarifying questions, not execution
   */
  private buildConversationalSystemMessage(
    context: DynamicPromptContext,
    progressAnalysis: any,
  ): string {
    const {
      project_goal,
      current_substep,
      master_prompt,
    } = context;

    return `You are helping the user define their project vision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🎯 CURRENT SUBSTEP (${current_substep.step_number}): ${current_substep.title}

**Description:** ${current_substep.description}

**ACCEPTANCE CRITERIA:**
${this.formatAcceptanceCriteria(progressAnalysis.acceptance_criteria_progress)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 📊 PROGRESS (${progressAnalysis.completion_percentage}% COMPLETE)

${progressAnalysis.progress_summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 🧠 EXPERT GUIDANCE:

${master_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## YOUR APPROACH FOR THIS PHASE:

**P0 (Define Vision) is CONVERSATIONAL** - You should:
- Ask clarifying questions to understand the user's idea
- Help them think through their target audience
- Guide them to articulate their vision clearly
- Challenge vague ideas with specific questions
- Lead them to the acceptance criteria above

**DO:**
✅ Ask thoughtful questions
✅ Provide examples and frameworks
✅ Help them think critically about their idea
✅ Guide conversation toward completing the acceptance criteria

**DON'T:**
❌ Create files or write code (this is strategy, not implementation)
❌ Jump ahead to technical details
❌ Make decisions for them - help THEM decide

Project: "${project_goal}"

**Start by addressing the remaining acceptance criteria through conversation.**`;
  }
}

export const dynamicPromptBuilder = new DynamicPromptBuilder();
