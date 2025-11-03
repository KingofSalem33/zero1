/**
 * Execution Service
 *
 * Handles step execution with LLM (streaming and non-streaming).
 *
 * THIS IS WHERE WE FIX THE COMPLETION SYNC GAP!
 *
 * After the LLM responds, we:
 * 1. Detect if substep is complete (explicit request or high confidence)
 * 2. Auto-complete if appropriate
 * 3. Send real-time events to frontend via SSE
 */

import type { Response } from "express";
import { runModel } from "../../../ai/runModel";
import { runModelStream } from "../../../ai/runModelStream";
import { selectRelevantTools } from "../../../ai/tools/selectTools";
import { ENV } from "../../../env";
import { threadService } from "../../../services/threadService";
import { PromptTemplates } from "../../../infrastructure/ai/PromptTemplates";
import { streamingService } from "../../../infrastructure/ai/StreamingService";
import type { CompletionService } from "./CompletionService";
import type { Project } from "../../../engine/types";

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
    phase: string;
    step: string;
    project_goal: string;
  };
}

/**
 * ExecutionService - Execute steps with LLM and handle completion detection
 */
export class ExecutionService {
  constructor(
    private completionService: CompletionService,
    private getProject: (projectId: string) => Promise<Project | undefined>,
  ) {}

  /**
   * ✅ Gap #4 Fix: Build cumulative context from ALL completed phases
   *
   * This gives the LLM full visibility into the journey so far, preventing
   * it from asking users to repeat information.
   */
  private buildCumulativeContext(project: Project): string {
    const completedPhases =
      project.phases?.filter((p: any) => p.completed) || [];

    if (completedPhases.length === 0) {
      return ""; // No completed phases yet
    }

    const context = completedPhases
      .map((phase: any, index: number) => {
        const completedSubsteps =
          phase.substeps?.filter((s: any) => s.completed) || [];
        const substepLabels = completedSubsteps
          .map((s: any) => `  - ${s.label}`)
          .join("\n");

        const accomplishments = this.extractPhaseAccomplishments(phase);

        return `### Phase ${index + 1}: ${phase.goal} ✅ COMPLETED

**Why it mattered**: ${phase.why_it_matters}

**What was accomplished**:
${substepLabels || "  - (No substeps tracked)"}

**Key deliverables**:
${accomplishments}`;
      })
      .join("\n\n---\n\n");

    return `You have already completed ${completedPhases.length} phase(s). Here's what was built:

${context}

**BUILD ON THIS FOUNDATION.** Reference these deliverables. Don't ask the user to repeat information they already provided in earlier phases.`;
  }

  /**
   * Extract key accomplishments from a phase
   */
  private extractPhaseAccomplishments(phase: any): string {
    const accomplishments: string[] = [];

    // P1-specific accomplishments
    if (phase.phase_id === "P1") {
      accomplishments.push("  - Development environment configured");
      accomplishments.push("  - Version control initialized");
      accomplishments.push("  - Deployment pipeline set up");
    }

    // P2-specific accomplishments
    if (phase.phase_id === "P2") {
      accomplishments.push("  - Core input/output flow defined");
      accomplishments.push("  - Minimal working implementation built");
      accomplishments.push("  - Core loop tested with real data");
    }

    // P3-specific accomplishments
    if (phase.phase_id === "P3") {
      accomplishments.push("  - First high-value feature added");
      accomplishments.push("  - Feature integrated with core loop");
    }

    // Add acceptance criteria as accomplishments
    if (phase.acceptance_criteria && phase.acceptance_criteria.length > 0) {
      phase.acceptance_criteria.forEach((criterion: string) => {
        accomplishments.push(`  - ${criterion}`);
      });
    }

    return accomplishments.length > 0
      ? accomplishments.join("\n")
      : "  - Phase completed successfully";
  }

  /**
   * Execute step with streaming (SSE)
   *
   * THIS IS WHERE THE MAGIC HAPPENS - automatic completion detection!
   *
   * ✅ Gap #4 Fix: Now includes cumulative context
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

    // ✅ V2 Project Detection: Check if this is a V2 project (has steps array)
    const isV2Project = !!(project as any).steps;

    console.log(
      `🔍 [ExecutionService] Project type: ${isV2Project ? "V2 (steps)" : "V1 (phases)"}`,
    );
    console.log(`🔍 [ExecutionService] Project ID: ${project.id}`);
    console.log(`🔍 [ExecutionService] Project goal: ${project.goal}`);

    let systemMessage: string;

    if (isV2Project) {
      console.log(`✅ [ExecutionService] V2 Project detected - using V2 logic`);
      // V2 Project: Use master_prompt directly with minimal wrapper
      const v2Project = project as any;
      console.log(
        `🔍 [ExecutionService] Current step number: ${v2Project.current_step}`,
      );
      console.log(
        `🔍 [ExecutionService] Total steps: ${v2Project.steps?.length || 0}`,
      );

      const currentStep = v2Project.steps?.find(
        (s: any) => s.step_number === v2Project.current_step,
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
        v2Project.steps
          ?.filter((s: any) => s.status === "completed")
          .map((s: any) => `- Step ${s.step_number}: ${s.title}`)
          .join("\n") || "None yet - this is the first step";

      console.log(
        `🔍 [ExecutionService] Completed steps count: ${v2Project.steps?.filter((s: any) => s.status === "completed").length || 0}`,
      );

      // For V2, the master_prompt already contains all needed context
      // We reinforce the execution-focused behavior
      systemMessage = `${request.master_prompt}

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
    } else {
      // V1 Project: Use original phase/substep logic
      const currentPhase = project.phases?.find(
        (p: any) => p.phase_number === project.current_phase,
      );
      const currentSubstep = currentPhase?.substeps?.find(
        (s: any) => s.step_number === project.current_substep,
      );

      const completedSubsteps =
        currentPhase?.substeps
          ?.filter(
            (s: any) =>
              s.completed && s.step_number < (currentSubstep?.step_number || 0),
          )
          .map((s: any) => `- ${s.label} (Substep ${s.step_number})`)
          .join("\n") || "None yet - this is the first substep";

      const cumulativeContext = this.buildCumulativeContext(project);

      systemMessage = PromptTemplates.executionSystem(
        project.goal,
        currentPhase?.goal || "Unknown",
        currentSubstep?.label || "Unknown",
        completedSubsteps,
        request.master_prompt,
        cumulativeContext,
      );
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

      // ========================================
      // 🔥 THIS IS THE KEY FIX FOR THE SYNC GAP! 🔥
      // ========================================

      // ✅ V2 Projects: Skip V1 completion detection logic
      // V2 uses manual step completion via UI
      if (!isV2Project) {
        // Detect completion AFTER the LLM response (V1 only)
        const recentMessages =
          useThreads && thread
            ? await threadService.getRecentMessages(thread.id, 10)
            : ([
                {
                  role: "user",
                  content: userMessage,
                  created_at: new Date().toISOString(),
                  id: "",
                  thread_id: "",
                  metadata: {},
                },
                {
                  role: "assistant",
                  content: accumulatedResponse,
                  created_at: new Date().toISOString(),
                  id: "",
                  thread_id: "",
                  metadata: {},
                },
              ] as any);

        const completionResult = await this.completionService.detectCompletion(
          project,
          recentMessages,
          accumulatedResponse,
        );

        if (completionResult.action === "completed") {
          // User explicitly requested completion - auto-complete!
          console.log(
            "🎉 [ExecutionService] Auto-completing substep based on explicit request",
          );

          streamingService.sendSubstepCompleted(res, {
            phase_id: completionResult.result!.phase_id,
            substep_number: completionResult.result!.substep_number,
            next_phase_id: completionResult.result!.next_phase_id,
            next_substep_number: completionResult.result!.next_substep_number,
            briefing: completionResult.result!.briefing,
          });

          // ✅ NEW: Gap #2 Fix - Tell frontend to refresh project state
          streamingService.sendProjectRefreshRequest(res, {
            project_id: request.project_id,
            trigger: "substep_completed",
            new_phase: completionResult.result!.next_phase_id,
            new_substep: completionResult.result!.next_substep_number,
          });

          // Check if phase was unlocked
          if (completionResult.result!.phase_completed) {
            const nextPhase = project.phases?.find(
              (p: any) => p.phase_id === completionResult.result!.next_phase_id,
            );
            if (nextPhase) {
              streamingService.sendPhaseUnlocked(res, {
                phase_id: nextPhase.phase_id,
                phase_number: nextPhase.phase_number,
                phase_goal: nextPhase.goal,
                unlocked_by: "completion",
              });
            }
          }

          // Save briefing to thread if available
          if (completionResult.result!.briefing && useThreads && thread) {
            await threadService.saveMessage(
              thread.id,
              "system",
              completionResult.result!.briefing,
            );
          }
        } else if (completionResult.action === "nudge") {
          // High confidence - suggest completion
          console.log(
            "📌 [ExecutionService] Sending completion nudge to frontend",
          );

          // Informational event for UI hooks/telemetry
          streamingService.sendCompletionDetected(res, {
            message:
              completionResult.nudge!.message ||
              "High confidence completion detected",
            confidence: completionResult.nudge!.confidence,
            score: completionResult.nudge!.score,
          } as any);

          streamingService.sendCompletionNudge(res, {
            message: completionResult.nudge!.message,
            confidence: completionResult.nudge!.confidence,
            score: completionResult.nudge!.score,
            substep_id: completionResult.nudge!.substep_id,
          });
        }
      } // End of V1 completion detection (if (!isV2Project))

      // ========================================
      // End of completion detection logic
      // ========================================
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

    // ✅ V2 Project Detection
    const isV2Project = !!(project as any).steps;

    let systemMessage: string;
    let phaseGoal = "Unknown";
    let stepLabel = "Unknown";

    if (isV2Project) {
      // V2 Project: Use master_prompt directly
      const v2Project = project as any;
      const currentStep = v2Project.steps?.find(
        (s: any) => s.step_number === v2Project.current_step,
      );

      const completedSteps =
        v2Project.steps
          ?.filter((s: any) => s.status === "completed")
          .map((s: any) => `- Step ${s.step_number}: ${s.title}`)
          .join("\n") || "None yet - this is the first step";

      phaseGoal = currentStep?.title || "Unknown Step";
      stepLabel = currentStep?.description || "Unknown";

      systemMessage = `${request.master_prompt}

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
    } else {
      // V1 Project: Use original phase/substep logic
      const currentPhase = project.phases?.find(
        (p: any) => p.phase_number === project.current_phase,
      );
      const currentSubstep = currentPhase?.substeps?.find(
        (s: any) => s.step_number === project.current_substep,
      );

      const completedSubsteps =
        currentPhase?.substeps
          ?.filter(
            (s: any) =>
              s.completed && s.step_number < (currentSubstep?.step_number || 0),
          )
          .map((s: any) => `- ${s.label} (Substep ${s.step_number})`)
          .join("\n") || "None yet - this is the first substep";

      const cumulativeContext = this.buildCumulativeContext(project);

      phaseGoal = currentPhase?.goal || "Unknown";
      stepLabel = currentSubstep?.label || "Unknown";

      systemMessage = PromptTemplates.executionSystem(
        project.goal,
        phaseGoal,
        stepLabel,
        completedSubsteps,
        request.master_prompt,
        cumulativeContext,
      );
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
        phase: phaseGoal,
        step: stepLabel,
        project_goal: project.goal,
      },
    };
  }
}

/**
 * Factory function to create ExecutionService
 */
export function createExecutionService(
  completionService: CompletionService,
  getProject: (projectId: string) => Promise<Project | undefined>,
): ExecutionService {
  return new ExecutionService(completionService, getProject);
}
