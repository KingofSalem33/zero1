/**
 * Streaming Service
 *
 * Handles Server-Sent Events (SSE) for real-time AI responses.
 * Provides type-safe event sending and consistent event format.
 *
 * This is where we FIX THE COMPLETION SYNC GAP by adding:
 * - completion_detected event
 * - completion_nudge event
 * - substep_completed event
 */

import type { Response } from "express";

export interface CompletionNudge {
  message: string;
  confidence: "low" | "medium" | "high";
  score: number;
  substep_id: string;
}

export interface SubstepCompletion {
  phase_id: string;
  substep_number: number;
  next_phase_id?: string;
  next_substep_number?: number;
  briefing?: string;
}

export interface ToolCall {
  tool: string;
  args?: any;
}

export interface ToolResult {
  tool: string;
  result?: any;
}

export interface ToolError {
  tool: string;
  error: string;
}

/**
 * StreamingService - Type-safe SSE event sending
 */
export class StreamingService {
  /**
   * Send a generic SSE event
   */
  private sendEvent(res: Response, event: string, data: any): void {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`[StreamingService] Failed to send ${event} event:`, error);
    }
  }

  /**
   * Send heartbeat to keep connection alive
   */
  sendHeartbeat(res: Response): void {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (error) {
      console.error("[StreamingService] Failed to send heartbeat:", error);
    }
  }

  /**
   * Send content delta (streaming text)
   */
  sendContent(res: Response, delta: string): void {
    this.sendEvent(res, "content", { delta });
  }

  /**
   * Send status update
   */
  sendStatus(res: Response, message: string): void {
    this.sendEvent(res, "status", { message });
  }

  /**
   * Send tool call start
   */
  sendToolCall(res: Response, toolCall: ToolCall): void {
    this.sendEvent(res, "tool_call", toolCall);
  }

  /**
   * Send tool result
   */
  sendToolResult(res: Response, toolResult: ToolResult): void {
    this.sendEvent(res, "tool_result", toolResult);
  }

  /**
   * Send tool error
   */
  sendToolError(res: Response, toolError: ToolError): void {
    this.sendEvent(res, "tool_error", toolError);
  }

  /**
   * Send citations
   */
  sendCitations(res: Response, citations: string[]): void {
    this.sendEvent(res, "citations", { citations });
  }

  /**
   * Send error
   */
  sendError(res: Response, message: string): void {
    this.sendEvent(res, "error", { message });
  }

  /**
   * Send done signal
   */
  sendDone(res: Response, metadata?: any): void {
    this.sendEvent(res, "done", metadata || {});
  }

  // ========================================
  // NEW: Completion Sync Events
  // ========================================

  /**
   * Send completion nudge - suggests user mark substep complete
   *
   * This is sent when the system detects high confidence that
   * the substep is complete, but wants user confirmation.
   */
  sendCompletionNudge(res: Response, nudge: CompletionNudge): void {
    console.log(
      `📌 [StreamingService] Sending completion nudge: ${nudge.message}`,
    );
    this.sendEvent(res, "completion_nudge", nudge);
  }

  /**
   * Send substep completed - automatic completion detected
   *
   * This is sent when the system automatically completes a substep
   * (either via explicit user request like "I'm done" or high confidence detection).
   *
   * Frontend should:
   * 1. Refresh project state
   * 2. Show celebration message
   * 3. Update roadmap UI
   */
  sendSubstepCompleted(res: Response, completion: SubstepCompletion): void {
    console.log(
      `✅ [StreamingService] Sending substep completed: ${completion.phase_id}/${completion.substep_number}`,
    );
    this.sendEvent(res, "substep_completed", completion);
  }

  /**
   * Send completion detected - high confidence but no auto-action
   *
   * This is sent when the system detects completion signals
   * but wants to inform the user without taking automatic action.
   */
  sendCompletionDetected(
    res: Response,
    detection: { confidence: string; score: number; message: string },
  ): void {
    console.log(
      `🔍 [StreamingService] Sending completion detected: ${detection.confidence} (${detection.score}%)`,
    );
    this.sendEvent(res, "completion_detected", detection);
  }

  // ========================================
  // NEW: Roadmap Generation Progress Events
  // ========================================

  /**
   * Send roadmap generation start
   */
  sendRoadmapStart(
    res: Response,
    data: { projectId: string; goal: string },
  ): void {
    console.log(
      `🚀 [StreamingService] Starting roadmap generation for project: ${data.projectId}`,
    );
    this.sendEvent(res, "roadmap_start", data);
  }

  /**
   * Send phase generation progress
   */
  sendPhaseProgress(
    res: Response,
    data: { phase: number; total: number; title: string; phaseData?: any },
  ): void {
    console.log(
      `📋 [StreamingService] Phase ${data.phase}/${data.total}: ${data.title}`,
    );
    this.sendEvent(res, "phase_progress", data);
  }

  /**
   * Send substep expansion progress
   */
  sendSubstepExpansion(
    res: Response,
    data: {
      phase: number;
      substepCount: number;
      phaseData?: any;
      substeps?: any[];
    },
  ): void {
    console.log(
      `🔍 [StreamingService] Expanding Phase ${data.phase} with ${data.substepCount} substeps`,
    );
    this.sendEvent(res, "substep_expansion", data);
  }

  /**
   * Send roadmap generation complete
   */
  sendRoadmapComplete(
    res: Response,
    data: { projectId: string; phaseCount: number },
  ): void {
    console.log(
      `✅ [StreamingService] Roadmap complete for project: ${data.projectId} (${data.phaseCount} phases)`,
    );
    this.sendEvent(res, "roadmap_complete", data);
  }

  /**
   * Send roadmap generation error
   */
  sendRoadmapError(res: Response, error: { message: string }): void {
    console.log(
      `❌ [StreamingService] Roadmap generation error: ${error.message}`,
    );
    this.sendEvent(res, "roadmap_error", error);
  }
}

/**
 * Singleton instance
 */
export const streamingService = new StreamingService();
