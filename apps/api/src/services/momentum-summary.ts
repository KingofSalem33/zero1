/**
 * Momentum Summary Builder
 *
 * Packages iteration diffs, roadmap matching, and work type
 * into a concise, user-facing "Here’s what changed since last upload" message.
 */

import type { IterationDiff } from "./llm-artifact-analyzer";
import type { RoadmapDiff } from "./artifact-roadmap-matcher";

export interface MomentumInputs {
  workType: string; // e.g., code, design, document, plan, content
  iteration: IterationDiff | null;
  roadmap: RoadmapDiff | null;
  rollback?: {
    severity: "warning" | "critical";
    reason: string;
  } | null;
}

export function buildMomentumSummary(inputs: MomentumInputs): string {
  const parts: string[] = [];

  // Header
  parts.push("**Here’s what changed since last upload**");

  // Work type
  if (inputs.workType) {
    parts.push(`- Work type: ${inputs.workType.toUpperCase()}`);
  }

  // Iteration diffs
  if (inputs.iteration) {
    const it = inputs.iteration;
    const bullets: string[] = [];
    if (it.content_hash_changed) bullets.push("Content changed");
    if (it.improvements_made.length)
      bullets.push(`Improvements: ${it.improvements_made.join(", ")}`);
    if (it.issues_fixed.length)
      bullets.push(`Fixes: ${it.issues_fixed.join(", ")}`);
    if (it.new_issues.length)
      bullets.push(`New issues: ${it.new_issues.join(", ")}`);
    if (!bullets.length && it.changes_detected.length)
      bullets.push(it.changes_detected.join("; "));

    parts.push(
      `- Iteration ${it.iteration_number}: ${bullets.join(" · ") || "No detectable changes"}`,
    );
  }

  // Roadmap changes
  if (inputs.roadmap) {
    const rd = inputs.roadmap;
    const completed = rd.completed_substeps
      .filter((r) => r.status === "complete")
      .map((r) => `P${r.phase_number}.${r.substep_number}`);
    const partial = rd.completed_substeps
      .filter((r) => r.status === "partial")
      .map((r) => `P${r.phase_number}.${r.substep_number}`);

    if (completed.length) parts.push(`- Completed: ${completed.join(", ")}`);
    if (partial.length) parts.push(`- Partial: ${partial.join(", ")}`);
    parts.push(
      `- Now targeting: P${rd.recommended_phase}.${rd.recommended_substep} · ${rd.progress_percentage}% overall`,
    );
  }

  // Rollback narrative
  if (inputs.rollback) {
    const sev =
      inputs.rollback.severity === "critical" ? "Critical" : "Warning";
    parts.push(`- ${sev}: ${inputs.rollback.reason}`);
  }

  return parts.join("\n");
}
