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
   * Execute step with streaming (SSE)
   *
   * THIS IS WHERE THE MAGIC HAPPENS - automatic completion detection!
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

    // Get current context
    const currentPhase = project.phases?.find(
      (p: any) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s: any) => s.step_number === project.current_substep,
    );

    // Build context messages
    const completedSubsteps =
      currentPhase?.substeps
        ?.filter(
          (s: any) =>
            s.completed && s.step_number < (currentSubstep?.step_number || 0),
        )
        .map((s: any) => `- ${s.label} (Substep ${s.step_number})`)
        .join("\n") || "None yet - this is the first substep";

    const systemMessage = PromptTemplates.executionSystem(
      project.goal,
      currentPhase?.goal || "Unknown",
      currentSubstep?.label || "Unknown",
      completedSubsteps,
      request.master_prompt,
    );

    const userMessage =
      request.user_message ||
      "Please help me with this step. Provide detailed, actionable guidance.";

    try {
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

      // Stream the LLM response
      accumulatedResponse = await runModelStream(res, contextMessages, {
        toolSpecs: selectedSpecs,
        toolMap: selectedMap,
        model: ENV.OPENAI_MODEL_NAME,
      });

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

      // Detect completion AFTER the LLM response
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

    // Get current context
    const currentPhase = project.phases?.find(
      (p: any) => p.phase_number === project.current_phase,
    );
    const currentSubstep = currentPhase?.substeps?.find(
      (s: any) => s.step_number === project.current_substep,
    );

    // Build context
    const completedSubsteps =
      currentPhase?.substeps
        ?.filter(
          (s: any) =>
            s.completed && s.step_number < (currentSubstep?.step_number || 0),
        )
        .map((s: any) => `- ${s.label} (Substep ${s.step_number})`)
        .join("\n") || "None yet - this is the first substep";

    const systemMessage = PromptTemplates.executionSystem(
      project.goal,
      currentPhase?.goal || "Unknown",
      currentSubstep?.label || "Unknown",
      completedSubsteps,
      request.master_prompt,
    );

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
        phase: currentPhase?.goal || "Unknown",
        step: currentSubstep?.label || "Unknown",
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
