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

    const systemPrompt = `Break down this phase into 3-5 actionable substeps, each with expert-written guidance.

PHASE: ${phase.goal}
PROJECT VISION: ${goal}
PHASE PURPOSE: ${phase.why_it_matters}

RULES:
1. Generate 3-5 substeps that build toward the phase goal
2. Each substep should be a concrete, actionable micro-task (15-30 minutes)
3. Substeps should be sequential and build on each other
4. Focus on practical, hands-on tasks that move the project forward
5. CRITICAL: Each substep must have its own expert-written guidance (NOT "You are a..." prompts)

RESPONSE FORMAT:
{
  "substeps": [
    {
      "substep_id": "1A",
      "step_number": 1,
      "label": "Clear action-oriented title",
      "prompt_to_send": "[Expert-written guidance that sounds like it came from someone with 20+ years experience. Direct, actionable advice without role-playing.]",
      "commands": "Any specific tools/resources needed",
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
      // Fallback with basic substeps
      return {
        ...phase,
        master_prompt: masterPrompt,
        substeps: [
          {
            substep_id: "1A",
            step_number: 1,
            label: `Start ${phase.goal}`,
            prompt_to_send: masterPrompt,
            commands: "Basic setup and planning",
            completed: false,
            created_at: new Date().toISOString(),
          },
        ],
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
