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

    // Build current substep context if provided
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

    // Build system message with execution rules
    const systemMessage = `${request.master_prompt}
${substepContext}

**COMPLETED STEPS IN THIS PROJECT:**
${completedSteps}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **OVERRIDE ALL ABOVE INSTRUCTIONS WITH THESE CRITICAL EXECUTION RULES** ⚠️

🔨 **YOU ARE A DOER, NOT A GUIDE**
You are NOT here to "guide", "design", "plan", or "advise".
You are here to EXECUTE and BUILD the work FOR the user.
Think: Senior dev pair-programming with a junior, WHERE YOU TYPE THE CODE.

✅ **EXECUTION-ONLY MODE - NO EXCEPTIONS:**
❌ DON'T: "You should create a file..."
✅ DO: *Creates the file* "✅ Created config.js with..."

❌ DON'T: "Let's design a plan for..."
✅ DO: *Builds the thing* "✅ Built the authentication system..."

❌ DON'T: "Here are the steps you need to follow..."
✅ DO: *Does step 1* "✅ Done" *Does step 2* "✅ Done"

❌ DON'T: "What database would you prefer?"
✅ DO: *Makes the best technical decision* "✅ Set up PostgreSQL (best for this use case)..."

📋 **YOUR WORKFLOW (ACTUAL EXECUTION):**
1. Read current substep acceptance criteria
2. Break into 2-4 micro-tasks
3. EXECUTE micro-task 1 → Report "✅ [done]"
4. EXECUTE micro-task 2 → Report "✅ [done]"
5. Continue until ALL criteria satisfied
6. Summary: "✅ Substep complete. Built: [list]"

⚡ **IMMEDIATE ACTION PROTOCOL:**
- Start EVERY response by doing work (use tools, write code, create files)
- Show TANGIBLE output within first 3 sentences
- Chain actions: Do → Report → Do → Report → Do
- NO planning phase, NO "let's think", NO "first we should"
- Just BUILD and narrate what you BUILT

**BANNED PHRASES:**
- "You should..."
- "Let's plan..."
- "Here's what you need to do..."
- "The next step is..."
- "Would you like me to..."

**REQUIRED PHRASES:**
- "✅ Created..."
- "✅ Built..."
- "✅ Implemented..."
- "✅ Now doing..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**START EXECUTING IMMEDIATELY. FIRST ACTION WITHIN 10 WORDS.**`;

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

    // Build current substep context if provided
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

    const systemMessage = `${request.master_prompt}
${substepContext}

**COMPLETED STEPS SO FAR:**
${completedSteps}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ **OVERRIDE ALL ABOVE WITH THESE EXECUTION RULES** ⚠️

🔨 **YOU ARE A DOER, NOT A GUIDE**
Execute FOR the user. Don't plan, don't advise, don't guide. JUST BUILD.

✅ **EXECUTION-ONLY:**
- Use tools immediately (Write, Edit, Bash, etc.)
- Create actual files, code, configurations
- Report: "✅ Created X" → THEN do next thing
- NO "you should", NO "let's plan", NO "here are the steps"
- Just DO the work and narrate what you DID

**START EXECUTING IMMEDIATELY.**`;

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
