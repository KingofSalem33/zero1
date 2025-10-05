import { makeOpenAI } from "../ai";
import { ENV } from "../env";
import { runModel } from "../ai/runModel";
import { toolSpecs, toolMap } from "../ai/tools";
import {
  Project,
  PhaseGenerationRequest,
  PhaseGenerationResponse,
  CompleteSubstepRequest,
  CompleteSubstepResponse,
} from "./types";

// In-memory storage for demo purposes
// In production, this would be replaced with database operations
const projects: Map<string, Project> = new Map();

export class StepOrchestrator {
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Progressive revelation: Only expand Phase 1 initially
  async createProjectWithPhase1(goal: string): Promise<Project> {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    console.log(
      "🎯 [CREATE] Creating project with Phase 1 expansion for:",
      goal,
    );

    // First generate high-level phases
    const phaseResponse = await this.generatePhases({
      goal,
      clarification_context:
        "Initial project creation - no clarification needed.",
    });

    // Now expand only Phase 1 with substeps
    const phase1 = phaseResponse.phases[0];
    if (phase1) {
      const expandedPhase1 = await this.expandPhaseWithSubsteps(phase1, goal);

      const now = new Date().toISOString();
      const project: Project = {
        id: this.generateId(),
        goal,
        status: "active",
        current_phase: 1,
        current_substep: 1,
        phases: [
          // Phase 1: Fully expanded with substeps
          {
            ...expandedPhase1,
            phase_number: 1,
            expanded: true,
            locked: false,
            completed: false,
            created_at: now,
          },
          // Phase 2+: High-level only, locked
          ...phaseResponse.phases.slice(1).map((phase, index) => ({
            ...phase,
            phase_number: index + 2,
            substeps: [], // No substeps until unlocked
            expanded: false,
            locked: true,
            completed: false,
            created_at: now,
          })),
        ],
        history: [],
        created_at: now,
        updated_at: now,
      };

      projects.set(project.id, project);
      console.log("✅ [CREATE] Project created with Phase 1 expanded");
      return project;
    }

    throw new Error("Failed to generate initial phases");
  }

  async createProject(goal: string): Promise<Project> {
    return this.createProjectWithPhase1(goal);
  }

  // Create project with a specific ID (for Supabase UUID)
  async createProjectWithId(id: string, goal: string): Promise<Project> {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    console.log("🎯 [CREATE] Creating project with ID:", id);

    // First generate high-level phases
    const phaseResponse = await this.generatePhases({
      goal,
      clarification_context:
        "Initial project creation - no clarification needed.",
    });

    // Now expand only Phase 1 with substeps
    const phase1 = phaseResponse.phases[0];
    if (phase1) {
      const expandedPhase1 = await this.expandPhaseWithSubsteps(phase1, goal);

      const now = new Date().toISOString();
      const project: Project = {
        id, // Use the provided ID instead of generating one
        goal,
        status: "active",
        current_phase: 1,
        current_substep: 1,
        phases: [
          // Phase 1: Fully expanded with substeps
          {
            ...expandedPhase1,
            phase_number: 1,
            expanded: true,
            locked: false,
            completed: false,
            created_at: now,
          },
          // Phase 2+: High-level only, locked
          ...phaseResponse.phases.slice(1).map((phase, index) => ({
            ...phase,
            phase_number: index + 2,
            substeps: [], // No substeps until unlocked
            expanded: false,
            locked: true,
            completed: false,
            created_at: now,
          })),
        ],
        history: [],
        created_at: now,
        updated_at: now,
      };

      projects.set(project.id, project);
      console.log("✅ [CREATE] Project created with ID:", id);
      return project;
    }

    throw new Error("Failed to generate initial phases");
  }

  async generatePhases(
    request: PhaseGenerationRequest,
  ): Promise<PhaseGenerationResponse> {
    console.log("🎯 [PHASES] Using P1-P7 roadmap for project:", request.goal);

    // Fixed P1-P7 roadmap structure based on claude.md
    const phases = [
      {
        phase_id: "P1",
        phase_number: 1,
        goal: "Build Environment",
        why_it_matters:
          "Create a professional workflow so you feel like a pro from day one",
        acceptance_criteria: [
          "Essential tools identified and installed",
          "Clean project workspace created",
          "Hello World milestone completed to confirm everything works",
        ],
        rollback_plan: [
          "Reset workspace",
          "Remove installed tools",
          "Return to vision phase",
        ],
        substeps: [],
        locked: false,
      },
      {
        phase_id: "P2",
        phase_number: 2,
        goal: "Core Loop",
        why_it_matters:
          "Build the smallest possible input → process → output cycle to prove the concept",
        acceptance_criteria: [
          "Minimal version of core value created",
          "Basic input-process-output cycle working",
          "Micro-prototype demonstrates core idea",
        ],
        rollback_plan: [
          "Return to environment setup",
          "Simplify scope further",
        ],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P3",
        phase_number: 3,
        goal: "Layered Expansion",
        why_it_matters:
          "Add complexity gradually, one concept at a time without overwhelming",
        acceptance_criteria: [
          "One new valuable feature added successfully",
          "Working version maintained between additions",
          "Noticeable upgrade delivered",
        ],
        rollback_plan: [
          "Remove last addition",
          "Return to core loop",
          "Simplify feature set",
        ],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P4",
        phase_number: 4,
        goal: "Reality Test",
        why_it_matters:
          "Validate assumptions with real users before final polish",
        acceptance_criteria: [
          "Authentic feedback gathered from 3-5 real users",
          "Gaps between vision and reality identified",
          "Clear pivot or proceed decision made",
        ],
        rollback_plan: [
          "Return to expansion phase",
          "Revise based on feedback",
        ],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P5",
        phase_number: 5,
        goal: "Polish & Freeze Scope",
        why_it_matters:
          "Reach launch-ready quality while preventing endless iteration",
        acceptance_criteria: [
          "Essential bugs and gaps fixed",
          "Scope frozen to prevent feature creep",
          "Final stable version achieved",
        ],
        rollback_plan: ["Return to testing phase", "Reduce scope further"],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P6",
        phase_number: 6,
        goal: "Launch",
        why_it_matters:
          "Release the project publicly with clear call-to-action",
        acceptance_criteria: [
          "Launch assets and messaging prepared",
          "Project is live and accessible",
          "Initial response and key metrics measured",
        ],
        rollback_plan: ["Return to polish phase", "Fix critical launch issues"],
        substeps: [],
        locked: true,
      },
      {
        phase_id: "P7",
        phase_number: 7,
        goal: "Reflect & Evolve",
        why_it_matters: "Capture lessons learned and prepare for future growth",
        acceptance_criteria: [
          "What worked and didn't work documented",
          "Personal toolkit built for future projects",
          "Roadmap for next project or iteration created",
        ],
        rollback_plan: ["Return to launch phase", "Gather more data"],
        substeps: [],
        locked: true,
      },
    ];

    console.log(
      "✅ [PHASES] Using fixed P1-P7 roadmap with",
      phases.length,
      "phases",
    );

    return {
      phases: phases,
    };
  }

  // Expand a single phase with substeps and master prompts
  async expandPhaseWithSubsteps(phase: any, goal: string): Promise<any> {
    console.log("🔍 [EXPAND] Expanding phase with substeps:", phase.goal);

    // Get the predefined master prompt for this specific phase
    const masterPrompt = this.getMasterPromptForPhase(phase.phase_id, goal);

    // Generate substeps using AI with the specific master prompt
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    const systemPrompt = `You are a Master Builder AI designing substeps for a Zero-to-One project builder.

PHASE: ${phase.goal}
PROJECT VISION: ${goal}
PHASE PURPOSE: ${phase.why_it_matters}

CRITICAL INSTRUCTION:
The "prompt_to_send" field is what another AI will receive to EXECUTE THE WORK. It must be written as if a senior expert is rolling up their sleeves to BUILD alongside the user, NOT give advice.

❌ WRONG (passive advice):
"Establish a clear brand identity. Use Canva to create a logo."

✅ CORRECT (active execution):
"I'm your senior brand strategist with 20 years experience. Let me build your complete brand identity right now. I'll create your color palette (I'm choosing deep navy #1A237E for trust, warm gold #FFA000 for value, and crisp white for clarity). Here's your brand voice: authentic, knowledgeable, passionate about collecting. I'm drafting your mission statement now: 'Connecting collectors with the cards they've been searching for.' Now let me design your logo concept..."

RULES:
1. Generate 3-5 substeps (15-30 min each)
2. Each "prompt_to_send" must start with "I'm a senior [role]" and immediately DO THE WORK
3. The AI should CREATE deliverables (write copy, design systems, generate code, build assets)
4. No "you should" or "consider" - the AI DOES it for them
5. The user collaborates by providing input, the AI executes

RESPONSE FORMAT:
{
  "substeps": [
    {
      "substep_id": "1A",
      "step_number": 1,
      "label": "Clear action-oriented title",
      "prompt_to_send": "I'm a senior [expert role] with 20+ years experience. Let me [DO THE ACTUAL WORK] right now. [CREATE SPECIFIC DELIVERABLES]...",
      "commands": "Tools/resources needed",
      "completed": false
    }
  ]
}`;

    try {
      const result = await client.chat.completions.create({
        model: ENV.OPENAI_MODEL_NAME,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate the substeps for this phase." },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const responseText = result.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(responseText);

      return {
        ...phase,
        master_prompt: masterPrompt,
        substeps: parsed.substeps.map((substep: any, index: number) => ({
          ...substep,
          step_number: index + 1,
          completed: false,
          // Keep the unique master prompt generated for each substep
          prompt_to_send: substep.prompt_to_send,
          created_at: new Date().toISOString(),
        })),
      };
    } catch (error) {
      console.error("❌ [EXPAND] Failed to expand phase:", error);
      // Fallback with pre-defined expert substeps
      const fallbackSubsteps = this.getFallbackSubsteps(
        phase.phase_id,
        phase.goal,
        goal,
      );
      return {
        ...phase,
        master_prompt: masterPrompt,
        substeps: fallbackSubsteps,
      };
    }
  }

  // Get the expert master prompt for each phase based on claude.md
  private getMasterPromptForPhase(phaseId: string, userVision: string): string {
    const masterPrompts: Record<string, string> = {
      P1: `A professional environment is the foundation of success. Here's how to set up like a pro:

**Project Context:** ${userVision}

**Essential Setup Strategy:**

1. **Tools & Infrastructure**: Identify the core tools professionals in this domain use daily. Don't over-engineer - start with the 3-5 most critical ones.

2. **Workspace Architecture**: Design your space (physical or digital) for deep work. Remove distractions, organize resources within arm's reach, establish clear boundaries.

3. **Professional Credibility**: Secure any licenses, permits, accounts, or credentials needed to operate legitimately in this space.

4. **Proof-of-Concept Milestone**: Create the smallest possible demonstration that your setup works - a "hello world" moment that proves you're ready to build.

**Pro Tip**: The goal isn't perfection, it's professional capability. You should feel confident saying "I'm ready to start" after this phase.

**Domain-Specific Considerations**: Different project types need different setups. A tech project needs development environment, a business needs legal structure, a creative project needs production tools.`,

      P2: `Every successful project starts with the simplest version that proves the core concept. Here's the input→process→output framework:

**Project Vision:** ${userVision}

**Core Loop Essentials:**

1. **Define Your Input**: What's the simplest form of raw material your project consumes? (customer request, data, raw material, etc.)

2. **Design Your Process**: What's the ONE core transformation that creates value? Strip away everything else.

3. **Deliver Your Output**: What's the minimal viable result that proves your concept works?

**The 24-Hour Rule**: Your core loop must be completable in one focused work session. If it takes longer, it's not minimal enough.

**Real-World Examples:**
- App: Single button → simple function → visible result
- Business: One customer → core service → payment received
- Content: One piece → distribution → audience feedback

**Success Metric**: Someone else should be able to understand your project's value proposition within 30 seconds of seeing your core loop in action.`,

      P3: `Strategic expansion beats feature creep every time. Here's how to grow systematically:

**Current Foundation:** ${userVision}

**The Single-Addition Principle:**

1. **Assess What's Working**: Document exactly what your current version does well. Don't break what's already valuable.

2. **Identify the One Big Gap**: What's the single most obvious limitation preventing wider adoption or deeper value?

3. **Layer, Don't Replace**: Add new functionality as a layer on top of existing systems, not a replacement for them.

4. **Test Continuously**: Each addition should be validated independently before moving to the next layer.

**Expansion Priority Framework:**
- **Must-Have**: Solves a real user pain point
- **Should-Have**: Enhances existing value significantly
- **Could-Have**: Nice to have, but doesn't move the needle

**The Golden Rule**: If you can't explain why this specific addition matters in one sentence, it's not ready to build.

**Next Layer Planning**: Always end this phase with a clear sense of what layer 3 should tackle.`,

      P4: `Real user feedback is the only validation that matters. Here's how to gather it without wasting time:

**Project Context:** ${userVision}

**The 3-5 Person Rule**: More feedback isn't better feedback. Find 3-5 people who represent your target audience and go deep.

**Testing Structure:**

1. **What to Show**: Present your actual working project, not a mockup. Let them interact with the real thing.

2. **Questions That Matter**:
   - "What problem does this solve for you?"
   - "What would make this significantly more valuable?"
   - "Would you actually use/buy/recommend this?"

3. **Metrics to Track**:
   - Time to understand the value proposition
   - Willingness to take next action (sign up, pay, refer)
   - Specific improvement suggestions

**The Pivot vs. Proceed Decision Matrix:**
- **Proceed**: Clear value understanding + positive engagement + actionable feedback
- **Pivot**: Confusion about purpose + low engagement + fundamental objections

**Pro Insight**: If users can't explain your project's value in their own words, you haven't built the right thing yet.`,

      P5: `Launch-ready means good enough to put your reputation behind. Here's the quality threshold:

**Project Context:** ${userVision}

**The Essential Fixes Framework:**

1. **Critical Path Issues**: Anything that breaks the core user journey must be fixed. No exceptions.

2. **Professional Polish**: Your project should feel intentional, not amateur. Focus on the details users actually notice.

3. **Scope Lock**: No new features. This phase is about fixing, not building.

**Priority Order:**
- **P0**: Core functionality broken or unreliable
- **P1**: User experience feels unprofessional or confusing
- **P2**: Edge cases that affect real usage
- **P3**: Nice-to-haves that don't impact launch success

**Quality Checklist:**
- [ ] Core user journey works 100% of the time
- [ ] Error states are handled gracefully
- [ ] User interface feels intentional and clean
- [ ] Performance is acceptable for intended use
- [ ] Content is proofread and accurate

**The Launch Litmus Test**: Would you confidently demo this to someone whose opinion you respect?`,

      P6: `A focused launch beats a scattered announcement every time. Here's the proven formula:

**Project Context:** ${userVision}

**The Single CTA Strategy:**

1. **One Clear Action**: What's the ONE thing you want people to do? Sign up, buy, download, follow? Pick one.

2. **Launch Platform Selection**: Where does your audience actually spend time? Start there, expand later.

3. **Message Clarity**: Your launch message should answer "What is this?" and "Why should I care?" in under 10 seconds.

**Launch Sequence:**
- **Pre-Launch**: Build anticipation with 2-3 people who care about your success
- **Launch Day**: Share in 2-3 places maximum, with consistent messaging
- **Post-Launch**: Follow up with initial users for testimonials and improvements

**Critical Metrics (First 72 Hours):**
1. **Awareness**: How many people saw your launch?
2. **Engagement**: How many took your desired action?
3. **Quality**: How positive was the initial feedback?

**Launch Success Formula**: Consistent message + Right audience + Clear next step = Sustainable momentum

**Pro Tip**: A small launch that gets real users beats a big launch that gets only views.`,

      P7: `The best builders learn systematically from every project. Here's how to capture what matters:

**Project Context:** ${userVision}

**The Three-Lens Analysis:**

1. **What Worked**: Document the decisions, processes, and strategies that delivered results. These become your repeatable playbook.

2. **What Didn't**: Identify the bottlenecks, mistakes, and dead ends. Understanding failure prevents repetition.

3. **What You'd Do Differently**: With perfect hindsight, what would you change about your approach?

**Personal Toolkit Development:**
- **Process Wins**: Which workflows made you most productive?
- **Tool Discoveries**: What software, resources, or methods proved invaluable?
- **Mental Models**: What frameworks helped you make better decisions?

**Next Project Planning:**
- **Skill Gaps**: What abilities would make your next project easier?
- **Resource Needs**: What tools or knowledge should you acquire first?
- **Project Selection**: Based on this experience, what type of project should you tackle next?

**Documentation Format**: Keep it simple - bullet points, not essays. Focus on actionable insights you'll actually reference later.

**The Growth Mindset**: Every project is training for the next one. The goal isn't perfection, it's systematic improvement.`,
    };

    return (
      masterPrompts[phaseId] ||
      `Help me work on ${phaseId} for the project: ${userVision}`
    );
  }

  // Get fallback substeps when AI generation fails
  private getFallbackSubsteps(
    phaseId: string,
    phaseGoal: string,
    userVision: string,
  ): any[] {
    const fallbacksByPhase: Record<string, any[]> = {
      P1: [
        {
          substep_id: "1A",
          step_number: 1,
          label: "Identify Essential Tools",
          prompt_to_send: `I'm a senior setup strategist with 20 years of experience. Let me identify the essential tools you need for "${userVision}". I'm analyzing your project type and creating a curated list of the 3-5 core tools professionals use in this domain. For each tool, I'll explain why it's critical and how to get started with it quickly.`,
          commands: "Research tools, create checklist",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1B",
          step_number: 2,
          label: "Set Up Workspace",
          prompt_to_send: `I'm a senior workflow architect with 15 years of experience. Let me design your professional workspace right now for "${userVision}". I'm creating your folder structure, organizing your resources, and establishing clear boundaries for focused work. I'll show you exactly how professionals in this domain organize their workspace for maximum productivity.`,
          commands: "Create folders, organize resources",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1C",
          step_number: 3,
          label: "Secure Credentials & Accounts",
          prompt_to_send: `I'm a senior operations specialist with 12 years of experience. Let me set up all the accounts and credentials you need for "${userVision}". I'm creating a checklist of required licenses, permits, accounts, and credentials. For each one, I'll provide the exact steps to obtain it and why it's necessary for operating legitimately.`,
          commands: "Create accounts, document credentials",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1D",
          step_number: 4,
          label: "Create Hello World Milestone",
          prompt_to_send: `I'm a senior implementation expert with 18 years of experience. Let me create your "Hello World" moment for "${userVision}". I'm designing the smallest possible demonstration that proves your setup works. This will be your confidence booster - concrete proof that you're ready to start building.`,
          commands: "Create simple proof of concept",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P2: [
        {
          substep_id: "2A",
          step_number: 1,
          label: "Define Core Input",
          prompt_to_send: `I'm a senior systems architect with 20 years of experience. Let me define the core input for "${userVision}". I'm identifying the simplest form of raw material your project consumes - whether that's a customer request, data, raw material, or something else. I'll show you exactly what the minimum viable input looks like.`,
          commands: "Define input requirements",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2B",
          step_number: 2,
          label: "Build Core Process",
          prompt_to_send: `I'm a senior process engineer with 15 years of experience. Let me build the core transformation process for "${userVision}". I'm creating the ONE transformation that creates value - the heart of your project. This is where the magic happens, and I'm going to make it as simple and effective as possible.`,
          commands: "Implement core logic",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2C",
          step_number: 3,
          label: "Create Minimal Output",
          prompt_to_send: `I'm a senior product designer with 12 years of experience. Let me create the minimal output for "${userVision}". I'm designing the simplest result that proves your concept works. This output will demonstrate your project's value in 30 seconds or less.`,
          commands: "Design output format",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2D",
          step_number: 4,
          label: "Test Core Loop",
          prompt_to_send: `I'm a senior quality engineer with 18 years of experience. Let me test your core loop for "${userVision}". I'm running the complete input→process→output cycle to ensure everything works. I'll identify any issues and help you fix them so you have a solid foundation to build on.`,
          commands: "Test end-to-end flow",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P3: [
        {
          substep_id: "3A",
          step_number: 1,
          label: "Identify Next Feature",
          prompt_to_send: `I'm a senior product strategist with 20 years of experience. Let me identify the most valuable feature to add next to "${userVision}". I'm analyzing your current core loop and determining which single addition will create the biggest impact. I'll explain exactly why this feature matters and how it fits into your vision.`,
          commands: "Prioritize features",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3B",
          step_number: 2,
          label: "Design Feature Integration",
          prompt_to_send: `I'm a senior systems designer with 15 years of experience. Let me design how this new feature integrates with "${userVision}". I'm creating a step-by-step plan that adds complexity without breaking what already works. You'll see exactly how this new layer connects to your existing foundation.`,
          commands: "Plan integration approach",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3C",
          step_number: 3,
          label: "Implement Feature",
          prompt_to_send: `I'm a senior implementation specialist with 18 years of experience. Let me implement this feature for "${userVision}". I'm building it step-by-step, testing as we go, ensuring your working version stays stable. You'll see tangible progress with each step.`,
          commands: "Build new feature",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3D",
          step_number: 4,
          label: "Validate Enhancement",
          prompt_to_send: `I'm a senior validation expert with 12 years of experience. Let me validate this enhancement to "${userVision}". I'm testing that the new feature delivers the expected value and doesn't break existing functionality. You'll see concrete evidence of the noticeable upgrade this addition provides.`,
          commands: "Test and validate",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P4: [
        {
          substep_id: "4A",
          step_number: 1,
          label: "Design Test Plan",
          prompt_to_send: `I'm a senior research strategist with 20 years of experience. Let me design a lightweight test plan for "${userVision}". I'm creating a simple framework to validate your assumptions with 3-5 real users. I'll show you exactly what to show them, what questions to ask, and what metrics to measure.`,
          commands: "Create test framework",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4B",
          step_number: 2,
          label: "Recruit Test Users",
          prompt_to_send: `I'm a senior user research coordinator with 15 years of experience. Let me help you recruit the right test users for "${userVision}". I'm identifying where your target users are and creating outreach messages that will get responses. You'll have 3-5 committed testers who match your audience.`,
          commands: "Find and recruit users",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4C",
          step_number: 3,
          label: "Conduct Testing Sessions",
          prompt_to_send: `I'm a senior UX researcher with 18 years of experience. Let me guide your testing sessions for "${userVision}". I'm creating a script for you to follow, questions to ask, and observation techniques to use. You'll gather authentic feedback that reveals the gaps between your vision and reality.`,
          commands: "Run user tests",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4D",
          step_number: 4,
          label: "Analyze & Decide",
          prompt_to_send: `I'm a senior product analyst with 12 years of experience. Let me analyze your test results for "${userVision}". I'm synthesizing the feedback, identifying patterns, and creating a clear recommendation: pivot or proceed. You'll have a data-backed decision with specific next steps.`,
          commands: "Synthesize feedback, make decision",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P5: [
        {
          substep_id: "5A",
          step_number: 1,
          label: "Audit Critical Issues",
          prompt_to_send: `I'm a senior quality auditor with 20 years of experience. Let me audit "${userVision}" for critical issues. I'm systematically reviewing your project to identify essential bugs, gaps, and rough edges that must be fixed before launch. I'll prioritize them by impact so you focus on what truly matters.`,
          commands: "Review and document issues",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5B",
          step_number: 2,
          label: "Fix Priority Issues",
          prompt_to_send: `I'm a senior troubleshooting specialist with 15 years of experience. Let me fix the priority issues in "${userVision}". I'm working through the critical bugs and gaps systematically, ensuring each fix is stable and doesn't create new problems. You'll see your project transform into launch-ready quality.`,
          commands: "Resolve critical bugs",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5C",
          step_number: 3,
          label: "Freeze Scope",
          prompt_to_send: `I'm a senior project manager with 18 years of experience. Let me freeze the scope for "${userVision}". I'm drawing a clear line - no new features, only essential fixes. I'll help you resist the temptation to add "just one more thing" and commit to launching what you have.`,
          commands: "Document scope boundary",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5D",
          step_number: 4,
          label: "Final Stability Check",
          prompt_to_send: `I'm a senior QA engineer with 12 years of experience. Let me perform a final stability check on "${userVision}". I'm testing all core functionality end-to-end, verifying that everything works reliably. You'll have confidence that your project is truly ready for the world.`,
          commands: "Final testing and validation",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P6: [
        {
          substep_id: "6A",
          step_number: 1,
          label: "Prepare Launch Assets",
          prompt_to_send: `I'm a senior launch coordinator with 20 years of experience. Let me prepare your launch assets for "${userVision}". I'm creating your announcement copy, screenshots, demo materials, and any other collateral you need. Each asset will clearly communicate your project's value.`,
          commands: "Create launch materials",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6B",
          step_number: 2,
          label: "Set Up Analytics",
          prompt_to_send: `I'm a senior analytics specialist with 15 years of experience. Let me set up tracking for "${userVision}". I'm implementing the 3 key metrics you should watch post-launch: user acquisition, engagement, and conversion. You'll have clear visibility into how your launch is performing.`,
          commands: "Configure tracking and metrics",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6C",
          step_number: 3,
          label: "Execute Launch",
          prompt_to_send: `I'm a senior launch strategist with 18 years of experience. Let me execute the launch for "${userVision}". I'm publishing to your chosen platforms, posting announcements, and activating your distribution channels. Your project is going live with a clear call-to-action that drives the response you want.`,
          commands: "Publish and announce",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6D",
          step_number: 4,
          label: "Monitor Initial Response",
          prompt_to_send: `I'm a senior growth analyst with 12 years of experience. Let me monitor the initial response to "${userVision}". I'm watching your metrics, gathering early feedback, and identifying quick wins or issues. You'll know within 24-48 hours how your launch is performing and what to adjust.`,
          commands: "Track metrics and feedback",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P7: [
        {
          substep_id: "7A",
          step_number: 1,
          label: "Document What Worked",
          prompt_to_send: `I'm a senior retrospective facilitator with 20 years of experience. Let me help you document what worked in "${userVision}". I'm guiding you through a systematic analysis of the decisions, processes, and strategies that delivered results. These insights become your repeatable playbook for future projects.`,
          commands: "Capture successful patterns",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7B",
          step_number: 2,
          label: "Analyze What Didn't",
          prompt_to_send: `I'm a senior failure analyst with 15 years of experience. Let me help you analyze what didn't work in "${userVision}". I'm identifying the bottlenecks, mistakes, and dead ends without judgment. Understanding these failures prevents repetition and accelerates your growth.`,
          commands: "Document lessons learned",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7C",
          step_number: 3,
          label: "Build Personal Toolkit",
          prompt_to_send: `I'm a senior knowledge management specialist with 18 years of experience. Let me help you build your personal toolkit from "${userVision}". I'm extracting the workflows, tools, and mental models that proved valuable. You'll have a curated collection of assets for your next project.`,
          commands: "Create reusable resources",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7D",
          step_number: 4,
          label: "Plan Next Project",
          prompt_to_send: `I'm a senior career strategist with 12 years of experience. Let me help you plan your next project after "${userVision}". Based on what you've learned, I'm identifying skill gaps to fill, resources to acquire, and the type of project that will maximize your growth. You're moving from 1 to many.`,
          commands: "Design growth roadmap",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
    };

    const defaultFallback = [
      {
        substep_id: `${phaseId.replace("P", "")}A`,
        step_number: 1,
        label: `Start ${phaseGoal}`,
        prompt_to_send: `I'm a senior expert with 20 years of experience. Let me help you with ${phaseGoal} for "${userVision}". I'm creating a comprehensive plan and executing the first steps to get you moving forward immediately.`,
        commands: "Begin phase work",
        completed: false,
        created_at: new Date().toISOString(),
      },
    ];

    return fallbacksByPhase[phaseId] || defaultFallback;
  }

  // Manual substep completion with phase unlocking logic
  async completeSubstep(
    request: CompleteSubstepRequest,
  ): Promise<CompleteSubstepResponse> {
    console.log(
      "✅ [COMPLETE] Completing substep:",
      request.substep_id,
      "for project:",
      request.project_id,
    );

    const project = projects.get(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    // Find and mark substep as complete
    let substepFound = false;
    let currentPhase: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    for (const phase of project.phases) {
      const substep = phase.substeps.find(
        (s: any) => s.substep_id === request.substep_id,
      );
      if (substep) {
        substep.completed = true;
        substepFound = true;
        currentPhase = phase;
        break;
      }
    }

    if (!substepFound) {
      throw new Error("Substep not found");
    }

    // Check if all substeps in current phase are complete
    const allSubstepsComplete = currentPhase.substeps.every(
      (s: any) => s.completed,
    );

    let unlockedPhase: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (allSubstepsComplete) {
      // Complete current phase
      currentPhase.completed = true;
      console.log(
        `🎉 [COMPLETE] Phase ${currentPhase.phase_number} completed!`,
      );

      // Find and unlock next phase
      const nextPhase = project.phases.find(
        (
          p: any, // eslint-disable-line @typescript-eslint/no-explicit-any
        ) => p.phase_number === currentPhase.phase_number + 1 && p.locked,
      );

      if (nextPhase) {
        console.log(`🔓 [UNLOCK] Unlocking Phase ${nextPhase.phase_number}`);

        // Expand next phase with substeps
        const expandedNextPhase = await this.expandPhaseWithSubsteps(
          nextPhase,
          project.goal,
        );

        // Update the phase in the project
        const nextPhaseIndex = project.phases.findIndex(
          (p: any) => p.phase_id === nextPhase.phase_id,
        );
        project.phases[nextPhaseIndex] = {
          ...expandedNextPhase,
          phase_number: nextPhase.phase_number,
          expanded: true,
          locked: false,
          completed: false,
          created_at: nextPhase.created_at,
        };

        project.current_phase = nextPhase.phase_number;
        unlockedPhase = project.phases[nextPhaseIndex];
      }
    }

    project.updated_at = new Date().toISOString();
    projects.set(request.project_id, project);

    return {
      project,
      phase_unlocked: unlockedPhase,
      message: allSubstepsComplete
        ? unlockedPhase
          ? `Phase ${currentPhase.phase_number} completed! Phase ${unlockedPhase.phase_number} unlocked.`
          : `Phase ${currentPhase.phase_number} completed! Project finished!`
        : `Substep ${request.substep_id} completed.`,
    };
  }

  getProject(projectId: string): Project | undefined {
    return projects.get(projectId);
  }

  getAllProjects(): Project[] {
    return Array.from(projects.values());
  }

  detectMasterPrompt(input: string, phases: any[]): string | null {
    // Simple detection logic - look for phase-related keywords
    const lowerInput = input.toLowerCase();

    for (const phase of phases) {
      const phaseKeywords = [
        phase.goal?.toLowerCase(),
        phase.phase_id?.toLowerCase(),
        `phase ${phase.phase_number}`,
      ].filter(Boolean);

      for (const keyword of phaseKeywords) {
        if (lowerInput.includes(keyword)) {
          return phase.phase_id;
        }
      }
    }

    return null;
  }

  async executeStep(request: {
    project_id: string;
    master_prompt: string;
    user_message?: string;
  }): Promise<any> {
    console.log(
      "🚀 [EXECUTE] Processing master prompt for project:",
      request.project_id,
    );

    const project = projects.get(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    // Get current context
    const currentPhase = project.phases.find(
      (p) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    const systemMessage = `You are helping with project execution. You have access to these tools:
- \`web_search\`: Search the web for current information using DuckDuckGo
- \`http_fetch\`: Fetch and read content from specific URLs
- \`calculator\`: Perform mathematical calculations
- \`file_search\`: Search through uploaded files for relevant content

Provide comprehensive, helpful responses using the tools when appropriate. Do not include source URLs in your responses.

After providing your response, ask the immediate next logical question to aid the user in completing the task. Be direct and specific - focus on the exact next action needed.

PROJECT CONTEXT:
- Goal: ${project.goal}
- Current Phase: ${currentPhase?.goal || "Unknown"}
- Current Step: ${currentSubstep?.label || "Unknown"}

MASTER PROMPT FROM SYSTEM:
${request.master_prompt}`;

    const userMessage =
      request.user_message ||
      "Please help me with this step. Provide detailed, actionable guidance to help me complete this specific step. Be practical and specific to my project context.";

    try {
      const result = await runModel(
        [
          {
            role: "system",
            content: systemMessage,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        {
          toolSpecs,
          toolMap,
          model: ENV.OPENAI_MODEL_NAME,
        },
      );

      console.log("✅ [EXECUTE] AI response generated successfully");

      return {
        ok: true,
        response: result.text,
        citations: result.citations,
        context: {
          phase: currentPhase?.goal,
          step: currentSubstep?.label,
          project_goal: project.goal,
        },
      };
    } catch (error) {
      console.error("❌ [EXECUTE] AI request failed:", error);
      throw new Error("Failed to process master prompt with AI");
    }
  }

  async expandPhase(request: {
    project_id: string;
    phase_id: string;
    master_prompt_input: string;
  }): Promise<any> {
    const project = projects.get(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const phase = project.phases.find(
      (p: any) => p.phase_id === request.phase_id,
    );
    if (!phase) {
      throw new Error("Phase not found");
    }

    if (phase.expanded) {
      return {
        project,
        phase,
        message: "Phase already expanded",
      };
    }

    // Expand the phase with substeps
    const expandedPhase = await this.expandPhaseWithSubsteps(
      phase,
      project.goal,
    );

    // Update the phase in the project
    const phaseIndex = project.phases.findIndex(
      (p: any) => p.phase_id === request.phase_id,
    );
    project.phases[phaseIndex] = {
      ...expandedPhase,
      expanded: true,
      locked: false,
    };

    // Update project's current phase if needed
    if (phase.phase_number <= project.current_phase) {
      project.current_phase = phase.phase_number;
    }

    project.updated_at = new Date().toISOString();
    projects.set(request.project_id, project);

    return {
      project,
      phase: project.phases[phaseIndex],
      message: `Phase ${phase.phase_number} expanded successfully`,
    };
  }
}
