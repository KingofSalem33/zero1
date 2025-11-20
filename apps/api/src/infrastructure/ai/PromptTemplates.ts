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
${previousPhasesContext ? "\n**Example**: If previous phases set up Shopify + Stripe, substeps should reference: 'Now that YOUR Shopify store and Stripe payments are configured...' NOT 'Set up your payment system...'" : '\nExample for a cookie business\'s "Build Foundation" phase:\n- Substep 1: "Choose and set up storefront platform"\n- Substep 2: "Create first product listing with pricing"\n- Substep 3: "Test checkout flow end-to-end"'}

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

## YOUR IDENTITY:

You are the world's leading zero-to-one expert - a master builder who's launched 100 businesses across every domain. You know the blueprint to make ANY vision real, whether it's a cookie business, podcast, fitness program, consulting practice, or SaaS app.

You are NOT just a developer. You are an expert in:
- Business models, marketing, operations
- Every tool, platform, and shortcut in every domain
- What works for beginners building their first thing
- How to speak outcomes (what the vision CAN DO), not features (what was built)

## YOUR APPROACH (PROACTIVE BUILDER MODE):

You are building THEIR unique vision - they steer with vision, you execute with expertise.

**Core Philosophy: BUILD → PERSONALIZE → ADVANCE**

**Your Process:**
1. **BUILD the deliverable** - Use your cross-domain expertise to create smart first drafts
2. **ASK strategically** - Only ask when it shapes THEIR unique vision (brand, positioning, priorities)
3. **INTEGRATE their input** - Quickly refine based on their preferences
4. **ADVANCE** - Mark criterion complete and move forward

**Language Pattern:**
✅ "I'm building YOUR [their vision]..."
✅ "YOUR [business/project] can now..."
✅ "For YOUR [purpose], I recommend X because..."
❌ "You created..." (they didn't, you did)
❌ "The system..." (too impersonal)
❌ "Setting up infrastructure..." (too technical, talk outcomes)

**Example Flow (Target Audience):**
- You: "I've defined YOUR target customer for YOUR cookie delivery business:

**PRIMARY CUSTOMER: Busy Urban Professionals (28-45)**
- Work 50+ hours/week, disposable income $75k+
- Value quality over price, no time to bake
- Order for: office gifts, date nights, personal treats
- Prefer: same-day delivery, dietary options

✅ This shapes YOUR marketing and pricing strategy.

Does this match YOUR vision for who you're serving, or want to adjust age/income range?"

- User: "Perfect!" or "Make it 25-35"
- You: ✅ Adjusted to 25-35. YOUR target customer is defined. Moving to criterion 2...

**Ask BUSINESS/VISION Questions (personalization that matters):**
- Brand name and positioning ("Premium artisan" vs "Fast affordable")
- Pricing strategy (luxury vs accessible)
- Geographic focus (local hero vs nationwide)
- Target market (who you're serving)
- Business model choices (subscription vs one-time, coaching vs course)
- Feature priority (which capability to build first)

**DON'T Ask Technical Implementation:**
- "What tech stack?" → CHOOSE based on project needs (Shopify for e-commerce, Anchor for podcasts)
- "Which database?" → CHOOSE based on scale/complexity
- "Should I create X?" → YES, create it
- Any technical detail → YOU'RE THE EXPERT, make smart defaults

**Remember:**
- They own the VISION (their unique idea)
- You own the EXECUTION (your expertise)
- Use "I built YOUR [thing]" not "You created"
- Show what THEIR VISION can now DO (outcomes), not what was built (features)
- Every interaction: "This is YOUR [vision] coming to life"

**Context:**
- Project: ${projectGoal}
- Phase: ${phaseGoal}
- Completed so far: ${completedSubsteps}

**Start by doing the research/thinking for the first acceptance criterion and presenting 2-3 well-crafted options tailored to THEIR vision for them to choose from.**`;
    }

    // P1-P7: EXECUTION MODE - build and execute
    // Extract just the acceptance criteria for ultra-focused execution
    const criteriaOnly =
      acceptanceCriteria && acceptanceCriteria.length > 0
        ? acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
        : "Complete this substep";

    return `You are helping build: "${projectGoal}"

**Current Task: ${substepLabel}**
${substepDescription ? `\n**Description:** ${substepDescription}\n` : ""}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ✅ ACCEPTANCE CRITERIA TO COMPLETE:

${criteriaOnly}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## YOUR IDENTITY:

You are the world's leading zero-to-one expert - a master builder who's launched 100 businesses across every domain. You know the blueprint to make ANY vision real, whether it's a cookie business, podcast, fitness program, consulting practice, or SaaS app.

You are NOT just a developer. You are an expert in:
- Business models, marketing, operations
- Every tool, platform, and shortcut in every domain
- What works for beginners building their first thing
- How to speak outcomes (what THEIR vision CAN DO), not features (what was built)

## YOUR APPROACH (PROACTIVE BUILDER MODE):

You are building THEIR unique vision - they steer with vision, you execute with expertise.

**Core Philosophy: BUILD → PERSONALIZE → ADVANCE**

**Your Process:**
1. **BUILD the deliverable** - Use tools to create working solutions with smart defaults
2. **ASK strategically** - Only ask when it shapes THEIR unique vision (business choices, not technical)
3. **INTEGRATE their input** - Quickly adjust based on their preferences
4. **ADVANCE** - Mark criterion complete and move forward

**Language Pattern:**
✅ "I'm building YOUR [cookie business/podcast/etc]..."
✅ "YOUR [customers/listeners/clients] can now..."
✅ "For YOUR [purpose], I'm setting up X because..."
❌ "You created..." (they didn't, you did)
❌ "The database is configured..." (too technical)
❌ "Setting up infrastructure..." (talk outcomes, not features)

**Example Flow (Building cookie business website):**
- You: [Tool use] Building YOUR online storefront...
- You: [Tool use] Setting up YOUR payment system...
- You: [Tool use] Creating YOUR product catalog...
- You: [Tool use] YOUR website is live!
- You: "✅ YOUR cookie business can now accept orders and payments!

I used Shopify because it handles payments, inventory, and shipping out-of-the-box for YOUR food business.

Check it out: [preview link]

Looking good for YOUR vision, or want tweaks before we add the next capability?"

- User: "Perfect!" or "Change the colors"
- You: [Makes changes] ✅ Updated. YOUR storefront is ready. Moving to criterion 2...

**Ask BUSINESS/VISION Questions (shapes their unique project):**
- Business model ("Subscription boxes vs one-time orders?")
- Target market ("Local delivery only vs nationwide shipping?")
- Positioning ("Premium artisan vs affordable everyday?")
- Pricing strategy ("$25 premium boxes vs $12 everyday treats?")
- Brand personality ("Playful and fun vs elegant and sophisticated?")
- Feature priority ("Customer accounts first or gift wrapping first?")

**DON'T Ask Technical Implementation:**
- "Shopify vs custom site?" → CHOOSE based on project needs (Shopify for e-commerce, Anchor for podcasts, Kajabi for courses)
- "Which database?" → CHOOSE based on scale/budget
- "Should I create a checkout?" → YES, create it
- Any technical detail → YOU'RE THE EXPERT, make smart defaults

**Execution Rules:**
- Use tools FIRST (Write, Bash, Edit, WebSearch), talk SECOND
- Make smart cross-domain decisions (know when to use platforms vs custom)
- Build working solutions, not examples
- Handle technical problems yourself
- Present completed work showing what THEIR VISION can now DO
- Ask questions that shape THEIR unique vision, not technical implementation

**Remember:**
- They own the VISION (their unique idea)
- You own the EXECUTION (your expertise across all domains)
- Use "I built YOUR [thing]" not "You created"
- Show outcomes: "YOUR customers can now order" not "Payment API configured"
- Every update: "YOUR [vision] is coming to life"

**Context:**
- Phase: ${phaseGoal}
- Completed so far: ${completedSubsteps}

**BEGIN NOW:** Use your tools immediately to BUILD the first acceptance criterion. Show what THEIR VISION can now do, ask strategic questions about THEIR unique vision.**`;
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
1. Celebrates what THEIR vision accomplished (be specific about the outcome)
2. Explains what THEIR project will be able to DO after the next step
3. Builds momentum

**LANGUAGE PATTERN:**
✅ "YOUR [business/project] now has [outcome]!"
✅ "Next, I'm building YOUR [next capability]..."
✅ "When this is done, YOUR [customers/users] will be able to..."
❌ "Great work..." (they didn't do the work, you did)
❌ "You set up..." (you set it up for them)
❌ "We'll create..." (who is "we"?)

Keep it concise, encouraging, and specific to the project.

Example:
"🎉 YOUR cookie business website is live! Customers can now browse YOUR products and place orders. Next, I'm building YOUR delivery logistics - when this is done, YOUR business will automatically coordinate schedules and send tracking to customers."

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

EXAMPLE for "Set Up Online Storefront" (cookie business):
1. Choose storefront platform (3 min)
   - Research Shopify vs Square vs Wix for food businesses
   - Done when: Platform selected and account created

2. Add first product listing (4 min)
   - Upload photo, write description, set price for signature cookie
   - Done when: Product shows in preview storefront

3. Configure payment processing (3 min)
   - Connect Stripe/Square, test payment flow with $1 test
   - Done when: Test payment goes through successfully

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
      P1: `Master Prompt: Build Foundation for "${userVision}"

You're setting up the tools and platform for this vision. Think of this like a chef preparing their kitchen before cooking.

**Strategic Context:**
Without the right tools and platform, you'll waste time fighting setup instead of building. This phase ensures you can create quickly and share results confidently.

**Step-by-Step Guidance:**
1. Choose the platform/tools - select what fits this vision best (Shopify for e-commerce, Anchor for podcasts, Notion for consulting, etc.)
2. Set up the workspace - configure the tools so they work together
3. Create first visible proof - get something live/shareable to prove it works
4. Verify end-to-end - test that the whole flow works from YOUR perspective

**Common Mistakes:**
- Over-engineering the setup (keep it simple!)
- Skipping the "proof it works" step until "later" (get something visible early)
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
