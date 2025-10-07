/**
 * Rollback Detection System
 * Detects when a user is stuck and needs to rollback to an earlier phase
 */

import type { ArtifactAnalysis } from "./llm-artifact-analyzer";

export interface RollbackRecommendation {
  should_rollback: boolean;
  severity: "none" | "warning" | "critical";
  reason: string;
  rollback_to_phase: string | null;
  rollback_to_substep: number | null;
  guidance: string[];
  evidence: string[];
}

/**
 * Analyze artifact iteration history to detect if rollback is needed
 */
export function detectRollbackNeed(
  currentAnalysis: ArtifactAnalysis,
  previousAnalyses: ArtifactAnalysis[],
  currentPhase: string,
  _currentSubstep: number,
  roadmap: any,
): RollbackRecommendation {
  const recommendation: RollbackRecommendation = {
    should_rollback: false,
    severity: "none",
    reason: "",
    rollback_to_phase: null,
    rollback_to_substep: null,
    guidance: [],
    evidence: [],
  };

  // DETECTION 1: Critically low quality score
  if (currentAnalysis.quality_score < 4) {
    recommendation.severity = "critical";
    recommendation.evidence.push(
      `Quality score critically low: ${currentAnalysis.quality_score}/10`,
    );
  }

  // DETECTION 2: No improvement over multiple iterations
  if (previousAnalyses.length >= 3) {
    const recentAnalyses = previousAnalyses.slice(-3);
    const qualityTrend = recentAnalyses.map((a) => a.quality_score);
    const averageQuality =
      qualityTrend.reduce((sum, q) => sum + q, 0) / qualityTrend.length;

    // No quality improvement in last 3 iterations
    const isStuck = Math.max(...qualityTrend) - Math.min(...qualityTrend) < 1.0;

    if (isStuck && averageQuality < 6) {
      recommendation.severity =
        recommendation.severity === "critical" ? "critical" : "warning";
      recommendation.evidence.push(
        `Stuck: No quality improvement over ${previousAnalyses.length} iterations (avg: ${averageQuality.toFixed(1)}/10)`,
      );
    }
  }

  // DETECTION 3: Same issues persisting across iterations
  if (previousAnalyses.length >= 2) {
    const previousIssues =
      previousAnalyses[previousAnalyses.length - 1]?.bugs_or_errors || [];
    const currentIssues = currentAnalysis.bugs_or_errors || [];

    const persistingIssues = previousIssues.filter((issue) =>
      currentIssues.some((current) =>
        current.toLowerCase().includes(issue.toLowerCase().substring(0, 20)),
      ),
    );

    if (persistingIssues.length >= 2) {
      recommendation.evidence.push(
        `${persistingIssues.length} issues persist despite corrections`,
      );
      if (recommendation.severity === "none") {
        recommendation.severity = "warning";
      }
    }
  }

  // DETECTION 4: Missing fundamental elements from earlier phases
  const missingFundamentals = currentAnalysis.missing_elements?.filter(
    (element) =>
      element.toLowerCase().includes("environment") ||
      element.toLowerCase().includes("setup") ||
      element.toLowerCase().includes("basic") ||
      element.toLowerCase().includes("foundation"),
  );

  if (missingFundamentals && missingFundamentals.length > 0) {
    recommendation.evidence.push(
      `Missing fundamental elements: ${missingFundamentals.join(", ")}`,
    );
    recommendation.severity = "critical";
  }

  // DECISION: Determine if rollback is needed
  if (
    recommendation.severity === "critical" ||
    recommendation.evidence.length >= 3
  ) {
    recommendation.should_rollback = true;

    // Find the rollback target from current phase's rollback_plan
    const currentPhaseData = roadmap?.phases?.find(
      (p: any) => p.phase_id === currentPhase,
    );

    if (
      currentPhaseData?.rollback_plan &&
      currentPhaseData.rollback_plan.length > 0
    ) {
      // Parse rollback plan to find target phase
      const rollbackInstruction = currentPhaseData.rollback_plan[0];

      // Extract phase number from instruction (e.g., "Return to environment setup" -> P1)
      if (rollbackInstruction.toLowerCase().includes("vision")) {
        recommendation.rollback_to_phase = "P0";
        recommendation.rollback_to_substep = 1;
      } else if (rollbackInstruction.toLowerCase().includes("environment")) {
        recommendation.rollback_to_phase = "P1";
        recommendation.rollback_to_substep = 1;
      } else if (rollbackInstruction.toLowerCase().includes("core loop")) {
        recommendation.rollback_to_phase = "P2";
        recommendation.rollback_to_substep = 1;
      } else if (rollbackInstruction.toLowerCase().includes("expansion")) {
        recommendation.rollback_to_phase = "P3";
        recommendation.rollback_to_substep = 1;
      } else if (
        rollbackInstruction.toLowerCase().includes("testing") ||
        rollbackInstruction.toLowerCase().includes("reality")
      ) {
        recommendation.rollback_to_phase = "P4";
        recommendation.rollback_to_substep = 1;
      } else if (rollbackInstruction.toLowerCase().includes("polish")) {
        recommendation.rollback_to_phase = "P5";
        recommendation.rollback_to_substep = 1;
      } else if (rollbackInstruction.toLowerCase().includes("launch")) {
        recommendation.rollback_to_phase = "P6";
        recommendation.rollback_to_substep = 1;
      } else {
        // Default: go back one phase
        const currentPhaseNum = parseInt(currentPhase.replace("P", ""));
        recommendation.rollback_to_phase = `P${Math.max(0, currentPhaseNum - 1)}`;
        recommendation.rollback_to_substep = 1;
      }

      recommendation.reason = `${recommendation.severity === "critical" ? "Critical issues detected" : "Progress stalled"} - ${rollbackInstruction}`;
      recommendation.guidance = [
        ...currentPhaseData.rollback_plan,
        "Review what went wrong in this phase",
        "Ensure fundamentals are solid before advancing",
        `A checkpoint has been created - you can restore it later if needed`,
      ];
    } else {
      // Fallback: go back one phase
      const currentPhaseNum = parseInt(currentPhase.replace("P", ""));
      recommendation.rollback_to_phase = `P${Math.max(0, currentPhaseNum - 1)}`;
      recommendation.rollback_to_substep = 1;
      recommendation.reason =
        "Critical issues detected - recommend going back to rebuild foundation";
      recommendation.guidance = [
        "Simplify your approach",
        "Focus on fundamentals first",
        "Build incrementally with testing at each step",
      ];
    }
  } else if (recommendation.severity === "warning") {
    // Warning but no rollback - provide guidance
    recommendation.guidance = [
      "Consider simplifying your current approach",
      "Break work into smaller pieces",
      "Focus on fixing one issue at a time",
      "Review the phase's acceptance criteria",
    ];
  }

  return recommendation;
}

/**
 * Check if rollback recommendation is appropriate based on context
 */
export function shouldAutoRollback(
  recommendation: RollbackRecommendation,
  iterationCount: number,
): boolean {
  // Only auto-rollback after multiple attempts
  if (iterationCount < 3) return false;

  // Only auto-rollback on critical severity
  if (recommendation.severity !== "critical") return false;

  // Only auto-rollback if we have a valid target
  if (!recommendation.rollback_to_phase) return false;

  return true;
}
