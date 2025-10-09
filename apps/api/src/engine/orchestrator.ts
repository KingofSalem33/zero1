import { makeOpenAI } from "../ai";
import { ENV } from "../env";
import { runModel } from "../ai/runModel";
import { runModelStream } from "../ai/runModelStream";
import { toolSpecs, toolMap } from "../ai/tools";
import type { Response } from "express";
import { threadService } from "../services/threadService";
import type { ChatCompletionMessageParam } from "openai/resources";
import { supabase } from "../db";
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
The "prompt_to_send" field is a SYSTEM-LEVEL instruction to an AI that will execute this substep. Write it as if you're instructing a senior expert to execute work on behalf of the user, then hand off deliverables for the user to review/modify.

❌ WRONG (first-person role-play):
"I'm a senior brand strategist. Let me build your brand identity..."

❌ WRONG (passive advice):
"Establish a clear brand identity. Use Canva to create a logo."

✅ CORRECT (system-level expert instruction):
"You are a senior brand strategist with 20+ years of experience building iconic brands. We are in Phase P1: Build Environment — Substep 2: Brand Identity Foundation for '${goal}'.

Execute this step now:
- Generate a complete brand identity system including color palette (3-4 colors with hex codes), typography recommendations, brand voice description, and mission statement
- Create a ready-to-use brand guide document the user can copy
- Return copy-paste-ready content with 2-3 sentences explaining why each choice supports the project vision

End by instructing the user to review the brand guide, make any modifications, and upload their finalized version. You will review and mark this substep complete."

MASTER PROMPT STRUCTURE:
1. Identity & Authority: "You are the [expert role] with 20+ years of experience..."
2. Context: "We are in Phase [P#]: [Phase Goal] — Substep [#]: [Substep Label]"
3. Action to Execute: Clear commands of what to generate/build
4. Deliverable: Exact output format (code, document, template, etc.)
5. User Handoff: What user should do next and upload requirement

RULES:
1. Generate 3-5 substeps (15-30 min each)
2. Each prompt is written TO the AI, not AS the AI
3. Focus on generating copy-paste-ready deliverables
4. Always end with upload/review instruction
5. Keep substeps small enough to complete in one focused session

RESPONSE FORMAT:
{
  "substeps": [
    {
      "substep_id": "1A",
      "step_number": 1,
      "label": "Clear action-oriented title",
      "prompt_to_send": "You are the [expert role] with 20+ years experience. We are in Phase [P#]: [Goal] — Substep [#]: [Label]. Execute this step now: [specific actions]. Return [specific deliverable]. End by instructing the user to [upload/review action].",
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
          prompt_to_send: `You are a senior setup strategist with 20+ years of experience helping beginners build professional environments. We are in Phase P1: Build Environment — Substep 1: Identify Essential Tools for "${userVision}".

Execute this step now:
- Analyze the project type and generate a curated list of 3-5 core tools professionals use in this domain
- For each tool, provide the name, what it does, why it's critical, and a quick-start link
- Create a copy-paste-ready checklist with checkboxes

Return the tools list in markdown format with brief explanations (2-3 sentences per tool) showing why each matters for this specific project.

End by instructing the user to review the list, research any unfamiliar tools, and reply with "Tools reviewed" when ready to proceed.`,
          commands: "Research tools, create checklist",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1B",
          step_number: 2,
          label: "Set Up Workspace",
          prompt_to_send: `You are a senior workflow architect with 20+ years of experience designing productive workspaces. We are in Phase P1: Build Environment — Substep 2: Set Up Workspace for "${userVision}".

Execute this step now:
- Generate a complete folder structure optimized for this project type
- Provide terminal commands or step-by-step instructions to create the structure
- Include a brief guide on organizing resources (files, links, notes) for maximum focus

Return copy-paste-ready commands plus a 2-3 sentence explanation of the organizational philosophy.

End by instructing the user to create the workspace, take a screenshot of their folder structure, and upload it for review. You will confirm setup completion.`,
          commands: "Create folders, organize resources",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1C",
          step_number: 3,
          label: "Secure Credentials & Accounts",
          prompt_to_send: `You are a senior operations specialist with 20+ years of experience setting up business infrastructure. We are in Phase P1: Build Environment — Substep 3: Secure Credentials & Accounts for "${userVision}".

Execute this step now:
- Create a checklist of required accounts, licenses, permits, and credentials for this project type
- For each item, explain why it's necessary and provide the exact URL or process to obtain it
- Include a simple password manager recommendation and setup guide

Return a markdown checklist with links and brief explanations (1-2 sentences each).

End by instructing the user to work through the checklist, document their credentials securely, and reply with "Accounts created" when done.`,
          commands: "Create accounts, document credentials",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "1D",
          step_number: 4,
          label: "Create Hello World Milestone",
          prompt_to_send: `You are a senior implementation expert with 20+ years of experience building first prototypes. We are in Phase P1: Build Environment — Substep 4: Create Hello World Milestone for "${userVision}".

Execute this step now:
- Design the smallest possible proof-of-concept that demonstrates the setup works
- Provide step-by-step instructions or starter code/template for this "hello world" moment
- Explain what success looks like in 2-3 sentences

Return copy-paste-ready instructions, code, or template that the user can execute immediately.

End by instructing the user to complete the hello world demo, screenshot or document the result, and upload it for review. You will celebrate this milestone and mark the substep complete.`,
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
          prompt_to_send: `You are a senior systems architect with 20+ years of experience designing minimal viable products. We are in Phase P2: Core Loop — Substep 1: Define Core Input for "${userVision}".

Execute this step now:
- Identify the simplest form of raw material this project consumes (customer request, data file, physical item, etc.)
- Define the minimum required fields/attributes for this input
- Create a sample input example the user can reference

Return a clear definition document with the input specification and 1-2 real-world examples.

End by instructing the user to create their own sample input based on this spec, save it, and upload it for validation.`,
          commands: "Define input requirements",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2B",
          step_number: 2,
          label: "Build Core Process",
          prompt_to_send: `You are a senior process engineer with 20+ years of experience building transformation systems. We are in Phase P2: Core Loop — Substep 2: Build Core Process for "${userVision}".

Execute this step now:
- Design the ONE core transformation that creates value from the input
- Provide pseudocode, workflow diagram, or step-by-step process description
- Strip away all non-essential complexity

Return a clear process blueprint with copy-paste-ready implementation outline or starter code.

End by instructing the user to implement this process using the provided blueprint, test it with their sample input, and upload the working implementation for review.`,
          commands: "Implement core logic",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2C",
          step_number: 3,
          label: "Create Minimal Output",
          prompt_to_send: `You are a senior product designer with 20+ years of experience creating MVPs. We are in Phase P2: Core Loop — Substep 3: Create Minimal Output for "${userVision}".

Execute this step now:
- Design the simplest result that proves the concept works
- Define the output format (file, screen, object, etc.)
- Create a template or example of what successful output looks like

Return an output specification with examples showing the value delivered in 30 seconds or less.

End by instructing the user to generate their first output using the core process, compare it to the example, and upload their result for validation.`,
          commands: "Design output format",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "2D",
          step_number: 4,
          label: "Test Core Loop",
          prompt_to_send: `You are a senior quality engineer with 20+ years of experience validating systems. We are in Phase P2: Core Loop — Substep 4: Test Core Loop for "${userVision}".

Execute this step now:
- Create a test checklist for the complete input→process→output cycle
- Identify potential failure points and edge cases
- Define what "working" means for this MVP

Return a testing guide with specific validation steps and success criteria.

End by instructing the user to run through the complete test checklist, document any issues found, and upload their test results. You will help troubleshoot any problems and confirm the core loop is solid.`,
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
          prompt_to_send: `You are a senior product strategist with 20+ years of experience scaling MVPs. We are in Phase P3: Layered Expansion — Substep 1: Identify Next Feature for "${userVision}".

Execute this step now:
- Analyze the current core loop and identify which single feature addition will create the biggest impact
- Explain why this feature matters and how it amplifies the project vision
- Provide 2-3 specific examples of how users will benefit

Return a feature proposal document with clear rationale and expected value.

End by instructing the user to review the proposal, suggest any modifications, and reply with "Feature approved" to proceed.`,
          commands: "Prioritize features",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3B",
          step_number: 2,
          label: "Design Feature Integration",
          prompt_to_send: `You are a senior systems designer with 20+ years of experience integrating new capabilities. We are in Phase P3: Layered Expansion — Substep 2: Design Feature Integration for "${userVision}".

Execute this step now:
- Create a step-by-step integration plan that adds this feature without breaking existing functionality
- Identify potential risks and mitigation strategies
- Design how this new layer connects to the existing foundation

Return an integration blueprint with clear steps, diagrams if helpful, and risk assessment.

End by instructing the user to review the plan, ask clarifying questions, and when ready, proceed to implementation.`,
          commands: "Plan integration approach",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3C",
          step_number: 3,
          label: "Implement Feature",
          prompt_to_send: `You are a senior implementation specialist with 20+ years of experience building features incrementally. We are in Phase P3: Layered Expansion — Substep 3: Implement Feature for "${userVision}".

Execute this step now:
- Provide step-by-step implementation instructions or starter code
- Include checkpoints to test functionality at each stage
- Ensure the working version stays stable throughout

Return copy-paste-ready code/instructions with inline comments explaining each step.

End by instructing the user to implement the feature following the guide, test at each checkpoint, and upload their working implementation for review.`,
          commands: "Build new feature",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "3D",
          step_number: 4,
          label: "Validate Enhancement",
          prompt_to_send: `You are a senior validation expert with 20+ years of experience testing new features. We are in Phase P3: Layered Expansion — Substep 4: Validate Enhancement for "${userVision}".

Execute this step now:
- Create a validation checklist confirming the feature delivers expected value
- Design regression tests ensuring existing functionality still works
- Define success criteria for this enhancement

Return a test plan with specific validation steps and success metrics.

End by instructing the user to run through all validation tests, document results, and upload evidence that the enhancement works as intended.`,
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
          prompt_to_send: `You are a senior research strategist with 20+ years of experience validating products with real users. We are in Phase P4: Reality Test — Substep 1: Design Test Plan for "${userVision}".

Execute this step now:
- Create a lightweight framework to test with 3-5 real users
- Define exactly what to show them, what questions to ask, and what metrics to measure
- Design a feedback collection method (survey, interview script, observation notes)

Return a complete test plan with user recruitment criteria, testing script, and measurement framework.

End by instructing the user to review the plan, make any adjustments, and reply when ready to recruit test users.`,
          commands: "Create test framework",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4B",
          step_number: 2,
          label: "Recruit Test Users",
          prompt_to_send: `You are a senior user research coordinator with 20+ years of experience finding the right test participants. We are in Phase P4: Reality Test — Substep 2: Recruit Test Users for "${userVision}".

Execute this step now:
- Identify where the target users are (communities, platforms, networks)
- Draft outreach messages that will get responses (3-5 templates for different channels)
- Provide tips for getting commitments from busy people

Return recruitment materials with outreach templates and sourcing strategy.

End by instructing the user to reach out using the templates, track responses, and report back when they have 3-5 committed testers.`,
          commands: "Find and recruit users",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4C",
          step_number: 3,
          label: "Conduct Testing Sessions",
          prompt_to_send: `You are a senior UX researcher with 20+ years of experience conducting user tests. We are in Phase P4: Reality Test — Substep 3: Conduct Testing Sessions for "${userVision}".

Execute this step now:
- Create a testing session script with introduction, tasks, and debrief questions
- Provide observation techniques to capture authentic reactions
- Design a note-taking template to organize feedback

Return a complete session guide with scripts, observation tips, and feedback capture template.

End by instructing the user to run sessions with their recruited testers, take thorough notes, and upload their raw feedback for analysis.`,
          commands: "Run user tests",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "4D",
          step_number: 4,
          label: "Analyze & Decide",
          prompt_to_send: `You are a senior product analyst with 20+ years of experience synthesizing user research. We are in Phase P4: Reality Test — Substep 4: Analyze & Decide for "${userVision}".

Execute this step now:
- Create an analysis framework to identify patterns in the feedback
- Generate clear recommendations: pivot or proceed
- Provide specific next steps based on the decision

Return an analysis report with key findings, decision recommendation, and action items.

End by instructing the user to review the analysis, discuss any questions, and confirm their decision (pivot or proceed) to move forward.`,
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
          prompt_to_send: `You are a senior quality auditor with 20+ years of experience preparing products for launch. We are in Phase P5: Polish & Freeze Scope — Substep 1: Audit Critical Issues for "${userVision}".

Execute this step now:
- Systematically review the project to identify essential bugs, gaps, and rough edges
- Create a prioritized issue list ranked by impact (critical, important, nice-to-have)
- Provide specific recommendations for each critical item

Return an audit report with categorized issues and fix recommendations.

End by instructing the user to review the audit, add any issues they've noticed, and confirm the priority list before starting fixes.`,
          commands: "Review and document issues",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5B",
          step_number: 2,
          label: "Fix Priority Issues",
          prompt_to_send: `You are a senior troubleshooting specialist with 20+ years of experience fixing critical bugs. We are in Phase P5: Polish & Freeze Scope — Substep 2: Fix Priority Issues for "${userVision}".

Execute this step now:
- Create a fix plan for each critical and important issue
- Provide step-by-step troubleshooting guides or code fixes
- Include validation steps to ensure fixes don't create new problems

Return fix instructions with implementation guides and validation checklists.

End by instructing the user to work through the fixes systematically, test each one, and upload evidence that critical issues are resolved.`,
          commands: "Resolve critical bugs",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5C",
          step_number: 3,
          label: "Freeze Scope",
          prompt_to_send: `You are a senior project manager with 20+ years of experience shipping products. We are in Phase P5: Polish & Freeze Scope — Substep 3: Freeze Scope for "${userVision}".

Execute this step now:
- Create a clear scope freeze declaration: what's in, what's out
- Document any "nice-to-have" features that are deferred to v2
- Provide a commitment script to resist feature creep

Return a scope freeze document with clear boundaries and v2 feature backlog.

End by instructing the user to sign off on the scope freeze, commit to launching what exists, and move to final stability testing.`,
          commands: "Document scope boundary",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "5D",
          step_number: 4,
          label: "Final Stability Check",
          prompt_to_send: `You are a senior QA engineer with 20+ years of experience validating launch readiness. We are in Phase P5: Polish & Freeze Scope — Substep 4: Final Stability Check for "${userVision}".

Execute this step now:
- Create a comprehensive end-to-end testing checklist
- Test all core functionality in realistic conditions
- Document the definition of "launch ready" for this project

Return a final testing protocol with pass/fail criteria for each test.

End by instructing the user to complete all tests, document results, and upload their final stability report. You will celebrate their launch readiness.`,
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
          prompt_to_send: `You are a senior launch coordinator with 20+ years of experience creating compelling launch materials. We are in Phase P6: Launch — Substep 1: Prepare Launch Assets for "${userVision}".

Execute this step now:
- Draft announcement copy that clearly communicates the project's value
- Create a checklist of needed assets (screenshots, demo video, social graphics, etc.)
- Provide templates or examples for each asset type

Return launch asset package with copy templates and asset creation guides.

End by instructing the user to create or gather all assets, review for quality, and upload them for final approval before launch.`,
          commands: "Create launch materials",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6B",
          step_number: 2,
          label: "Set Up Analytics",
          prompt_to_send: `You are a senior analytics specialist with 20+ years of experience tracking product performance. We are in Phase P6: Launch — Substep 2: Set Up Analytics for "${userVision}".

Execute this step now:
- Identify the 3 key metrics to track post-launch (acquisition, engagement, conversion)
- Provide implementation guides for setting up tracking (Google Analytics, Mixpanel, etc.)
- Create a simple dashboard template to monitor performance

Return analytics setup guide with tracking implementation and dashboard design.

End by instructing the user to implement tracking, test that events are firing correctly, and confirm analytics are ready for launch day.`,
          commands: "Configure tracking and metrics",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6C",
          step_number: 3,
          label: "Execute Launch",
          prompt_to_send: `You are a senior launch strategist with 20+ years of experience executing product launches. We are in Phase P6: Launch — Substep 3: Execute Launch for "${userVision}".

Execute this step now:
- Create a launch day checklist (publish to platforms, post announcements, activate channels)
- Draft platform-specific posts with clear calls-to-action
- Provide a launch sequence timeline (what to post when and where)

Return launch execution plan with timeline, posts, and checklist.

End by instructing the user to execute the launch following the plan, screenshot confirmation of going live, and share the launch post links.`,
          commands: "Publish and announce",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "6D",
          step_number: 4,
          label: "Monitor Initial Response",
          prompt_to_send: `You are a senior growth analyst with 20+ years of experience monitoring launches. We are in Phase P6: Launch — Substep 4: Monitor Initial Response for "${userVision}".

Execute this step now:
- Create a 24-48 hour monitoring checklist (metrics to watch, feedback to collect)
- Define what "success" looks like for the initial response
- Provide quick adjustment guidelines based on early signals

Return monitoring guide with success criteria and response protocols.

End by instructing the user to track performance for 48 hours, gather early feedback, and report back with initial results and any urgent issues.`,
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
          prompt_to_send: `You are a senior retrospective facilitator with 20+ years of experience capturing project insights. We are in Phase P7: Reflect & Evolve — Substep 1: Document What Worked for "${userVision}".

Execute this step now:
- Create a reflection framework to analyze successful decisions, processes, and strategies
- Guide the user through identifying what delivered results and why
- Format insights as a repeatable playbook for future projects

Return a reflection template with guiding questions and documentation structure.

End by instructing the user to complete the reflection, document their successes, and upload their "what worked" analysis.`,
          commands: "Capture successful patterns",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7B",
          step_number: 2,
          label: "Analyze What Didn't",
          prompt_to_send: `You are a senior failure analyst with 20+ years of experience learning from setbacks. We are in Phase P7: Reflect & Evolve — Substep 2: Analyze What Didn't Work for "${userVision}".

Execute this step now:
- Create a judgment-free framework for identifying bottlenecks, mistakes, and dead ends
- Help the user extract lessons from challenges without dwelling on negativity
- Turn failures into actionable prevention strategies

Return a failure analysis template with structured reflection questions.

End by instructing the user to honestly assess what didn't work, extract lessons, and upload their insights to prevent future repetition.`,
          commands: "Document lessons learned",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7C",
          step_number: 3,
          label: "Build Personal Toolkit",
          prompt_to_send: `You are a senior knowledge management specialist with 20+ years of experience building reusable systems. We are in Phase P7: Reflect & Evolve — Substep 3: Build Personal Toolkit from "${userVision}".

Execute this step now:
- Help the user extract workflows, tools, and mental models that proved valuable
- Create templates or checklists they can reuse on future projects
- Build a curated resource collection for their next venture

Return a toolkit template with categories for processes, tools, templates, and frameworks.

End by instructing the user to populate their toolkit with reusable assets from this project and save it for future reference.`,
          commands: "Create reusable resources",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "7D",
          step_number: 4,
          label: "Plan Next Project",
          prompt_to_send: `You are a senior career strategist with 20+ years of experience guiding builders through growth. We are in Phase P7: Reflect & Evolve — Substep 4: Plan Next Project after "${userVision}".

Execute this step now:
- Identify skill gaps to fill based on this project's challenges
- Recommend resources to acquire (tools, knowledge, connections)
- Suggest project types that will maximize growth (moving from 1 to many)

Return a growth roadmap with skill development plan and next project recommendations.

End by instructing the user to review the roadmap, choose their next focus area, and celebrate completing their journey from zero to one.`,
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
        prompt_to_send: `You are a senior expert with 20+ years of experience in this domain. We are working on "${userVision}" — current phase: ${phaseGoal}.

Execute this step now:
- Create a comprehensive plan for this phase
- Provide copy-paste-ready templates, instructions, or starter materials
- Break down the work into clear, achievable steps

Return actionable deliverables the user can immediately use.

End by instructing the user to review the materials, complete the work, and upload their results for validation.`,
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

    const project = await this.getProjectAsync(request.project_id);
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

    // Persist to Supabase (write-through cache)
    try {
      await supabase
        .from("projects")
        .update({
          current_phase: project.current_phase,
          roadmap: project.phases,
          status: project.status,
          updated_at: project.updated_at,
        })
        .eq("id", request.project_id);
    } catch (err) {
      console.error(
        "[ORCHESTRATOR] Error persisting substep completion to Supabase:",
        err,
      );
      // Don't fail the operation if Supabase write fails
    }

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

  // Load project from Supabase and cache in memory
  private async loadProjectFromSupabase(
    projectId: string,
  ): Promise<Project | null> {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error || !data) {
        return null;
      }

      // Transform Supabase row to Project type
      const project: Project = {
        id: data.id,
        goal: data.goal,
        status: data.status,
        current_phase: data.current_phase || 1,
        current_substep: data.current_substep || 1,
        phases: data.roadmap || [],
        history: [],
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      // Cache in memory
      projects.set(projectId, project);
      return project;
    } catch (err) {
      console.error("[ORCHESTRATOR] Error loading project from Supabase:", err);
      return null;
    }
  }

  // Get project with Supabase fallback
  getProject(projectId: string): Project | undefined {
    // First check in-memory cache
    const cached = projects.get(projectId);
    if (cached) {
      return cached;
    }

    // Note: This is synchronous but loadProjectFromSupabase is async
    // For now, return undefined and let caller use async version
    return undefined;
  }

  // Async version for proper Supabase loading
  async getProjectAsync(projectId: string): Promise<Project | undefined> {
    // First check in-memory cache
    const cached = projects.get(projectId);
    if (cached) {
      return cached;
    }

    // Load from Supabase
    const loaded = await this.loadProjectFromSupabase(projectId);
    return loaded || undefined;
  }

  async getAllProjects(): Promise<Project[]> {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .order("created_at", { ascending: false });

      if (error || !data) {
        console.error("[ORCHESTRATOR] Error fetching projects:", error);
        return Array.from(projects.values());
      }

      // Transform and cache all projects
      const allProjects = data.map((row) => {
        const project: Project = {
          id: row.id,
          goal: row.goal,
          status: row.status,
          current_phase: row.current_phase || 1,
          current_substep: row.current_substep || 1,
          phases: row.roadmap || [],
          history: [],
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
        projects.set(project.id, project);
        return project;
      });

      return allProjects;
    } catch (err) {
      console.error("[ORCHESTRATOR] Error fetching all projects:", err);
      return Array.from(projects.values());
    }
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

    const project = await this.getProjectAsync(request.project_id);
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
- \`web_search\`: Search the web for current information using Google
- \`http_fetch\`: Fetch and read content from specific URLs
- \`calculator\`: Perform mathematical calculations
- \`file_search\`: Search through uploaded files for relevant content

When using web_search or http_fetch:
1. Synthesize information from multiple sources into a comprehensive answer
2. Provide specific details, examples, and actionable insights
3. Present information naturally in paragraph form, not as a list of links
4. The system will automatically display citations at the end - don't mention URLs in your response

Provide comprehensive, helpful responses using the tools when appropriate. Be conversational and thorough like ChatGPT.

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

  async executeStepStreaming(request: {
    project_id: string;
    master_prompt: string;
    user_message?: string;
    thread_id?: string;
    res: Response;
  }): Promise<void> {
    console.log(
      "🚀 [EXECUTE] Processing streaming master prompt for project:",
      request.project_id,
    );

    const project = await this.getProjectAsync(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    // Get or create thread (optional - fallback to no thread)
    let thread = null;
    let useThreads = true;
    let accumulatedResponse = ""; // Accumulate AI response to save later

    try {
      thread = request.thread_id
        ? await threadService.getThread(request.thread_id)
        : await threadService.getOrCreateThread(request.project_id);

      // Save user message
      if (request.user_message && thread) {
        await threadService.saveMessage(
          thread.id,
          "user",
          request.user_message,
        );

        // Auto-generate title if this is the first message
        const messages = await threadService.getRecentMessages(thread.id, 1);
        if (messages.length === 1) {
          await threadService.generateTitle(thread.id, request.user_message);
        }
      }
    } catch (error) {
      console.warn(
        "⚠️ [EXECUTE] Thread service unavailable, proceeding without threads:",
        error,
      );
      useThreads = false;
    }

    // Get current context
    const currentPhase = project.phases.find(
      (p) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s) => s.step_number === project.current_substep,
    );

    const systemMessage = `You are helping with project execution. You have access to these tools:
- \`web_search\`: Search the web for current information using Google
- \`http_fetch\`: Fetch and read content from specific URLs
- \`calculator\`: Perform mathematical calculations
- \`file_search\`: Search through uploaded files for relevant content

When using web_search or http_fetch:
1. Synthesize information from multiple sources into a comprehensive answer
2. Provide specific details, examples, and actionable insights
3. Present information naturally in paragraph form, not as a list of links
4. The system will automatically display citations at the end - don't mention URLs in your response

Provide comprehensive, helpful responses using the tools when appropriate. Be conversational and thorough like ChatGPT.

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
      let contextMessages: ChatCompletionMessageParam[];

      if (useThreads && thread) {
        // Build context with recent history
        contextMessages = await threadService.buildContextMessages(
          thread.id,
          systemMessage,
        );

        // Add current user message if not already in history
        if (request.user_message) {
          contextMessages.push({
            role: "user" as const,
            content: userMessage,
          });
        }
      } else {
        // Fallback: simple message without history
        contextMessages = [
          {
            role: "system" as const,
            content: systemMessage,
          },
          {
            role: "user" as const,
            content: userMessage,
          },
        ];
      }

      accumulatedResponse = await runModelStream(request.res, contextMessages, {
        toolSpecs,
        toolMap,
        model: ENV.OPENAI_MODEL_NAME,
      });

      console.log("✅ [EXECUTE] Streaming AI response generated successfully");

      // Save AI response to thread
      if (useThreads && thread && accumulatedResponse) {
        try {
          await threadService.saveMessage(
            thread.id,
            "assistant",
            accumulatedResponse,
          );
          console.log("✅ [EXECUTE] AI response saved to thread");
        } catch (saveError) {
          console.error(
            "⚠️ [EXECUTE] Failed to save AI response to thread:",
            saveError,
          );
        }
      }
    } catch (error) {
      console.error("❌ [EXECUTE] Streaming AI request failed:", error);
      throw error;
    }
  }

  async expandPhase(request: {
    project_id: string;
    phase_id: string;
    master_prompt_input: string;
  }): Promise<any> {
    const project = await this.getProjectAsync(request.project_id);
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

    // Persist to Supabase (write-through cache)
    try {
      await supabase
        .from("projects")
        .update({
          current_phase: project.current_phase,
          roadmap: project.phases,
          updated_at: project.updated_at,
        })
        .eq("id", request.project_id);
    } catch (err) {
      console.error(
        "[ORCHESTRATOR] Error persisting phase expansion to Supabase:",
        err,
      );
      // Don't fail the operation if Supabase write fails
    }

    return {
      project,
      phase: project.phases[phaseIndex],
      message: `Phase ${phase.phase_number} expanded successfully`,
    };
  }
}
