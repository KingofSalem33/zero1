/**
 * Execution Service (V2 Only)
 *
 * Handles step execution with LLM streaming for V2 dynamic roadmap projects.
 * Simplified to remove all V1 logic.
 */

import type { Response } from "express";
import { runModel } from "../../../ai/runModel";
import { runModelStream } from "../../../ai/runModelStream";
import { selectRelevantTools } from "../../../ai/tools/selectTools";
import { ENV } from "../../../env";
import { threadService } from "../../../services/threadService";

export interface ExecutionRequest {
  project_id: string;
  master_prompt: string;
  user_message?: string;
  thread_id?: string;
  res?: Response; // For streaming
}

export interface ExecutionResult {
  response: string;
  context: {
    step: string;
    project_goal: string;
  };
}

interface V2Project {
  id: string;
  goal: string;
  current_step: number;
  steps: Array<{
    step_number: number;
    title: string;
    description: string;
    status: string;
  }>;
}

/**
 * ExecutionService - Execute V2 roadmap steps with LLM
 */
export class ExecutionService {
  constructor(
    private getProject: (projectId: string) => Promise<V2Project | undefined>,
  ) {}

  /**
   * Execute step with streaming (SSE)
   */
  async executeStepStreaming(request: ExecutionRequest): Promise<void> {
    if (!request.res) {
      throw new Error("Response object required for streaming");
    }

    console.log(
      `🚀 [ExecutionService] Streaming execution for project: ${request.project_id}`,
    );

    const project = await this.getProject(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const res = request.res;

    // Get or create thread
    let thread = null;
    let useThreads = true;
    let accumulatedResponse = "";

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

        // Auto-generate title if first message
        const messages = await threadService.getRecentMessages(thread.id, 1);
        if (messages.length === 1) {
          await threadService.generateTitle(thread.id, request.user_message);
        }
      }
    } catch (error) {
      console.warn("⚠️ [ExecutionService] Thread service unavailable:", error);
      useThreads = false;
    }

    console.log(`🔍 [ExecutionService] Project ID: ${project.id}`);
    console.log(`🔍 [ExecutionService] Project goal: ${project.goal}`);
    console.log(
      `🔍 [ExecutionService] Current step number: ${project.current_step}`,
    );
    console.log(
      `🔍 [ExecutionService] Total steps: ${project.steps?.length || 0}`,
    );

    const currentStep = project.steps?.find(
      (s) => s.step_number === project.current_step,
    );

    console.log(`🔍 [ExecutionService] Current step found: ${!!currentStep}`);
    if (currentStep) {
      console.log(
        `🔍 [ExecutionService] Current step title: ${currentStep.title}`,
      );
      console.log(
        `🔍 [ExecutionService] Current step status: ${currentStep.status}`,
      );
    }

    const completedSteps =
      project.steps
        ?.filter((s) => s.status === "completed")
        .map((s) => `- Step ${s.step_number}: ${s.title}`)
        .join("\n") || "None yet - this is the first step";

    console.log(
      `🔍 [ExecutionService] Completed steps count: ${project.steps?.filter((s) => s.status === "completed").length || 0}`,
    );

    // Build system message with execution rules
    const systemMessage = `${request.master_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**COMPLETED STEPS IN THIS PROJECT:**
${completedSteps}

**CRITICAL EXECUTION RULES:**

🔨 **BUILD, DON'T ADVISE** - You are the expert builder executing FOR them, like a senior architect teaching their apprentice by DOING the work together.

✅ **IMMEDIATE ACTION:**
- Don't explain what to do → DO IT
- Don't say "you should" → JUST BUILD IT
- Don't give tutorials → CREATE ACTUAL CODE/FILES
- Don't ask questions → MAKE DECISIONS AND EXECUTE

📋 **YOUR WORKFLOW:**
1. Break current objective into micro-tasks (be specific!)
2. Execute each micro-task, showing actual work
3. Report: "✅ [what you just built]"
4. Continue until ALL acceptance criteria met
5. Declare: "✅ Step complete - here's what we built..."

💡 **MINDSET:** You're not a consultant giving advice. You're a master craftsman showing your apprentice how to build by building it WITH them. They learn by watching YOU execute their vision.

⚡ **MOMENTUM RULES:**
- After each micro-task: "✅ [done] → Now [next]..." then DO IT
- If user says "ok"/"good"/"continue" → Keep executing
- If user asks question → Answer briefly, THEN continue building
- Never end with "What would you like to do?" → Always end with action
- You see conversation history → Reference what you built before

**Start building immediately. Chain micro-tasks. Keep momentum.**`;

    const userMessage =
      request.user_message ||
      "Please help me with this step. Provide detailed, actionable guidance.";

    console.log(
      `🔍 [ExecutionService] System message length: ${systemMessage.length} chars`,
    );
    console.log(`🔍 [ExecutionService] User message: ${userMessage}`);

    try {
      console.log(`🚀 [ExecutionService] Building context messages...`);
      let contextMessages: any[];

      if (useThreads && thread) {
        const rawMessages = await threadService.buildContextMessages(
          thread.id,
          systemMessage,
          ENV.OPENAI_MODEL_NAME,
        );

        // Filter malformed messages
        contextMessages = rawMessages.filter((msg: any) => {
          if (
            msg.role === "system" ||
            msg.role === "user" ||
            msg.role === "assistant"
          ) {
            return true;
          }
          return false;
        });

        if (request.user_message) {
          contextMessages.push({
            role: "user" as const,
            content: userMessage,
          });
        }
      } else {
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

      // Select relevant tools
      const { toolSpecs: selectedSpecs, toolMap: selectedMap } =
        selectRelevantTools(userMessage);

      console.log(
        `🚀 [ExecutionService] Selected ${Object.keys(selectedMap).length} tools`,
      );
      console.log(
        `🚀 [ExecutionService] Context messages count: ${contextMessages.length}`,
      );
      console.log(
        `🚀 [ExecutionService] Starting LLM streaming with model: ${ENV.OPENAI_MODEL_NAME}`,
      );

      // Stream the LLM response
      accumulatedResponse = await runModelStream(res, contextMessages, {
        toolSpecs: selectedSpecs,
        toolMap: selectedMap,
        model: ENV.OPENAI_MODEL_NAME,
      });

      console.log(
        `✅ [ExecutionService] LLM streaming finished, accumulated ${accumulatedResponse.length} chars`,
      );

      console.log("✅ [ExecutionService] Streaming completed successfully");

      // Save AI response to thread
      if (useThreads && thread) {
        await threadService.saveMessage(
          thread.id,
          "assistant",
          accumulatedResponse,
        );
      }
    } catch (error) {
      console.error("❌ [ExecutionService] Execution failed:", error);
      throw error;
    }
  }

  /**
   * Execute step without streaming (simple JSON response)
   */
  async executeStep(request: ExecutionRequest): Promise<ExecutionResult> {
    console.log(
      `🚀 [ExecutionService] Non-streaming execution for project: ${request.project_id}`,
    );

    const project = await this.getProject(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    const currentStep = project.steps?.find(
      (s) => s.step_number === project.current_step,
    );

    const completedSteps =
      project.steps
        ?.filter((s) => s.status === "completed")
        .map((s) => `- Step ${s.step_number}: ${s.title}`)
        .join("\n") || "None yet - this is the first step";

    const stepLabel = currentStep?.title || "Unknown Step";

    const systemMessage = `${request.master_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**COMPLETED STEPS SO FAR:**
${completedSteps}

**YOUR EXECUTION STYLE:**
- You are an expert builder executing FOR the user (not just advising)
- Create tangible deliverables step-by-step
- Break work into micro-tasks with visible wins
- Execute code, create files, build features
- Report progress: "✅ Created X", "✅ Implemented Y"
- When criteria are met, signal completion readiness`;

    const userMessage =
      request.user_message ||
      "Please help me with this step. Provide detailed, actionable guidance.";

    const contextMessages = [
      {
        role: "system" as const,
        content: systemMessage,
      },
      {
        role: "user" as const,
        content: userMessage,
      },
    ];

    // Select relevant tools
    const { toolSpecs: selectedSpecs, toolMap: selectedMap } =
      selectRelevantTools(userMessage);

    // Run model
    const result = await runModel(contextMessages, {
      toolSpecs: selectedSpecs,
      toolMap: selectedMap,
      model: ENV.OPENAI_MODEL_NAME,
    });

    console.log("✅ [ExecutionService] Non-streaming execution completed");

    return {
      response: result.text,
      context: {
        step: stepLabel,
        project_goal: project.goal,
      },
    };
  }
}
