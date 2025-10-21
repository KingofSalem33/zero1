/**
 * Completion Confidence Detector
 *
 * Analyzes conversation and artifacts to detect when a substep is likely complete.
 * Provides nudges to users when confidence threshold is met.
 */

import type { ProjectSubstep, ArtifactAnalysis } from "../engine/types";
import type { Message } from "./threadService";

export interface CompletionConfidence {
  confidence: "low" | "medium" | "high";
  score: number; // 0-100
  satisfied_criteria: string[];
  missing_criteria: string[];
  recommendation: "continue_working" | "suggest_complete" | "ready_to_complete";
  nudge_message?: string;
}

export class CompletionDetector {
  /**
   * Analyze if a substep appears complete based on conversation and artifacts
   */
  analyzeCompletion(
    substep: ProjectSubstep,
    recentMessages: Message[],
    artifactAnalysis?: ArtifactAnalysis,
  ): CompletionConfidence {
    const criteria = this.extractCriteria(substep);
    const satisfiedCriteria: string[] = [];
    const missingCriteria: string[] = [];

    // Check artifact-based criteria
    if (artifactAnalysis) {
      if (artifactAnalysis.quality_score >= 7) {
        satisfiedCriteria.push("High-quality artifact uploaded");
      }
      if (artifactAnalysis.implementation_state === "complete") {
        satisfiedCriteria.push("Implementation marked complete");
      }
      if (
        artifactAnalysis.substep_completion_percentage &&
        artifactAnalysis.substep_completion_percentage >= 80
      ) {
        satisfiedCriteria.push(
          "Substep completion meets threshold (80%+ complete)",
        );
      }
    }

    // Check conversation-based criteria
    const conversationSignals = this.analyzeConversation(
      recentMessages,
      substep,
    );
    satisfiedCriteria.push(...conversationSignals.satisfied);
    missingCriteria.push(...conversationSignals.missing);

    // Calculate confidence score
    const totalCriteria = criteria.length;
    const satisfiedCount = satisfiedCriteria.length;
    const score =
      totalCriteria > 0 ? (satisfiedCount / totalCriteria) * 100 : 0;

    // Determine confidence level
    let confidence: "low" | "medium" | "high";
    if (score >= 80) confidence = "high";
    else if (score >= 50) confidence = "medium";
    else confidence = "low";

    // Determine recommendation
    let recommendation: CompletionConfidence["recommendation"];
    let nudgeMessage: string | undefined;

    // Only show nudges at score >= 70 (0.7 confidence threshold)
    if (score >= 70) {
      if (confidence === "high") {
        recommendation = "ready_to_complete";
        nudgeMessage = `Looks ready—press Complete when you agree.`;
      } else {
        // Medium confidence (70-79)
        recommendation = "suggest_complete";
        nudgeMessage = `Looks ready—press Complete when you agree.`;
      }
    } else {
      recommendation = "continue_working";
    }

    return {
      confidence,
      score,
      satisfied_criteria: satisfiedCriteria,
      missing_criteria: missingCriteria.slice(
        0,
        totalCriteria - satisfiedCount,
      ),
      recommendation,
      nudge_message: nudgeMessage,
    };
  }

  /**
   * Extract criteria from substep prompt
   */
  private extractCriteria(substep: ProjectSubstep): string[] {
    const criteria: string[] = [];

    // Look for common patterns in prompt_to_send
    const prompt = substep.prompt_to_send || "";

    // Look for bullet points
    const bulletMatches = prompt.match(/^[-•*]\s+(.+)$/gm);
    if (bulletMatches) {
      criteria.push(...bulletMatches.map((m) => m.replace(/^[-•*]\s+/, "")));
    }

    // Look for numbered lists
    const numberedMatches = prompt.match(/^\d+\.\s+(.+)$/gm);
    if (numberedMatches) {
      criteria.push(...numberedMatches.map((m) => m.replace(/^\d+\.\s+/, "")));
    }

    // Fallback: at least expect upload/review
    if (criteria.length === 0) {
      criteria.push("Complete the work described");
      criteria.push("Upload artifact for review");
    }

    return criteria;
  }

  /**
   * Analyze recent conversation for completion signals
   */
  private analyzeConversation(
    messages: Message[],
    _substep: ProjectSubstep,
  ): { satisfied: string[]; missing: string[] } {
    const satisfied: string[] = [];
    const missing: string[] = [];

    const recentContent = messages
      .slice(-5)
      .map((m) => m.content.toLowerCase())
      .join(" ");

    // Positive signals
    const positiveSignals = [
      {
        pattern: /completed|finished|done with/i,
        label: "User indicated work is complete",
      },
      {
        pattern: /uploaded|attached|shared/i,
        label: "User uploaded deliverable",
      },
      {
        pattern: /implemented|built|created/i,
        label: "User completed implementation",
      },
      { pattern: /tested|verified|confirmed/i, label: "User tested the work" },
      { pattern: /ready|prepared/i, label: "User indicates readiness" },
    ];

    for (const signal of positiveSignals) {
      if (signal.pattern.test(recentContent)) {
        satisfied.push(signal.label);
      }
    }

    // Negative signals
    const negativeSignals = [
      {
        pattern: /stuck|blocked|issue|problem|error/i,
        label: "User experiencing difficulties",
      },
      {
        pattern: /not sure|unclear|confused/i,
        label: "User needs clarification",
      },
      { pattern: /haven't|didn't|not yet/i, label: "Work not yet complete" },
    ];

    for (const signal of negativeSignals) {
      if (signal.pattern.test(recentContent)) {
        missing.push(signal.label);
      }
    }

    return { satisfied, missing };
  }

  /**
   * Check if user message contains explicit completion request
   */
  isExplicitCompletionRequest(message: string): boolean {
    const patterns = [
      /mark (this |substep |step )?complete/i,
      /i('m| am) done/i,
      /ready to move on/i,
      /next (step|substep)/i,
      /complete (this |substep |step)/i,
    ];

    return patterns.some((pattern) => pattern.test(message));
  }
}

export const completionDetector = new CompletionDetector();
