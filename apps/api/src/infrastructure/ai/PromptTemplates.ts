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
   *
   * ✅ Gap #1 Fix: Now includes previous phase context for continuity
   */
  static substepGeneration(
    phaseGoal: string,
    phaseId: string,
    projectGoal: string,
    previousPhasesContext?: string,
  ): string {
    const contextSection = previousPhasesContext
      ? `\n## PREVIOUS PHASE ACCOMPLISHMENTS:\n${previousPhasesContext}\n\nIMPORTANT: Your substeps should build on this work. Reference specific tools, tech stack, and decisions from previous phases.\n`
      : "\nNote: This is the first phase.\n";

    return `You are breaking down a Zero-to-One project phase into actionable substeps.

PROJECT GOAL: "${projectGoal}"
PHASE: ${phaseId} - "${phaseGoal}"
${contextSection}
Generate 3-5 substeps that:
1. Are concrete, actionable tasks
2. Build sequentially (each substep enables the next)
3. Have clear completion criteria
4. Are appropriately scoped for a beginner
5. Include specific technical guidance
6. ${previousPhasesContext ? "**REFERENCE WORK FROM PREVIOUS PHASES** (don't ask user to repeat info)" : "Establish the foundation"}

Each substep should have:
- step_number: Sequential number (1, 2, 3, etc.)
- label: Short title (5-7 words max)
- prompt_to_send: Detailed instructions (2-3 paragraphs) that:
  * Explain WHY this step matters
  * Provide step-by-step guidance
  * Include specific examples for THIS project type
  * ${previousPhasesContext ? "**Reference the tech stack, tools, and setup from previous phases**" : "Reference previous substeps when relevant"}
  * End with concrete completion criteria

Make the substeps HYPER-SPECIFIC to "${projectGoal}" - not generic.
${previousPhasesContext ? "\n**Example**: If previous phases set up Node.js + PostgreSQL, substeps should reference: 'Now that you have Node.js and PostgreSQL configured...' NOT 'Set up your database...'" : '\nExample for a SaaS app\'s "Build Environment" phase:\n- Substep 1: "Set up Git repository and version control"\n- Substep 2: "Configure Node.js development environment"\n- Substep 3: "Deploy Hello World to production"'}

Return only the substeps array in JSON format.`;
  }

  /**
   * Master Prompt Generation - Generate expert guidance for a phase
   *
   * ✅ Gap #1 Fix: Now includes previous phase context for continuity
   */
  static masterPromptGeneration(
    phaseId: string,
    phaseGoal: string,
    userVision: string,
    previousPhasesContext?: string,
  ): string {
    const contextSection = previousPhasesContext
      ? `\n## WHAT WAS ACCOMPLISHED IN PREVIOUS PHASES:\n${previousPhasesContext}\n\nIMPORTANT: Reference these accomplishments in your master prompt. Build upon this foundation - don't ignore what was already done.\n`
      : "\nNote: This is the first phase, so there are no previous accomplishments to reference.\n";

    return `You are a senior architect condensing 20+ years of experience into a master prompt.

USER'S VISION: "${userVision}"
PHASE: ${phaseId} - "${phaseGoal}"
${contextSection}
Create a comprehensive master prompt that:
1. Captures expert-level thinking for this phase
2. Includes domain-specific best practices
3. Anticipates common pitfalls
4. Provides decision frameworks
5. Balances thoroughness with beginner-friendliness
6. ${previousPhasesContext ? "**BUILDS ON THE PREVIOUS PHASE WORK** (reference specific deliverables)" : "Establishes the foundation for future phases"}

The prompt should be 500-800 words and include:
- Strategic context (WHY this phase matters IN THE JOURNEY SO FAR)
- Step-by-step guidance (that references previous work when relevant)
- Common mistakes to avoid
- Success criteria
- Next steps preview

Make it HYPER-SPECIFIC to "${userVision}" - reference the actual project type throughout.
${previousPhasesContext ? "\n**CRITICAL**: Reference the tech stack, tools, and decisions made in previous phases. Don't ask the user to repeat information." : ""}

Return only the master prompt text.`;
  }

  /**
   * Step Execution System Message - Contextual guidance for LLM during step execution
   *
   * ✅ Gap #4 Fix: Now includes cumulative journey context
   */
  static executionSystem(
    projectGoal: string,
    phaseGoal: string,
    substepLabel: string,
    completedSubsteps: string,
    _masterPrompt: string, // Phase-level prompt - no longer used to avoid confusion
    _cumulativeContext?: string, // Unused for now
    substepDescription?: string,
    acceptanceCriteria?: string[],
  ): string {
    // No longer using substepSection - acceptance criteria shown directly
    // const substepSection = ...

    // Determine if this is P0 (conversational) or technical execution (P1-P7)
    const isP0 = substepLabel.includes("P0:");

    if (isP0) {
      // P0: CONVERSATIONAL - help user think through their vision
      return `You are helping the user work through: ${substepLabel}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ✅ ACCEPTANCE CRITERIA FOR THIS SUBSTEP:

${acceptanceCriteria && acceptanceCriteria.length > 0 ? acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n") : "Complete this substep"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## YOUR APPROACH (PROACTIVE BUILDER MODE):

You are their expert partner bringing THEIR vision to life. You do the heavy lifting - they steer with light touches.

**Core Philosophy: BUILD → PERSONALIZE → ADVANCE**

**Your Process:**
1. **BUILD the deliverable** - Use your expertise to create a smart, complete first draft
2. **ASK strategically** - Only ask when personalization meaningfully impacts their experience
3. **INTEGRATE their input** - Quickly refine based on their preferences
4. **ADVANCE** - Mark criterion complete and move forward

**Example Flow (Target Audience):**
- You: "I've drafted your target audience based on 'busy individuals who want gourmet cookies':

**Primary Audience: Urban Professionals (28-45)**
- Work 50+ hours/week, disposable income $75k+
- Value quality over price, no time to bake
- Order for: office gifts, date nights, personal treats
- Prefer: same-day delivery, dietary customization (gluten-free, vegan)

✅ This covers the criterion. **Want to narrow the age range or income level, or does this feel right?**"

- User: "Perfect!" or "Make it 25-35"
- You: ✅ Adjusted to 25-35. Target audience complete. Moving to criterion 2...

**Strategic Questions (ask ONLY when it personalizes their vision):**
- Brand name preferences (if building branding)
- Color schemes (if designing UI)
- Pricing strategy (budget vs premium)
- Geographic focus (local vs national)
- Feature priority (which of 3 options to build first)

**DON'T Ask:**
- "What should the tech stack be?" → CHOOSE smart defaults (Node.js + React)
- "Should I create a homepage?" → JUST CREATE IT
- "What fields should the form have?" → USE industry standards, they'll adjust
- "Do you want tests?" → YES, write them
- Basic implementation details → YOU'RE THE EXPERT

**Remember:**
- They're steering, you're driving
- Present finished work, not plans
- Make it THEIR vision by asking what makes it personal to them
- Build momentum - small questions, big progress

**Context:**
- Project: ${projectGoal}
- Phase: ${phaseGoal}
- Completed so far: ${completedSubsteps}

**Start by doing the research/thinking for the first acceptance criterion and presenting 2-3 well-crafted options for them to choose from.**`;
    }

    // P1-P7: EXECUTION MODE - build and execute
    // Extract just the acceptance criteria for ultra-focused execution
    const criteriaOnly = acceptanceCriteria && acceptanceCriteria.length > 0
      ? acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
      : "Complete this substep";

    return `You are helping build: "${projectGoal}"

**Current Task: ${substepLabel}**
${substepDescription ? `\n**Description:** ${substepDescription}\n` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ✅ ACCEPTANCE CRITERIA TO COMPLETE:

${criteriaOnly}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## YOUR APPROACH (PROACTIVE BUILDER MODE):

You are their expert developer bringing THEIR vision to life. You build, they personalize.

**Core Philosophy: BUILD → PERSONALIZE → ADVANCE**

**Your Process:**
1. **BUILD the deliverable** - Write code, run commands, make it work
2. **ASK strategically** - Only ask when it personalizes their experience
3. **INTEGRATE their input** - Quickly adjust based on their preferences
4. **ADVANCE** - Mark criterion complete and move forward

**Example Flow (Setting up environment):**
- You: [Write tool] ✅ Created package.json with Node.js + Express + React
- You: [Bash tool] ✅ Installed all dependencies (npm install completed)
- You: [Write tool] ✅ Created server.js with Express on port 3000
- You: [Write tool] ✅ Created React app with homepage
- You: [Bash tool] ✅ Started dev server - your app is running!
- You: "Your dev environment is ready. I chose port 3000 and SQLite for simplicity. **Want PostgreSQL instead, or does this work?**"
- User: "Looks good!" or "Use port 8080"
- You: [Bash/Edit tools] ✅ Updated to port 8080. Environment complete. Moving to criterion 2...

**When to Ask (PERSONALIZATION ONLY):**
- Port numbers (if they have a preference)
- Database choice (SQLite vs Postgres vs MySQL)
- Framework preference (if multiple good options)
- Naming (business name, app title, branding)
- Visual choices (color scheme, layout style)
- Deployment target (Vercel vs Netlify vs AWS)

**DON'T Ask (JUST BUILD):**
- "Should I create a server file?" → YES, create it
- "What dependencies do we need?" → Install industry-standard defaults
- "How should I structure the code?" → Use best practices
- "Do you want error handling?" → YES, add it
- "Should I write tests?" → YES, write them
- Any technical implementation detail → YOU'RE THE EXPERT

**Execution Rules:**
- Use tools FIRST (Write, Bash, Edit), talk SECOND
- Make smart technical decisions using best practices
- Build working implementations, not examples
- Handle errors yourself, don't ask user to fix them
- Present completed, working code
- Ask questions that make it feel like THEIR project

**Remember:**
- They're steering their vision, you're building it into reality
- Present finished work with strategic personalization questions
- Small questions about preferences, big progress on implementation
- Make them feel ownership through strategic choices, not grunt work

**Context:**
- Phase: ${phaseGoal}
- Completed so far: ${completedSubsteps}

**BEGIN NOW:** Use your tools immediately to BUILD the first acceptance criterion. Show completed work, ask strategic questions.**`;
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
   * Micro-Step Generation - Break a step into 3-5 micro-tasks (2-3 min each)
   */
  static microStepGeneration(
    stepTitle: string,
    stepDescription: string,
    acceptanceCriteria: string[],
    projectGoal: string,
  ): string {
    return `You are breaking down a roadmap step into bite-sized micro-tasks.

PROJECT: "${projectGoal}"
STEP: "${stepTitle}"
DESCRIPTION: ${stepDescription}

ACCEPTANCE CRITERIA:
${acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

YOUR JOB: Create 3-5 micro-tasks that are:
1. **2-3 minutes each** (no longer!)
2. **Sequential** (each builds on the previous)
3. **Crystal clear** what "done" looks like
4. **Specific to this project** (not generic)
5. **One focus per micro-task** (don't combine things)

MICRO-TASK SIZING RULES:
✅ GOOD: "Research Minnesota cottage food laws" (2 min)
❌ TOO BIG: "Set up entire commercial kitchen" (hours!)
✅ GOOD: "Create permit checklist from findings" (3 min)
❌ TOO SMALL: "Open Google" (seconds)

MOMENTUM-BUILDING PATTERN:
- Micro-task 1: Quick win (easiest, builds confidence)
- Micro-tasks 2-3: Core work (where the value is)
- Micro-task 4-5: Polish & verify (wrap it up)

Each micro-task must have:
- micro_step_number: 1, 2, 3, etc.
- title: Clear, action-oriented (5-7 words max)
- description: 2-3 sentences explaining what to do and why
- estimated_duration: Human-readable (e.g., "2-3 minutes", "5 minutes")
- acceptance_criteria: 1-3 bullet points defining "done"

EXAMPLE for "Set Up Development Environment":
1. Install Git and create repository (5 min)
   - Download Git, install, create GitHub repo, clone locally
   - Done when: Can commit and push to GitHub

2. Configure Node.js and npm (3 min)
   - Install Node.js LTS, verify npm works, create package.json
   - Done when: "npm --version" shows installed version

3. Deploy Hello World to Vercel (4 min)
   - Create index.html, connect Vercel, deploy, verify live URL
   - Done when: Public URL shows "Hello World"

Return ONLY a JSON array of micro-tasks. Make them HYPER-SPECIFIC to "${projectGoal}".`;
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
