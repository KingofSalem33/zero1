/**
 * Centralized Prompt Templates
 *
 * All LLM prompts in one place for:
 * - Easy version control
 * - A/B testing
 * - Visibility
 * - Future database migration
 */

export class PromptTemplates {
  /**
   * Phase Generation - Generate P1-P7 roadmap customized for user's project
   */
  static phaseGeneration(goal: string, clarificationContext?: string): string {
    return `You are generating a customized Zero-to-One project roadmap.

USER'S PROJECT: "${goal}"

${clarificationContext ? `ADDITIONAL CONTEXT: ${clarificationContext}\n` : ""}
TASK: Generate P1-P7 phases that are HYPER-SPECIFIC to this exact project.

UNIVERSAL STRUCTURE (Keep these phase IDs):
- P1: Build Environment
- P2: Core Loop
- P3: Layered Expansion
- P4: Reality Test
- P5: Polish & Freeze Scope
- P6: Launch
- P7: Reflect & Evolve

YOUR JOB: Customize each phase for THIS specific project type and domain.

EXAMPLES:

For "cookie business":
- P1 goal: "Set up commercial kitchen and food business infrastructure"
- P1 why_it_matters: "Commercial kitchen permits, equipment, and food safety certifications are legally required before selling"
- P1 acceptance_criteria: ["Commercial kitchen licensed or home kitchen permitted", "Equipment installed and tested", "First test batch successfully baked"]

For "SaaS app":
- P1 goal: "Set up development environment and hosting infrastructure"
- P1 why_it_matters: "Professional dev tools and deployment pipeline enable rapid iteration"
- P1 acceptance_criteria: ["Development environment configured", "Database and hosting set up", "Hello World app deployed"]

For "podcast":
- P1 goal: "Set up recording equipment and podcast hosting"
- P1 why_it_matters: "Professional audio quality and reliable hosting are essential for audience retention"
- P1 acceptance_criteria: ["Recording equipment tested", "Podcast hosting configured", "Test episode recorded and uploaded"]

BE SPECIFIC:
- Don't say "tools" - say what EXACT type of tools for this domain
- Don't be generic - reference the actual project type
- Make acceptance_criteria measurable and domain-specific
- Keep rollback_plan practical for this project type

Return 7 phases (P1-P7) with customized content for this project.`;
  }

  /**
   * Substep Generation - Expand a phase into actionable substeps
   */
  static substepGeneration(
    phaseGoal: string,
    phaseId: string,
    projectGoal: string,
  ): string {
    return `You are breaking down a Zero-to-One project phase into actionable substeps.

PROJECT GOAL: "${projectGoal}"
PHASE: ${phaseId} - "${phaseGoal}"

Generate 3-5 substeps that:
1. Are concrete, actionable tasks
2. Build sequentially (each substep enables the next)
3. Have clear completion criteria
4. Are appropriately scoped for a beginner
5. Include specific technical guidance

Each substep should have:
- step_number: Sequential number (1, 2, 3, etc.)
- label: Short title (5-7 words max)
- prompt_to_send: Detailed instructions (2-3 paragraphs) that:
  * Explain WHY this step matters
  * Provide step-by-step guidance
  * Include specific examples for THIS project type
  * Reference previous substeps when relevant
  * End with concrete completion criteria

Make the substeps HYPER-SPECIFIC to "${projectGoal}" - not generic.

Example for a SaaS app's "Build Environment" phase:
- Substep 1: "Set up Git repository and version control"
- Substep 2: "Configure Node.js development environment"
- Substep 3: "Deploy Hello World to production"

Return only the substeps array in JSON format.`;
  }

  /**
   * Master Prompt Generation - Generate expert guidance for a phase
   */
  static masterPromptGeneration(
    phaseId: string,
    phaseGoal: string,
    userVision: string,
  ): string {
    return `You are a senior architect condensing 20+ years of experience into a master prompt.

USER'S VISION: "${userVision}"
PHASE: ${phaseId} - "${phaseGoal}"

Create a comprehensive master prompt that:
1. Captures expert-level thinking for this phase
2. Includes domain-specific best practices
3. Anticipates common pitfalls
4. Provides decision frameworks
5. Balances thoroughness with beginner-friendliness

The prompt should be 500-800 words and include:
- Strategic context (WHY this phase matters)
- Step-by-step guidance
- Common mistakes to avoid
- Success criteria
- Next steps preview

Make it HYPER-SPECIFIC to "${userVision}" - reference the actual project type throughout.

Return only the master prompt text.`;
  }

  /**
   * Step Execution System Message - Contextual guidance for LLM during step execution
   */
  static executionSystem(
    projectGoal: string,
    phaseGoal: string,
    substepLabel: string,
    completedSubsteps: string,
    masterPrompt: string,
  ): string {
    return `You are helping with project execution.

Tool usage rules (strict):
- When calling web_search, you MUST include a complete 'q' string with jurisdiction + topic + 'site:.gov' (e.g., 'Minnesota cottage food law site:mn.gov'). Never call web_search without 'q'.
- When calling http_fetch, you MUST include a full 'url' starting with http(s). Never call http_fetch without 'url'.

When using web_search or http_fetch tools:
1. Synthesize information from multiple sources into a comprehensive answer
2. Provide specific details, examples, and actionable insights
3. Present information naturally in paragraph form, not as a list of links
4. The system will automatically display citations at the end - don't mention URLs in your response

Provide comprehensive, helpful responses using the tools when appropriate. Be conversational and thorough like ChatGPT.

After providing your response, ask the immediate next logical question to aid the user in completing the task. Be direct and specific - focus on the exact next action needed.

PROJECT CONTEXT:
- Goal: ${projectGoal}
- Current Phase: ${phaseGoal}
- Current Step: ${substepLabel}

COMPLETED SUBSTEPS IN THIS PHASE:
${completedSubsteps}

IMPORTANT: Build upon the work completed in previous substeps. Reference their outputs when relevant. Ensure continuity and avoid asking for information that was already provided in earlier substeps.

MASTER PROMPT FROM SYSTEM:
${masterPrompt}`;
  }

  /**
   * Completion Briefing - Generate celebration + next step briefing
   */
  static completionBriefing(
    completedPhase: string,
    completedSubstep: string,
    nextPhase: string,
    nextSubstep: string,
    projectGoal: string,
  ): string {
    return `Generate a brief, encouraging transition message for a user who just completed a project substep.

PROJECT: "${projectGoal}"
COMPLETED: ${completedPhase} / ${completedSubstep}
NEXT: ${nextPhase} / ${nextSubstep}

Create a 2-3 sentence message that:
1. Celebrates the completion (be specific about what they achieved)
2. Explains why the next step matters
3. Builds momentum

Keep it concise, encouraging, and specific to the project.

Example:
"🎉 Great work setting up your development environment! You now have a solid foundation to build on. Next, we'll create your first working feature - this is where your idea starts to take shape."

Return only the message text.`;
  }

  /**
   * Vision Refinement - Help users clarify their project idea
   */
  static visionRefinement(currentIdea: string): string {
    return `A crystal-clear vision sentence is the foundation of any successful project. Here's how to refine your idea:

**Original idea:** "${currentIdea}"

**The Vision Formula:** "I want to build ______ so that ______"

**Refinement principles:**
1. **First blank**: Be specific and concrete (not "an app" but "a mobile app for busy parents")
2. **Second blank**: Focus on user benefit, not features (not "has GPS" but "parents never lose track of pickup times")
3. **Clarity test**: Could someone else explain your project after hearing this once?

**Common mistakes to avoid:**
- Too vague ("productivity app")
- Feature-focused ("app with notifications")
- Multiple audiences in one sentence

**Your refined vision statement should use the exact format above and be specific enough that someone could understand your project's value in 5 seconds.**

Return only the refined vision statement using the format "I want to build ______ so that ______."`;
  }

  /**
   * Phase Constraints - Domain-specific constraints for substep generation
   */
  static getPhaseConstraints(phaseId: string): string {
    const constraints: Record<string, string> = {
      P1: `Focus on infrastructure and setup. Keep it simple and achievable.
- Don't overwhelm with advanced tooling
- Prioritize getting started over perfection
- Include a "Hello World" verification step
- Make first substep very easy (confidence builder)`,

      P2: `Focus on the smallest working feature that proves value.
- Must demonstrate the core value proposition
- Should be testable with real input/output
- Avoid scope creep - keep it minimal
- Include concrete examples of input → output`,

      P3: `Focus on ONE high-value feature addition.
- Build on P2's foundation
- Choose a feature that demonstrates value
- Include integration testing
- Recommend next layer at the end`,

      P4: `Focus on real-world validation.
- Create 2-3 minute demo
- Include test script for users
- Provide decision matrix (PROCEED/PIVOT/KILL)
- Reference P0 success metrics`,

      P5: `Focus on launch readiness.
- Fix critical issues only
- Declare v1.0 scope freeze
- Polish user-facing elements
- Create launch checklist`,

      P6: `Focus on going live.
- Deploy to public URL
- Create marketing copy (headline, CTA, value prop)
- Push to 3 channels
- Track 3 key metrics
- 48-hour monitoring period`,

      P7: `Focus on reflection and next steps.
- Compare metrics vs P0 targets
- Extract lessons learned
- Add to personal playbook
- Propose Path A (v2.0) and Path B (new project)
- Recommend one path with rationale`,
    };

    return constraints[phaseId] || "No specific constraints for this phase.";
  }

  /**
   * Fallback Master Prompts - Used when AI generation fails
   */
  static getFallbackMasterPrompt(phaseId: string, userVision: string): string {
    const prompts: Record<string, string> = {
      P1: `Master Prompt: Build Environment for "${userVision}"

You're setting up the foundation for your project. Think of this like a chef preparing their mise en place before cooking.

**Strategic Context:**
Without a proper environment, you'll waste time fighting tools instead of building. This phase ensures you can iterate quickly and deploy confidently.

**Step-by-Step Guidance:**
1. Set up version control (Git) - your safety net for experiments
2. Configure your development environment - the tools you'll use daily
3. Set up hosting/deployment - proof that your work reaches real users
4. Create a "Hello World" - verify everything works end-to-end

**Common Mistakes:**
- Over-engineering the setup (keep it simple!)
- Skipping deployment until "later" (deploy early, deploy often)
- Not testing the full pipeline (dev → production)

**Success Criteria:**
You can make a small change, commit it, and see it live in production within 5 minutes.

**Next Preview:**
Once your environment is ready, we'll build your first working feature - where your idea starts to take real shape.`,

      P2: `Master Prompt: Core Loop for "${userVision}"

You're building the smallest version that proves your idea works. This is your MVP's MVP.

**Strategic Context:**
The core loop is the heart of your project - the fundamental value you provide. Get this right, and everything else becomes easier.

**Step-by-Step Guidance:**
1. Define the simplest input → process → output flow
2. Build it without polish (rough is fine)
3. Test with real data (not hypothetical)
4. Verify the output delivers value

**Common Mistakes:**
- Building features before the core works
- Making it pretty before it works
- Testing with fake data

**Success Criteria:**
Someone can give you real input and get real, valuable output within 30 seconds.

**Next Preview:**
With a working core, we'll layer on your first enhancement - making it better, not just bigger.`,

      // ... other phases
    };

    return (
      prompts[phaseId] ||
      `Master Prompt for ${phaseId}: Execute "${userVision}"\n\nFocus on practical, actionable steps that move your project forward.`
    );
  }
}
