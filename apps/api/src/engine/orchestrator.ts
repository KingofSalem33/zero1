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
    console.log("🎯 [PHASES] Generating phases for project:", request.goal);
    console.log(
      "📋 [PHASES] Using clarification context:",
      request.clarification_context?.substring(0, 100) + "...",
    );

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    const systemPrompt = `You are an expert Zero-to-One Project Builder specializing in phase-based project scaffolding.

Your job is to break down any project into 5-8 high-level phases that represent the major milestones from conception to completion.

RULES:
1. Generate exactly 5-8 phases
2. Each phase should be a major milestone (not tiny tasks)
3. Phases should be sequential and build upon each other
4. Include goal, why_it_matters, acceptance_criteria, and rollback_plan for each
5. Make phases domain-appropriate (business vs technical vs creative projects)

RESPONSE FORMAT:
{
  "phases": [
    {
      "phase_id": "P1",
      "goal": "Clear, actionable phase goal",
      "why_it_matters": "Why this phase is critical for project success",
      "acceptance_criteria": ["Criteria 1", "Criteria 2", "Criteria 3"],
      "rollback_plan": ["Rollback step 1", "Rollback step 2"],
      "substeps": []
    }
  ]
}

PROJECT: ${request.goal}
CONTEXT: ${request.clarification_context}

Generate the high-level phase roadmap now.`;

    try {
      const result = await client.chat.completions.create({
        model: ENV.OPENAI_MODEL_NAME,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: "Generate the phase roadmap for this project.",
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      });

      const responseText = result.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(responseText);

      console.log(
        "✅ [PHASES] Generated",
        parsed.phases?.length || 0,
        "phases",
      );
      return parsed;
    } catch (error) {
      console.error("❌ [PHASES] Generation failed:", error);
      // Fallback with basic phases
      return {
        phases: [
          {
            phase_id: "P1",
            phase_number: 1,
            goal: "Project Foundation & Planning",
            why_it_matters:
              "Establish solid foundation for successful project execution",
            acceptance_criteria: [
              "Clear project scope defined",
              "Initial research completed",
            ],
            rollback_plan: ["Reset to initial state"],
            substeps: [],
            locked: false,
          },
          {
            phase_id: "P2",
            phase_number: 2,
            goal: "Core Development & Implementation",
            why_it_matters: "Build the essential components of the project",
            acceptance_criteria: [
              "Core functionality working",
              "Basic structure in place",
            ],
            rollback_plan: ["Return to planning phase"],
            substeps: [],
            locked: true,
          },
        ],
      };
    }
  }

  // Expand a single phase with substeps and master prompts
  async expandPhaseWithSubsteps(phase: any, goal: string): Promise<any> {
    console.log("🔍 [EXPAND] Expanding phase with substeps:", phase.goal);

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    const systemPrompt = `You are an expert Zero-to-One Project Builder. Your job is to break down a single phase into detailed substeps with master prompts.

PHASE TO EXPAND: ${phase.goal}
PROJECT CONTEXT: ${goal}

RULES:
1. Generate 3-5 substeps for this specific phase
2. Each substep should be a concrete, actionable micro-task
3. Each substep needs a "master prompt" for ChatGPT-style workspace
4. Substeps should be sequential and build on each other
5. Each substep = 15-30 minutes of focused work

RESPONSE FORMAT:
{
  "substeps": [
    {
      "substep_id": "1A",
      "step_number": 1,
      "label": "Clear action-oriented title",
      "prompt_to_send": "Detailed master prompt for ChatGPT workspace",
      "commands": "Any specific tools/resources needed",
      "completed": false
    }
  ]
}

Focus on practical, hands-on tasks that move the project forward.`;

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
        substeps: parsed.substeps.map((substep: any, index: number) => ({
          ...substep,
          step_number: index + 1,
          completed: false,
          created_at: new Date().toISOString(),
        })),
      };
    } catch (error) {
      console.error("❌ [EXPAND] Failed to expand phase:", error);
      // Fallback with basic substeps
      return {
        ...phase,
        substeps: [
          {
            substep_id: "1A",
            step_number: 1,
            label: `Start ${phase.goal}`,
            prompt_to_send: `Help me begin working on: ${phase.goal}. For the project: ${goal}. Provide step-by-step guidance for getting started.`,
            commands: "Basic setup and planning",
            completed: false,
            created_at: new Date().toISOString(),
          },
        ],
      };
    }
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

When you use web tools, include 2-5 source links at the end. Always include source URLs in your final answer.

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
