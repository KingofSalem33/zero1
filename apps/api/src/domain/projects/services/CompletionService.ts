/**
 * Completion Service
 *
 * Handles substep and phase completion with:
 * - Manual completion (user clicks "Mark Complete")
 * - Automatic completion detection
 * - Celebration briefing generation
 * - Phase unlocking
 * - State management integration
 *
 * This is where we FIX THE COMPLETION SYNC GAP!
 */

// Response type not needed in this file
import { completionDetector } from "../../../services/completionDetector";
import { ProjectStateManager } from "../../../services/projectStateManager";
import type { Message } from "../../../services/threadService";
import { PromptTemplates } from "../../../infrastructure/ai/PromptTemplates";
import { openAIClient } from "../../../infrastructure/ai/OpenAIClient";
import type { Project } from "../../../engine/types";

export interface CompletionRequest {
  project_id: string;
  phase_id: string;
  substep_number: number;
}

export interface CompletionResult {
  phase_id: string;
  substep_number: number;
  next_phase_id?: string;
  next_substep_number?: number;
  briefing?: string;
  phase_completed?: boolean;
  project_completed?: boolean;
}

export interface CompletionDetectionResult {
  action: "completed" | "nudge" | "none";
  result?: CompletionResult;
  nudge?: {
    message: string;
    confidence: "low" | "medium" | "high";
    score: number;
    substep_id: string;
  };
}

/**
 * CompletionService - Handle all substep/phase completion logic
 */
export class CompletionService {
  constructor(
    private stateManager: ProjectStateManager,
    private getProject: (projectId: string) => Promise<Project | undefined>,
  ) {}

  /**
   * Complete a substep manually (user clicked "Mark Complete")
   */
  async completeSubstep(request: CompletionRequest): Promise<CompletionResult> {
    console.log(
      `✅ [CompletionService] Manual completion: ${request.phase_id}/${request.substep_number}`,
    );

    const project = await this.getProject(request.project_id);
    if (!project) {
      throw new Error("Project not found");
    }

    // Get substep details for briefing
    const completedPhase = project.phases?.find(
      (p: any) => p.phase_id === request.phase_id,
    );
    const completedSubstep = completedPhase?.substeps?.find(
      (s: any) => s.step_number === request.substep_number,
    );

    if (!completedSubstep) {
      throw new Error("Substep not found");
    }

    // Use ProjectStateManager to atomically update state
    const { state: newState, summary } =
      await this.stateManager.applyProjectUpdate(request.project_id, {
        completeSubstep: {
          phase: request.phase_id,
          substep: request.substep_number,
        },
        advanceSubstepSequential: true, // CRITICAL: Use sequential for manual completion
      });

    console.log(
      `COMPLETE [CompletionService] ${request.phase_id}/${request.substep_number} -> ${newState.current_phase}.${newState.current_substep} | ${summary}`,
    );

    // Get next substep for briefing
    const nextSubstep = this.stateManager.getCurrentSubstep(newState);

    // Generate briefing if there's a next substep
    let briefingMessage: string | undefined;
    if (nextSubstep) {
      briefingMessage = await this.generateBriefing(
        project,
        completedSubstep,
        nextSubstep,
      );
    }

    return {
      phase_id: request.phase_id,
      substep_number: request.substep_number,
      next_phase_id: nextSubstep ? String(newState.current_phase) : undefined,
      next_substep_number: nextSubstep ? newState.current_substep : undefined,
      briefing: briefingMessage,
      phase_completed: !nextSubstep,
      project_completed: !nextSubstep,
    };
  }

  /**
   * Detect if substep should be auto-completed based on conversation
   *
   * THIS IS THE KEY METHOD THAT FIXES THE SYNC GAP!
   */
  async detectCompletion(
    project: Project,
    recentMessages: Message[],
    _aiResponse: string,
  ): Promise<CompletionDetectionResult> {
    // Handle both number (1, 2, 3) and string ("P1", "P2", "P3") phase formats
    const currentPhase = project.phases?.find((p: any) => {
      if (typeof project.current_phase === "number") {
        return p.phase_number === project.current_phase;
      }
      return p.phase_id === project.current_phase;
    });

    const currentSubstep = currentPhase?.substeps?.find(
      (s: any) => s.step_number === project.current_substep,
    );

    if (!currentSubstep) {
      return { action: "none" };
    }

    if (!currentPhase) {
      return { action: "none" };
    }

    // Check for explicit completion requests ("I'm done", "mark complete", etc.)
    const hasExplicitRequest = recentMessages.some((msg) =>
      completionDetector.isExplicitCompletionRequest(msg.content),
    );

    if (hasExplicitRequest && currentPhase && currentSubstep) {
      console.log(
        "🎯 [CompletionService] Explicit completion request detected - auto-completing",
      );

      // Auto-complete the substep
      const result = await this.completeSubstep({
        project_id: project.id,
        phase_id: currentPhase.phase_id,
        substep_number: currentSubstep.step_number,
      });

      return {
        action: "completed",
        result,
      };
    }

    // Analyze conversation for completion signals
    // ✅ Gap #3 Fix: Pass phase for acceptance criteria
    const confidence = completionDetector.analyzeCompletion(
      currentSubstep,
      recentMessages,
      undefined,
      currentPhase,
    );

    // Auto-complete immediately on high-confidence recommendation
    if (confidence.recommendation === "ready_to_complete") {
      console.log(
        'dYZ_ [CompletionService] High confidence "ready_to_complete" - auto-completing substep',
      );

      const result = await this.completeSubstep({
        project_id: project.id,
        phase_id: currentPhase.phase_id,
        substep_number: currentSubstep.step_number,
      });

      return {
        action: "completed",
        result,
      };
    }

    console.log(
      `🔍 [CompletionService] Completion confidence: ${confidence.confidence} (${confidence.score}%)`,
    );

    if (confidence.recommendation === "suggest_complete") {
      // Medium confidence - gentle nudge
      return {
        action: "nudge",
        nudge: {
          message:
            confidence.nudge_message ||
            "Making progress! Let me know when you're ready to move on.",
          confidence: confidence.confidence,
          score: confidence.score,
          substep_id: currentSubstep.substep_id,
        },
      };
    }

    return { action: "none" };
  }

  /**
   * Generate celebration briefing for completed substep
   */
  private async generateBriefing(
    project: Project,
    completedSubstep: any,
    nextSubstep: any,
  ): Promise<string> {
    const currentPhase = project.phases?.find(
      (p: any) => p.phase_number === project.current_phase,
    );

    if (!currentPhase) {
      return `🎉 Great work completing "${completedSubstep.label}"! Next up: "${nextSubstep.label}"`;
    }

    if (!openAIClient.isAvailable()) {
      // Fallback briefing
      return `🎉 Great work completing "${completedSubstep.label}"! Next up: "${nextSubstep.label}"`;
    }

    try {
      const prompt = PromptTemplates.completionBriefing(
        currentPhase?.goal || "Current Phase",
        completedSubstep.label,
        currentPhase?.goal || "Next Phase",
        nextSubstep.label,
        project.goal,
      );

      const briefing = await openAIClient.chat(
        [
          {
            role: "system",
            content: prompt,
          },
          {
            role: "user",
            content: "Generate the briefing message.",
          },
        ],
        {
          temperature: 0.7,
          max_tokens: 200,
        },
      );

      return briefing.trim();
    } catch (error) {
      console.error("[CompletionService] Failed to generate briefing:", error);
      // Fallback
      return `🎉 Great work completing "${completedSubstep.label}"! Next up: "${nextSubstep.label}"`;
    }
  }

  /**
   * Check if user message contains explicit completion request
   */
  isExplicitCompletionRequest(message: string): boolean {
    return completionDetector.isExplicitCompletionRequest(message);
  }
}

/**
 * Factory function to create CompletionService
 */
export function createCompletionService(
  stateManager: ProjectStateManager,
  getProject: (projectId: string) => Promise<Project | undefined>,
): CompletionService {
  return new CompletionService(stateManager, getProject);
}
