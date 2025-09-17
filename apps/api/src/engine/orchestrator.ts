import { makeOpenAI } from "../ai";
import { ENV } from "../env";
import {
  Project,
  ProjectHistory,
  StepGenerationRequest,
  StepGenerationResponse,
  AdvanceProjectRequest,
  AdvanceProjectResponse,
} from "./types";

// In-memory storage for demo purposes
// In production, this would be replaced with database operations
const projects: Map<string, Project> = new Map();

export class StepOrchestrator {
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async generateSteps(
    request: StepGenerationRequest,
  ): Promise<StepGenerationResponse> {
    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    const systemPrompt = `You are a project planning expert. Given a user's goal, generate 3-5 actionable steps to help them achieve it.

For each step, provide:
1. step_number (starting from 1)
2. prompt_text: A specific, actionable prompt they can use with AI tools
3. why_text: A brief explanation of why this step matters

Respond with JSON in this exact format:
{
  "steps": [
    {
      "step_number": 1,
      "prompt_text": "...",
      "why_text": "..."
    }
  ],
  "reasoning": "Brief explanation of the overall approach"
}`;

    // Get recent clarifications if we have a project context
    let recentClarifications = "";
    if (
      request.current_context &&
      request.current_context.includes("projectId:")
    ) {
      const projectId = request.current_context
        .split("projectId:")[1]
        .split(",")[0]
        .trim();
      const history = this.getRecentHistory(projectId, 3);
      if (history.length > 0) {
        recentClarifications = `\n\nRecent clarifications:\n${history.map((h) => `Q: ${h.input_text}\nA: ${h.output_text}`).join("\n\n")}`;
      }
    }

    const userPrompt = `Goal: ${request.goal}

${request.current_context ? `Current context: ${request.current_context}` : ""}

${request.previous_steps?.length ? `Previous steps completed: ${request.previous_steps.map((s) => `${s.step_number}. ${s.prompt_text}`).join(", ")}` : ""}${recentClarifications}`;

    const result = await client.chat.completions.create({
      model: ENV.OPENAI_MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const responseText = result.choices?.[0]?.message?.content ?? "";

    try {
      return JSON.parse(responseText);
    } catch {
      // Fallback if JSON parsing fails
      return {
        steps: [
          {
            step_number: 1,
            prompt_text: `Help me create a plan to achieve: ${request.goal}`,
            why_text: "Starting with a clear plan helps ensure success",
          },
        ],
        reasoning: "Generated fallback step due to parsing error",
      };
    }
  }

  async createProject(goal: string): Promise<Project> {
    const stepResponse = await this.generateSteps({ goal });

    const now = new Date().toISOString();
    const project: Project = {
      id: this.generateId(),
      goal,
      status: "active",
      current_step: 1,
      steps: stepResponse.steps.map((step) => ({
        ...step,
        completed: false,
        created_at: now,
      })),
      history: [],
      created_at: now,
      updated_at: now,
    };

    projects.set(project.id, project);
    return project;
  }

  async advanceProject(
    projectId: string,
    request: AdvanceProjectRequest,
  ): Promise<AdvanceProjectResponse> {
    const project = projects.get(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Mark the completed step
    const stepToComplete = project.steps.find(
      (s) => s.step_number === request.completed_step_number,
    );
    if (stepToComplete) {
      stepToComplete.completed = true;
    }

    // Update current step
    project.current_step = Math.max(
      project.current_step,
      request.completed_step_number + 1,
    );
    project.updated_at = new Date().toISOString();

    // Check if project is complete
    const allStepsCompleted = project.steps.every((s) => s.completed);
    if (allStepsCompleted) {
      project.status = "completed";
    }

    // Generate next steps if needed and user provided context
    let nextSteps = undefined;
    if (request.context_update && !allStepsCompleted) {
      try {
        const stepResponse = await this.generateSteps({
          goal: project.goal,
          current_context: request.context_update,
          previous_steps: project.steps.filter((s) => s.completed),
        });
        nextSteps = stepResponse.steps;

        // Add new steps to project
        const maxStepNumber = Math.max(
          ...project.steps.map((s) => s.step_number),
        );
        const newSteps = stepResponse.steps.map((step, index) => ({
          ...step,
          step_number: maxStepNumber + index + 1,
          completed: false,
          created_at: new Date().toISOString(),
        }));
        project.steps.push(...newSteps);
      } catch (error) {
        console.error("Failed to generate next steps:", error);
      }
    }

    projects.set(projectId, project);

    return {
      project,
      next_steps: nextSteps,
      message: allStepsCompleted
        ? "Congratulations! You have completed all steps for this project."
        : `Step ${request.completed_step_number} marked as complete. ${nextSteps ? "New steps have been generated based on your progress." : "Continue with the next step."}`,
    };
  }

  getProject(projectId: string): Project | undefined {
    return projects.get(projectId);
  }

  getAllProjects(): Project[] {
    return Array.from(projects.values());
  }

  addHistoryEntry(
    projectId: string,
    inputText: string,
    outputText: string,
  ): ProjectHistory | null {
    const project = projects.get(projectId);
    if (!project) return null;

    const historyEntry: ProjectHistory = {
      id: this.generateId(),
      project_id: projectId,
      input_text: inputText,
      output_text: outputText,
      created_at: new Date().toISOString(),
    };

    project.history.push(historyEntry);
    project.updated_at = new Date().toISOString();
    projects.set(projectId, project);

    return historyEntry;
  }

  getRecentHistory(projectId: string, limit: number = 3): ProjectHistory[] {
    const project = projects.get(projectId);
    if (!project) return [];

    return project.history.slice(-limit).reverse(); // Most recent first
  }
}
