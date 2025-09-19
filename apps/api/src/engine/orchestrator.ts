import { makeOpenAI } from "../ai";
import { ENV } from "../env";
import {
  Project,
  ProjectHistory,
  StepGenerationRequest,
  StepGenerationResponse,
  AdvanceProjectRequest,
  AdvanceProjectResponse,
  ClarificationRequest,
  ClarificationResponse,
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

    const systemPrompt = `You are an expert Zero-to-One Project Builder. Your job is to create comprehensive action plans with expert prompts that help users build any project from scratch, regardless of their experience level.

CONTEXT: You have rich clarification data about this project. Use it to create domain-specific, expert-level prompts.

RULES:
1. Generate 4-8 main Steps based on project complexity (Planning, Environment, Architecture, Implementation, Testing, Deployment)
2. Each Step contains 2-5 Substeps (1A, 1B, 1C...)
3. Each Substep contains an EXPERT PROMPT that includes full project context
4. Prompts should act as domain experts: "Act as a senior [domain] expert with 10+ years experience..."
5. Include specific project details in every prompt so AI has full context when user pastes it back
6. Make prompts progressive - later steps build on earlier completions
7. Cover the entire project lifecycle from zero to production-ready

EXPERT PROMPT FORMAT:
Each prompt_to_send should follow this pattern:
"Act as a senior [domain expert] with 10+ years experience. For our [specific project description with key details], [specific task]. Consider [relevant constraints/requirements]. Provide [specific deliverables expected]."

RESPONSE FORMAT:
{
  "steps": [
    {
      "step_number": 1,
      "title": "Project Architecture & Planning",
      "why_text": "Create a solid foundation before coding",
      "substeps": [
        {
          "substep_id": "1A",
          "label": "Technical Architecture Design",
          "prompt_to_send": "Act as a senior [domain] architect with 10+ years experience. For our [specific project with context], design the complete technical architecture including [specific components]. Consider [constraints from clarification]. Provide detailed architecture diagrams, tech stack recommendations, and implementation approach.",
          "commands": "No commands - design and planning phase"
        }
      ]
    }
  ],
  "reasoning": "Expert prompts with full project context for zero-to-one building"
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

    const userPrompt = `PROJECT GOAL: ${request.goal}

PROJECT DETAILS FROM CLARIFICATION:
${request.current_context || "No clarification context available"}

${request.previous_steps?.length ? `COMPLETED STEPS: ${request.previous_steps.map((s) => `${s.step_number}. ${s.title}`).join(", ")}` : ""}${recentClarifications}

INSTRUCTIONS: Generate a comprehensive action plan with expert prompts that use all the project details above. Each prompt should include specific project context so when the user copies and pastes it back, the AI has everything needed to provide expert guidance for this exact project.`;

    const result = await client.chat.completions.create({
      model: ENV.OPENAI_MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const responseText = result.choices?.[0]?.message?.content ?? "";

    try {
      const parsed = JSON.parse(responseText);
      console.log(
        "Successfully parsed AI response:",
        JSON.stringify(parsed, null, 2),
      );
      return parsed;
    } catch (error) {
      // Fallback if JSON parsing fails
      console.log("JSON parsing failed:", error);
      console.log("Response text:", responseText);
      return {
        steps: [
          {
            step_number: 1,
            title: "Plan Creation",
            why_text: "Starting with a clear plan helps ensure success",
            substeps: [
              {
                substep_id: "1A",
                label: "Define Your Goal",
                prompt_to_send:
                  "Help me clarify my project goal by asking specific questions about what I want to build, who it's for, and what problems it solves",
                commands: "",
              },
            ],
          },
        ],
        reasoning: "Generated fallback step due to parsing error",
      };
    }
  }

  async createProject(goal: string): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      id: this.generateId(),
      goal,
      status: "clarifying", // Start in clarifying status
      current_step: 0, // No steps yet
      steps: [], // Empty steps until clarification is complete
      history: [],
      clarification_context: "", // Will accumulate clarification Q&A
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

    let message = "";

    // Handle substep completion (new format or backward compatibility)
    const substepId = request.substep_id || request.completed_substep_id;
    if (substepId) {
      const [stepNum] = substepId.split(/(?=[A-Z])/);
      const stepNumber = parseInt(stepNum);

      const step = project.steps.find((s) => s.step_number === stepNumber);
      if (step) {
        const substep = step.substeps.find(
          (sub) => sub.substep_id === substepId,
        );
        if (substep) {
          substep.completed = true;

          // Check if all substeps in this step are complete
          step.all_substeps_complete = step.substeps.every(
            (sub) => sub.completed,
          );
          step.completed = step.all_substeps_complete;

          // Update current step if this step is complete
          if (step.completed && project.current_step === stepNumber) {
            project.current_step = stepNumber + 1;
          }

          message = `Substep ${substepId} completed!${step.completed ? ` Step ${stepNumber} is now complete!` : ""}`;
        }
      }
    }
    // Handle step completion (new format or backward compatibility)
    else if (request.step_number || request.completed_step_number) {
      const stepNumber = request.step_number || request.completed_step_number;
      const stepToComplete = project.steps.find(
        (s) => s.step_number === stepNumber,
      );
      if (stepToComplete) {
        // Mark all substeps as complete
        stepToComplete.substeps.forEach((substep) => {
          substep.completed = true;
        });
        stepToComplete.all_substeps_complete = true;
        stepToComplete.completed = true;

        // Update current step
        project.current_step = Math.max(project.current_step, stepNumber + 1);

        message = `Step ${stepNumber} marked as complete.`;
      }
    }

    project.updated_at = new Date().toISOString();

    // Check if project is complete
    const allStepsCompleted = project.steps.every((s) => s.completed);
    if (allStepsCompleted) {
      project.status = "completed";
      message =
        "Congratulations! You have completed all steps for this project.";
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
          all_substeps_complete: false,
          completed: false,
          substeps: step.substeps.map((substep) => ({
            ...substep,
            completed: false,
            created_at: new Date().toISOString(),
          })),
          created_at: new Date().toISOString(),
        }));
        project.steps.push(...newSteps);

        if (message) {
          message += " New steps have been generated based on your progress.";
        }
      } catch (error) {
        console.error("Failed to generate next steps:", error);
      }
    }

    projects.set(projectId, project);

    return {
      project,
      next_steps: nextSteps,
      message: message || "Continue with the next step.",
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

  async handleClarification(
    request: ClarificationRequest,
  ): Promise<ClarificationResponse> {
    const project = projects.get(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI not configured");
    }

    // Update clarification context with user response
    if (request.user_response) {
      project.clarification_context += `User: ${request.user_response}\n`;
    }

    // Count how many questions have been asked
    const questionCount = (project.clarification_context?.match(/AI:/g) || [])
      .length;

    // System prompt for clarification
    const systemPrompt = `You are an expert project clarification assistant. Your job is to ask exactly 3 high-quality clarifying questions to deeply understand a project so you can later generate expert prompts for building it.

RULES:
1. Ask ONE specific, insightful question at a time
2. Focus on the 3 most essential aspects: target users/problem, technical scope, and constraints/success criteria
3. After exactly 3 questions, respond with "CLARIFICATION_COMPLETE"
4. Questions should be domain-specific and get maximum context quickly

QUESTION PROGRESSION:
Question 1: Target users and core problem being solved
Question 2: Technical scope and requirements
Question 3: Constraints, timeline, and success criteria

CURRENT PROJECT: ${project.goal}

PREVIOUS CLARIFICATION:
${project.clarification_context || "No previous clarification"}

QUESTION COUNT: ${questionCount}/3

${questionCount >= 3 ? 'You have asked 3 questions. Respond with exactly "CLARIFICATION_COMPLETE".' : `Ask question ${questionCount + 1} of 3. Focus on getting essential context for generating expert prompts.`}`;

    const result = await client.chat.completions.create({
      model: ENV.OPENAI_MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Please provide the next clarifying question or indicate if clarification is complete.",
        },
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    const responseText = result.choices?.[0]?.message?.content ?? "";

    if (responseText.includes("CLARIFICATION_COMPLETE")) {
      // Clarification is complete, transition to active status and generate steps
      project.status = "active";
      project.current_step = 1;

      // Generate action plan with expert prompts using clarification context
      const stepResponse = await this.generateSteps({
        goal: project.goal,
        current_context: project.clarification_context,
      });

      const now = new Date().toISOString();
      project.steps = stepResponse.steps.map((step) => ({
        ...step,
        all_substeps_complete: false,
        completed: false,
        substeps: step.substeps.map((substep) => ({
          ...substep,
          completed: false,
          created_at: now,
        })),
        created_at: now,
      }));

      project.updated_at = now;
      projects.set(request.project_id, project);

      return {
        project,
        is_complete: true,
        message:
          "Great! I have enough context to create your action plan. Your expert prompts are ready!",
      };
    } else {
      // Continue clarification
      project.clarification_context += `AI: ${responseText}\n`;
      project.updated_at = new Date().toISOString();
      projects.set(request.project_id, project);

      return {
        project,
        question: responseText,
        is_complete: false,
        message:
          "Let me ask a clarifying question to better understand your project.",
      };
    }
  }
}
