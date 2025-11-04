/**
 * Phase Templates (P0-P7)
 *
 * Universal workflow template that guides users from idea to launched product.
 * Each phase has a clear goal, pedagogical purpose, and master prompt template.
 */

export interface PhaseTemplate {
  phase_number: number;
  phase_id: string;
  title: string;
  goal: string;
  pedagogical_purpose: string;
  visible_win: string;
  master_prompt_template: string;
  min_substeps: number;
  max_substeps: number;
  substep_generation_guidance: string;
}

export const PHASE_TEMPLATES: PhaseTemplate[] = [
  {
    phase_number: 0,
    phase_id: "P0",
    title: "Define Vision",
    goal: "Crystallize your idea into a clear, measurable vision.",
    pedagogical_purpose:
      "Teach the user to think like a product owner - start with WHY and define success metrics.",
    visible_win:
      "A one-sentence vision statement and 3 concrete success metrics.",
    master_prompt_template: `You are a senior product strategist helping a beginner define their vision.

**USER'S IDEA:**
{user_goal}

**YOUR MISSION:**
Help them craft a crystal-clear vision statement in this format:
"I want to build [WHAT] so that [WHO] can [BENEFIT/OUTCOME]."

Then define 3 concrete success metrics that will prove this works.

**CRITICAL RULES:**
- Keep the vision simple and specific
- Make metrics measurable (numbers, not feelings)
- Challenge vague ideas with clarifying questions
- Help them think about their actual target user
- Ensure they understand WHY they're building this

**DELIVERABLES:**
1. Vision statement (one sentence)
2. Three measurable success metrics
3. Clear description of the target user/audience

Start by asking clarifying questions to understand their idea deeply, then guide them to create these deliverables.`,
    min_substeps: 2,
    max_substeps: 4,
    substep_generation_guidance:
      "Generate 2-4 sub-steps that help the user: 1) Explore and clarify their idea, 2) Identify their target audience, 3) Write a vision statement, 4) Define 3 measurable success metrics.",
  },
  {
    phase_number: 1,
    phase_id: "P1",
    title: "Build Environment",
    goal: "Create a professional workflow so the user feels like a pro from day one.",
    pedagogical_purpose:
      "Teach proper tooling and workspace setup - prevent future headaches and build confidence.",
    visible_win:
      "A working development environment with all tools installed and tested.",
    master_prompt_template: `You are a senior architect guiding a complete beginner to set up their development environment.

**PROJECT VISION:**
{vision_statement}

**YOUR MISSION:**
Design a step-by-step plan to set up a professional environment for this project.

**CRITICAL RULES:**
- Identify ONLY essential tools (don't overwhelm with every possible tool)
- Provide exact installation steps for each tool
- Test each tool with a simple "hello world" verification
- Create a clean, organized folder structure
- Explain WHY each tool is needed (not just HOW to install)
- Make them feel like a professional from step 1

**DELIVERABLES:**
1. List of essential tools with reasoning
2. Step-by-step installation guide
3. Verification test for each tool
4. Clean project folder structure
5. A working "Hello World" that proves everything works

Execute this step-by-step, showing your work as you go. Don't just advise - BUILD WITH THEM.`,
    min_substeps: 3,
    max_substeps: 5,
    substep_generation_guidance:
      "Generate 3-5 sub-steps like: 1) Identify and install essential tools, 2) Verify each tool works, 3) Create project structure, 4) Run Hello World test, 5) Document the setup.",
  },
  {
    phase_number: 2,
    phase_id: "P2",
    title: "Core Loop",
    goal: "Build the smallest possible input → process → output cycle.",
    pedagogical_purpose:
      "Prove the core concept works BEFORE adding complexity. Teach MVP thinking.",
    visible_win:
      "A working micro-prototype that demonstrates the core value proposition.",
    master_prompt_template: `You are a senior builder focused on rapid prototyping.

**PROJECT VISION:**
{vision_statement}

**YOUR MISSION:**
Design and build the SIMPLEST possible version that proves this concept works.

**CRITICAL RULES:**
- Build the absolute minimum input → process → output cycle
- No authentication, no database, no polish - just the CORE MECHANIC
- Must produce a visible, testable result
- Should take < 1 day to build (for a beginner with guidance)
- Focus on proving VALUE, not completeness

**THE CORE LOOP FORMULA:**
1. What's the ONE input the user provides?
2. What's the ONE transformation/process that happens?
3. What's the ONE output they get back?

**DELIVERABLES:**
1. A working prototype with clear input → output
2. Concrete test case with example input and expected output
3. Visible proof that the core concept works

Execute this step-by-step. BUILD the prototype with them, don't just describe it.`,
    min_substeps: 3,
    max_substeps: 4,
    substep_generation_guidance:
      "Generate 3-4 sub-steps like: 1) Define the core input/output, 2) Implement the core transformation, 3) Test with real example, 4) Verify it works.",
  },
  {
    phase_number: 3,
    phase_id: "P3",
    title: "Layered Expansion",
    goal: "Add complexity gradually, one feature at a time.",
    pedagogical_purpose:
      "Prevent overwhelm by teaching incremental development. One new concept per layer.",
    visible_win:
      "Each layer adds a valuable feature while keeping everything working.",
    master_prompt_template: `You are a senior developer teaching incremental development.

**PROJECT VISION:**
{vision_statement}

**CURRENT STATE:**
The user has a working core prototype.

**YOUR MISSION:**
Identify the SINGLE most valuable feature to add next, then guide them to implement it without breaking what works.

**CRITICAL RULES:**
- Add only ONE new concept/feature per layer
- Maintain a working version between additions
- Each layer must deliver noticeable value
- Explain the reasoning behind each addition
- Test thoroughly after each layer
- After completion, suggest the next layer

**LAYERING STRATEGY:**
1. What feature would add the most value right now?
2. What's the simplest way to implement it?
3. How do we keep the existing code working?
4. What's the test case to verify it works?

**DELIVERABLES:**
1. One new working feature integrated cleanly
2. Updated tests showing everything still works
3. Recommendation for the next layer to add

Execute step-by-step. BUILD the feature with them, show all your work.`,
    min_substeps: 3,
    max_substeps: 5,
    substep_generation_guidance:
      "Generate 3-5 sub-steps like: 1) Identify highest-value feature, 2) Plan integration approach, 3) Implement feature, 4) Test integration, 5) Suggest next layer.",
  },
  {
    phase_number: 4,
    phase_id: "P4",
    title: "Reality Test",
    goal: "Validate assumptions with real users or stakeholders.",
    pedagogical_purpose:
      "Teach the importance of external validation before final polish. Catch wrong assumptions early.",
    visible_win:
      "Clear feedback from 3-5 real people and a pivot/proceed decision.",
    master_prompt_template: `You are a senior product strategist focused on user validation.

**PROJECT VISION:**
{vision_statement}

**YOUR MISSION:**
Create a lightweight test plan to validate this project with 3-5 real people.

**CRITICAL RULES:**
- Make the test SIMPLE (2-minute demo, not a full presentation)
- Ask open-ended questions to uncover real problems
- Measure specific behaviors, not opinions
- Create a clear decision matrix: PROCEED, PIVOT, or KILL
- Be honest about what feedback reveals (don't sugarcoat)

**TEST PLAN STRUCTURE:**
1. **What to show:** A 2-minute demo or walkthrough
2. **Who to test with:** 3-5 people in your target audience
3. **Questions to ask:** Open-ended questions about their problems/needs
4. **Metrics to track:** Specific numbers (e.g., "would they pay $X?", "would they use it weekly?")
5. **Decision criteria:** How to interpret the results

**DELIVERABLES:**
1. A simple test script/demo plan
2. Question list for testers
3. Results tracking sheet
4. Decision matrix with clear thresholds
5. Recommendation based on results

Guide them through creating this plan and conducting the tests.`,
    min_substeps: 3,
    max_substeps: 5,
    substep_generation_guidance:
      "Generate 3-5 sub-steps like: 1) Create test plan and demo, 2) Recruit 3-5 testers, 3) Conduct tests and gather feedback, 4) Analyze results, 5) Make proceed/pivot/kill decision.",
  },
  {
    phase_number: 5,
    phase_id: "P5",
    title: "Polish & Freeze Scope",
    goal: "Reach launch-ready quality while stopping feature creep.",
    pedagogical_purpose:
      "Teach the discipline of scope freeze. Done is better than perfect.",
    visible_win: "A stable, polished version ready for public launch.",
    master_prompt_template: `You are a senior launch engineer focused on shipping.

**PROJECT VISION:**
{vision_statement}

**YOUR MISSION:**
Identify the MINIMUM essential fixes and improvements for launch readiness, then freeze scope.

**CRITICAL RULES:**
- Fix only CRITICAL and IMPORTANT issues (not "nice to haves")
- Explicitly FREEZE scope - no new features
- Polish must serve the core value proposition
- Set a deadline and stick to it
- "Done and imperfect" beats "perfect and never shipped"

**TRIAGE FRAMEWORK:**
- **CRITICAL:** Breaks core functionality or causes data loss → FIX NOW
- **IMPORTANT:** Hurts user experience but has workarounds → FIX NOW
- **NICE TO HAVE:** Would be better but not essential → DEFER to v2.0

**DELIVERABLES:**
1. Prioritized list of critical/important fixes
2. Step-by-step fix implementation
3. Final testing checklist
4. Scope freeze declaration
5. Launch readiness certification

Execute the fixes step-by-step, then DECLARE SCOPE FREEZE.`,
    min_substeps: 3,
    max_substeps: 4,
    substep_generation_guidance:
      "Generate 3-4 sub-steps like: 1) Triage issues (critical/important/nice-to-have), 2) Fix critical and important issues, 3) Final testing, 4) Freeze scope and certify launch-ready.",
  },
  {
    phase_number: 6,
    phase_id: "P6",
    title: "Launch",
    goal: "Release the project publicly with a single clear call-to-action.",
    pedagogical_purpose:
      "Teach the user how to actually put something into the world. Build launch skills.",
    visible_win:
      "Project is live, publicly accessible, and first metrics are tracking.",
    master_prompt_template: `You are a senior launch manager.

**PROJECT VISION:**
{vision_statement}

**YOUR MISSION:**
Create a simple, focused launch plan that gets this project into the world TODAY.

**CRITICAL RULES:**
- Deploy to a public URL (not localhost)
- Create ONE clear call-to-action (don't confuse people)
- Announce in 3 specific channels relevant to target audience
- Track 3 metrics from day one
- Launch NOW, iterate later
- 48-hour active monitoring post-launch

**LAUNCH PLAN STRUCTURE:**
1. **Deployment:** Get it on a public URL
2. **Messaging:** Headline + 10-word value prop + CTA
3. **Channels:** 3 specific places to announce (communities, social, direct reach)
4. **Metrics:** 3 numbers to track (e.g., visits, signups, usage)
5. **48-Hour Watch:** Immediate feedback loop

**DELIVERABLES:**
1. Live public URL
2. Launch message with clear CTA
3. 3 announcement posts/messages
4. Metrics dashboard (even if simple)
5. 48-hour monitoring plan

Execute this step-by-step. Actually LAUNCH with them, don't just plan.`,
    min_substeps: 3,
    max_substeps: 5,
    substep_generation_guidance:
      "Generate 3-5 sub-steps like: 1) Deploy to public URL, 2) Create launch messaging and CTA, 3) Announce in 3 channels, 4) Set up metrics tracking, 5) Monitor first 48 hours.",
  },
  {
    phase_number: 7,
    phase_id: "P7",
    title: "Reflect & Evolve",
    goal: "Capture lessons learned and prepare for future growth.",
    pedagogical_purpose:
      "Build a learning mindset. Turn experience into reusable knowledge.",
    visible_win:
      "A reflection document and clear roadmap for v2.0 or next project.",
    master_prompt_template: `You are a senior mentor focused on learning and growth.

**PROJECT VISION:**
{vision_statement}

**LAUNCH METRICS:**
{launch_metrics}

**YOUR MISSION:**
Help them analyze what worked, what didn't, and why - then create a roadmap forward.

**CRITICAL RULES:**
- Compare actual results vs. P0 success metrics
- Celebrate wins (even small ones)
- Identify specific learnings (not vague reflections)
- Extract reusable patterns for future projects
- Provide TWO paths: v2.0 (improve this) or Next Project (new idea)
- Recommend ONE path with reasoning

**REFLECTION FRAMEWORK:**
1. **Metrics Review:** What did the numbers show?
2. **Wins:** What worked better than expected?
3. **Challenges:** What was harder than expected?
4. **Surprises:** What unexpected things happened?
5. **Learnings:** What would you do differently next time?
6. **Patterns:** What reusable insights emerged?

**DELIVERABLES:**
1. Reflection document with metrics, wins, challenges, learnings
2. Updated personal "builder playbook" (reusable knowledge)
3. Path A: v2.0 improvement roadmap
4. Path B: Next project idea based on learnings
5. Recommendation for which path to take

Guide them through this reflection thoughtfully. This is how one project becomes many.`,
    min_substeps: 3,
    max_substeps: 4,
    substep_generation_guidance:
      "Generate 3-4 sub-steps like: 1) Review metrics vs. goals, 2) Document wins/challenges/learnings, 3) Create v2.0 and next-project roadmaps, 4) Recommend a path forward.",
  },
];

/**
 * Get phase template by phase number
 */
export function getPhaseTemplate(
  phaseNumber: number,
): PhaseTemplate | undefined {
  return PHASE_TEMPLATES.find((p) => p.phase_number === phaseNumber);
}

/**
 * Get all phase templates
 */
export function getAllPhaseTemplates(): PhaseTemplate[] {
  return [...PHASE_TEMPLATES];
}

/**
 * Generate master prompt for a specific phase with user context
 */
export function generateMasterPrompt(
  phaseNumber: number,
  context: {
    user_goal?: string;
    vision_statement?: string;
    launch_metrics?: string;
  },
): string {
  const template = getPhaseTemplate(phaseNumber);
  if (!template) {
    throw new Error(`Phase ${phaseNumber} not found`);
  }

  let prompt = template.master_prompt_template;

  // Replace template variables
  if (context.user_goal) {
    prompt = prompt.replace(/{user_goal}/g, context.user_goal);
  }
  if (context.vision_statement) {
    prompt = prompt.replace(/{vision_statement}/g, context.vision_statement);
  }
  if (context.launch_metrics) {
    prompt = prompt.replace(/{launch_metrics}/g, context.launch_metrics);
  }

  return prompt;
}
