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
import { supabase } from "../../../db";
import { dynamicPromptBuilder } from "./DynamicPromptBuilder";
import { conversationAnalyzer } from "./ConversationAnalyzer";

export interface ExecutionRequest {
  project_id: string;
  master_prompt: string;
  user_message?: string;
  thread_id?: string;
  res?: Response; // For streaming
  current_step_context?: {
    step_number: number;
    title: string;
    description: string;
    acceptance_criteria: string[];
  };
}

export interface ExecutionResult {
  response: string;
  context: {
    step: string;
    project_goal: string;
  };
}

export interface MicroStepExecutionRequest {
  project_id: string;
  step_id: string;
  res: Response; // For streaming
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

    // Build dynamic system message with real-time progress tracking
    let systemMessage: string;

    if (request.current_step_context && useThreads && thread) {
      // NEW: Use dynamic prompt builder for roadmap-aware context
      console.log(
        `🧠 [ExecutionService] Building dynamic system message for Step ${request.current_step_context.step_number}`,
      );

      // Fetch recent conversation messages for progress analysis
      const conversationMessages = await threadService.getRecentMessages(
        thread.id,
        20, // Last 20 messages for context
      );

      // Check if this is a step transition (first execution after advancing)
      const isStepTransition =
        conversationMessages.length === 0 ||
        (completedSteps.length > 0 &&
          request.current_step_context &&
          !conversationMessages.some((msg) =>
            msg.content
              .toLowerCase()
              .includes(request.current_step_context!.title.toLowerCase()),
          ));

      console.log(
        `🔄 [ExecutionService] Step transition detected: ${isStepTransition}`,
      );

      // Determine current criterion based on conversation analysis
      const criteriaProgress = conversationAnalyzer.analyzeProgress(
        conversationMessages,
        request.current_step_context.acceptance_criteria,
      );

      // Find first unsatisfied criterion (this is what we're working on)
      const currentCriterionIndex =
        criteriaProgress.acceptance_criteria_progress.findIndex(
          (c: any) => !c.satisfied,
        );

      let currentCriterion = undefined;
      if (currentCriterionIndex !== -1) {
        const criteria = request.current_step_context.acceptance_criteria;
        currentCriterion = {
          criterion_index: currentCriterionIndex,
          criterion_text: criteria[currentCriterionIndex],
          previous_criterion:
            currentCriterionIndex > 0
              ? criteria[currentCriterionIndex - 1]
              : undefined,
          next_criterion:
            currentCriterionIndex < criteria.length - 1
              ? criteria[currentCriterionIndex + 1]
              : undefined,
          substep_title: request.current_step_context.title,
          substep_number: request.current_step_context.step_number,
        };

        console.log(
          `🎯 [ExecutionService] Current criterion: ${currentCriterionIndex + 1}/${criteria.length} - "${currentCriterion.criterion_text}"`,
        );
      }

      systemMessage = dynamicPromptBuilder.buildSystemMessage({
        project_goal: project.goal,
        current_substep: request.current_step_context,
        current_criterion: currentCriterion, // NEW: Pass criterion-level focus
        master_prompt: request.master_prompt,
        conversation_messages: conversationMessages,
        completed_steps_summary: completedSteps,
        all_steps: project.steps, // NEW: Full roadmap visibility
        is_step_transition: isStepTransition, // NEW: Step transition flag
      });

      console.log(
        `✅ [ExecutionService] Dynamic system message built with ${conversationMessages.length} messages analyzed`,
      );
    } else {
      // Fallback: Static system message (for backward compatibility)
      console.log(
        `⚠️ [ExecutionService] Using static system message (no substep context or threads)`,
      );

      let substepContext = "";
      if (request.current_step_context) {
        const ctx = request.current_step_context;
        substepContext = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🎯 CURRENT SUBSTEP (${ctx.step_number}): ${ctx.title}**

${ctx.description}

**ACCEPTANCE CRITERIA FOR THIS SUBSTEP:**
${ctx.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

**IMPORTANT:** Focus ONLY on this substep. The overall phase context is provided above, but your immediate goal is to help the user complete THIS specific substep.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
      }

      systemMessage = `${request.master_prompt}
${substepContext}

**COMPLETED STEPS IN THIS PROJECT:**
${completedSteps}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**EXECUTION CONTEXT:**
You have access to development tools. Use them to build and execute the work FOR the user.
Execute step-by-step, showing your work as you go. Start with immediate action.`;
    }

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

    // Build dynamic system message if possible
    let systemMessage: string;

    if (request.current_step_context && request.thread_id) {
      // Try to use dynamic prompt builder
      try {
        const thread = await threadService.getThread(request.thread_id);
        const conversationMessages = await threadService.getRecentMessages(
          thread.id,
          20,
        );

        systemMessage = dynamicPromptBuilder.buildSystemMessage({
          project_goal: project.goal,
          current_substep: request.current_step_context,
          master_prompt: request.master_prompt,
          conversation_messages: conversationMessages,
          completed_steps_summary: completedSteps,
        });

        console.log(
          `✅ [ExecutionService] Dynamic system message built for non-streaming`,
        );
      } catch {
        console.warn(
          `⚠️ [ExecutionService] Failed to build dynamic message, using static fallback`,
        );
        systemMessage = this.buildStaticSystemMessage(request, completedSteps);
      }
    } else {
      systemMessage = this.buildStaticSystemMessage(request, completedSteps);
    }

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

  /**
   * Execute a single micro-step with streaming
   * This replaces the "do everything at once" approach with focused, bite-sized execution
   */
  async executeMicroStepStreaming(
    request: MicroStepExecutionRequest,
  ): Promise<void> {
    console.log(
      `🚀 [ExecutionService] Executing micro-step for step: ${request.step_id}`,
    );

    const res = request.res;

    // Fetch the roadmap step to get current_micro_step and plan status
    const { data: roadmapStep, error: stepError } = await supabase
      .from("roadmap_steps")
      .select("*, project:projects(*)")
      .eq("id", request.step_id)
      .single();

    if (stepError || !roadmapStep) {
      throw new Error(`Roadmap step not found: ${stepError?.message}`);
    }

    const currentMicroStepNumber = roadmapStep.current_micro_step;

    if (!currentMicroStepNumber || currentMicroStepNumber === 0) {
      throw new Error(
        "No active micro-step. Plan must be approved first (current_micro_step = 0)",
      );
    }

    // Fetch the current micro-step
    const { data: microStep, error: microStepError } = await supabase
      .from("micro_steps")
      .select("*")
      .eq("step_id", request.step_id)
      .eq("micro_step_number", currentMicroStepNumber)
      .single();

    if (microStepError || !microStep) {
      throw new Error(
        `Micro-step ${currentMicroStepNumber} not found: ${microStepError?.message}`,
      );
    }

    console.log(
      `📋 [ExecutionService] Executing micro-step: ${microStep.title}`,
    );
    console.log(
      `📋 [ExecutionService] Estimated duration: ${microStep.estimated_duration}`,
    );

    // Get project context
    const project = roadmapStep.project;
    if (!project) {
      throw new Error("Project not found");
    }

    // Get or create thread
    let thread = null;
    let useThreads = true;
    let accumulatedResponse = "";

    try {
      thread = await threadService.getOrCreateThread(request.project_id);
    } catch (error) {
      console.warn("⚠️ [ExecutionService] Thread service unavailable:", error);
      useThreads = false;
    }

    // Fetch all micro-steps to show context
    const { data: allMicroSteps } = await supabase
      .from("micro_steps")
      .select("micro_step_number, title, status")
      .eq("step_id", request.step_id)
      .order("micro_step_number", { ascending: true });

    const microStepsContext =
      allMicroSteps
        ?.map(
          (ms) =>
            `${ms.status === "completed" ? "✅" : ms.status === "in_progress" ? "🔄" : "⏳"} Micro-step ${ms.micro_step_number}: ${ms.title}`,
        )
        .join("\n") || "";

    // Build focused system message for THIS micro-step only
    const systemMessage = `You are helping a user build: "${project.goal}"

**CURRENT ROADMAP STEP:** ${roadmapStep.title}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🎯 YOUR CURRENT MICRO-TASK (${currentMicroStepNumber} of ${allMicroSteps?.length || 0}):**

**Title:** ${microStep.title}

**Description:** ${microStep.description}

**Estimated Duration:** ${microStep.estimated_duration}

**ACCEPTANCE CRITERIA (What "done" looks like):**
${microStep.acceptance_criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**PROGRESS SO FAR:**
${microStepsContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**YOUR JOB:**
✅ Complete THIS micro-task only (not the whole step, just this 2-3 minute chunk)
✅ Execute the work directly (use tools: Write, Edit, Bash, WebSearch, etc.)
✅ Verify all acceptance criteria are satisfied
✅ Report what you built with a brief summary

**EXECUTION STYLE:**
- Be a DOER, not a guide (create files, write code, run commands)
- Focus ONLY on this micro-task (don't expand scope)
- Use tools immediately (no "you should" or "let's plan")
- Keep it concise - this is a 2-3 minute task
- Report: "✅ [what you did]" when done

**REMEMBER:** You're executing a BITE-SIZED task. Don't overthink it. Just complete the acceptance criteria above.

**START BUILDING NOW.**`;

    const userMessage = `Execute micro-step ${currentMicroStepNumber}: "${microStep.title}". Follow the acceptance criteria and complete this focused task.`;

    try {
      console.log(`🚀 [ExecutionService] Building context messages...`);
      let contextMessages: any[];

      if (useThreads && thread) {
        const rawMessages = await threadService.buildContextMessages(
          thread.id,
          systemMessage,
          ENV.OPENAI_MODEL_NAME,
        );

        contextMessages = rawMessages.filter((msg: any) => {
          return (
            msg.role === "system" ||
            msg.role === "user" ||
            msg.role === "assistant"
          );
        });

        contextMessages.push({
          role: "user" as const,
          content: userMessage,
        });
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
        `🚀 [ExecutionService] Starting micro-step execution with ${Object.keys(selectedMap).length} tools`,
      );

      // Stream the LLM response
      accumulatedResponse = await runModelStream(res, contextMessages, {
        toolSpecs: selectedSpecs,
        toolMap: selectedMap,
        model: ENV.OPENAI_MODEL_NAME,
      });

      console.log(
        `✅ [ExecutionService] Micro-step execution finished, accumulated ${accumulatedResponse.length} chars`,
      );

      // Save AI response to thread
      if (useThreads && thread) {
        await threadService.saveMessage(
          thread.id,
          "assistant",
          accumulatedResponse,
        );
      }

      console.log(
        `✅ [ExecutionService] Micro-step ${currentMicroStepNumber} execution completed`,
      );
    } catch (error) {
      console.error(
        `❌ [ExecutionService] Micro-step execution failed:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Build static system message (fallback when dynamic builder unavailable)
   */
  private buildStaticSystemMessage(
    request: ExecutionRequest,
    completedSteps: string,
  ): string {
    let substepContext = "";
    if (request.current_step_context) {
      const ctx = request.current_step_context;
      substepContext = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🎯 CURRENT SUBSTEP (${ctx.step_number}): ${ctx.title}**

${ctx.description}

**ACCEPTANCE CRITERIA (Execute these NOW):**
${ctx.acceptance_criteria.map((c, i) => `${i + 1}. [⏳ TODO] ${c}`).join("\n")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }

    return `⚠️ **CRITICAL OVERRIDE - READ THIS FIRST** ⚠️

🔨 **YOU ARE AN EXPERT BUILDER WHO EXECUTES, NOT A CONVERSATIONAL GUIDE**

**EXECUTION-ONLY MODE:**
✅ USE TOOLS IMMEDIATELY - Write, Edit, Bash, WebSearch, etc.
✅ CREATE FILES, WRITE CODE, RUN COMMANDS - Do the actual work
✅ REPORT "✅ Created X" after each action, then IMMEDIATELY do the next thing
❌ NO "you should...", NO "let's plan...", NO "here are the steps..."
❌ NO QUESTIONS unless you're completely blocked
❌ NO GUIDANCE - Just BUILD and narrate what you DID

**YOUR ONE JOB:** Execute the acceptance criteria below. Start NOW.
${substepContext}

## 🧠 EXPERT CONTEXT (Background knowledge - use this to make smart decisions):

${request.master_prompt}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**COMPLETED STEPS SO FAR:**
${completedSteps}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⚡ EXECUTE NOW:

**EXECUTION RULES (Override everything above if there's conflict):**
1. Use tools FIRST, talk SECOND
2. Create actual files, code, and configurations
3. After each action, report "✅ [what you did]" then DO the next thing
4. Focus ONLY on completing the acceptance criteria above
5. NO planning, NO asking permission, NO guidance - JUST EXECUTE
6. Stay on this substep - don't jump ahead

**BEGIN EXECUTION NOW - Use your first tool call immediately.**`;
  }
}
