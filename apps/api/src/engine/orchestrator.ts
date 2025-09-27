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

    const systemPrompt = `You are an expert Zero-to-One Project Builder. Break down this phase into 3-5 actionable substeps, each with its own senior-level master prompt.

PHASE: ${phase.goal}
PROJECT VISION: ${goal}
PHASE PURPOSE: ${phase.why_it_matters}

RULES:
1. Generate 3-5 substeps that build toward the phase goal
2. Each substep should be a concrete, actionable micro-task (15-30 minutes)
3. Substeps should be sequential and build on each other
4. Focus on practical, hands-on tasks that move the project forward
5. CRITICAL: Each substep must have its own unique senior-level master prompt that provides expert guidance for that specific substep

RESPONSE FORMAT:
{
  "substeps": [
    {
      "substep_id": "1A",
      "step_number": 1,
      "label": "Clear action-oriented title",
      "prompt_to_send": "You are a senior [domain expert]. [Detailed expert-level guidance specific to this substep that provides 20+ years of domain knowledge]",
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
      P1: `You are a senior architect guiding a complete beginner.

Design a step-by-step plan to set up a professional environment for my project. Analyze the project type and recommend the appropriate setup.

For my project: ${userVision}

Provide:
- Essential tools, resources, or systems needed for this type of project
- Professional workspace setup (physical, digital, or both as appropriate)
- Key accounts, permits, or credentials to establish
- A simple "proof of concept" milestone to confirm everything is ready

Adapt your recommendations to the specific domain (business, tech, creative, etc.) and make me feel professional and prepared from day one.`,

      P2: `You are a senior builder.

Design the simplest possible version of my project that takes input, processes it, and outputs a result.

It must be small enough to complete today and clearly demonstrate the core idea.

Project Vision: ${userVision}

Focus on creating the smallest input → process → output cycle that proves the concept works.`,

      P3: `You are a senior development strategist.

Based on my current prototype, identify the single most valuable new feature to add.

Guide me step-by-step to implement it without breaking what already works.

After completing, suggest the next layer of expansion.

Project Vision: ${userVision}

Prevent overwhelm by limiting changes to one new concept at a time.`,

      P4: `You are a senior product strategist.

Create a lightweight test plan to validate my project with 3-5 real people.

Include:
- What to show them
- Questions to ask
- Metrics to measure
- How to decide whether to pivot or proceed

Project Vision: ${userVision}

Help me gather authentic feedback before final polish.`,

      P5: `You are a senior quality assurance lead.

Identify the minimum essential fixes and improvements required for my project to be launch-ready.

List them in priority order and guide me to complete them step-by-step.

Project Vision: ${userVision}

Focus on reaching launch quality while preventing endless iteration and feature creep.`,

      P6: `You are a senior launch manager.

Create a simple, focused launch plan for my project that includes:
- A single clear call-to-action
- Where and how to announce it
- The first 3 metrics to track post-launch

Project Vision: ${userVision}

Help me release the project publicly with maximum impact.`,

      P7: `You are a senior project retrospective facilitator.

Help me analyze what worked, what didn't, and why.

Create a simple reflection document and suggest a roadmap for my next version or next project.

Project Vision: ${userVision}

Focus on capturing lessons learned and building a personal toolkit for future projects.`,
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

    const systemMessage = `You are an expert AI assistant helping with project execution. You have access to these tools:
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
