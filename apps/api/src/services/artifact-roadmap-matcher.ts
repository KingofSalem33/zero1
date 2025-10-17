/**
 * Artifact-to-Roadmap Matcher
 *
 * Takes uploaded artifact signals and matches them against the current roadmap
 * to determine which substeps are complete, partial, or missing.
 *
 * This is the "AI Coach" intelligence that closes the feedback loop:
 * Work uploaded → Progress detected → Roadmap updated → Path adjusted
 */

import type { ArtifactSignals } from "./artifact-analyzer";

// Types
export interface SubstepCompletionResult {
  phase_number: number;
  substep_number: number;
  status: "complete" | "partial" | "incomplete";
  evidence: string; // What we found that proves completion
  confidence: number; // 0-100 confidence score
  timestamp: string;
}

export interface RoadmapDiff {
  completed_substeps: SubstepCompletionResult[];
  recommended_phase: number;
  recommended_substep: number;
  changes_summary: string; // Human-readable diff for Workshop AI
  progress_percentage: number; // Overall project completion 0-100
}

export interface Phase {
  phase_number: number;
  title: string;
  substeps?: Substep[];
  completed?: boolean;
}

export interface Substep {
  substep_number: number;
  title: string;
  description?: string;
  completed?: boolean;
}

/**
 * Main matcher function: analyzes artifact signals and determines
 * which substeps are complete based on evidence
 */
export interface LLMAnalysis {
  decision?: string;
  actual_phase?: string;
  quality_score?: number;
  detailed_analysis?: string;
  substep_requirements?: Array<{
    requirement: string;
    status: "DONE" | "PARTIAL" | "NOT_STARTED";
    evidence: string;
  }>;
  substep_completion_percentage?: number;
}

export function matchArtifactToRoadmap(
  signals: ArtifactSignals,
  currentRoadmap?: Phase[],
  _projectType?: string,
  llmAnalysis?: LLMAnalysis,
): RoadmapDiff {
  const results: SubstepCompletionResult[] = [];
  const timestamp = new Date().toISOString();

  // ========================================
  // LLM-DRIVEN COMPLETION DETECTION
  // ========================================

  // If LLM analysis has substep requirements, use those as primary source
  if (
    llmAnalysis?.substep_requirements &&
    llmAnalysis.substep_completion_percentage !== undefined
  ) {
    const completionPercentage = llmAnalysis.substep_completion_percentage;

    // Determine substep status based on completion percentage
    let substepStatus: "complete" | "partial" | "incomplete" = "incomplete";
    if (completionPercentage === 100) {
      substepStatus = "complete";
    } else if (completionPercentage > 0) {
      substepStatus = "partial";
    }

    // Extract current phase and substep from roadmap context
    if (currentRoadmap && currentRoadmap.length > 0) {
      const currentPhaseObj = currentRoadmap.find((p) => !p.completed);
      if (currentPhaseObj) {
        const currentSubstepObj = currentPhaseObj.substeps?.find(
          (s) => !s.completed,
        );

        if (currentSubstepObj) {
          results.push({
            phase_number: currentPhaseObj.phase_number,
            substep_number: currentSubstepObj.substep_number,
            status: substepStatus,
            evidence: `LLM-analyzed requirements: ${llmAnalysis.substep_requirements.filter((r) => r.status === "DONE").length}/${llmAnalysis.substep_requirements.length} complete`,
            confidence: completionPercentage,
            timestamp,
          });
        }
      }
    }

    // If 100% complete, also mark previous phases as complete based on LLM's actual_phase detection
    if (completionPercentage === 100 && llmAnalysis.actual_phase) {
      const phaseMatch = llmAnalysis.actual_phase.match(/P(\d+)/);
      if (phaseMatch) {
        const detectedPhase = parseInt(phaseMatch[1]);

        // Mark all phases before detected phase as complete
        for (let p = 0; p < detectedPhase; p++) {
          const phaseObj = currentRoadmap?.find(
            (phase) => phase.phase_number === p,
          );
          if (phaseObj?.substeps) {
            phaseObj.substeps.forEach((substep) => {
              if (
                !results.some(
                  (r) =>
                    r.phase_number === p &&
                    r.substep_number === substep.substep_number,
                )
              ) {
                results.push({
                  phase_number: p,
                  substep_number: substep.substep_number,
                  status: "complete",
                  evidence: `Prior phase work (LLM detected ${llmAnalysis.actual_phase})`,
                  confidence: 80,
                  timestamp,
                });
              }
            });
          }
        }
      }
    }
  }

  // ========================================
  // FALLBACK: DYNAMIC ROADMAP-AWARE DETECTION
  // ========================================

  // Only use fallback detection if LLM analysis is unavailable or incomplete
  // This helps with code artifacts where file structure is detectable
  // IMPORTANT: Works with dynamically generated roadmaps - no hardcoded phase assumptions
  const useFallbackDetection = !llmAnalysis?.substep_requirements;

  if (useFallbackDetection && currentRoadmap && currentRoadmap.length > 0) {
    // Try to infer completion from artifact signals
    // This is less accurate than LLM analysis but helps for code-heavy projects

    // Find first incomplete phase (current working phase)
    const currentPhaseObj =
      currentRoadmap.find((p) => !p.completed) || currentRoadmap[0];

    // Basic heuristic: tech stack presence suggests environment setup
    if (signals.tech_stack.length > 0 && currentPhaseObj) {
      const firstSubstep = currentPhaseObj.substeps?.[0];
      if (firstSubstep) {
        results.push({
          phase_number: currentPhaseObj.phase_number,
          substep_number: firstSubstep.substep_number,
          status: "partial",
          evidence: `Tech stack identified: ${signals.tech_stack.join(", ")}`,
          confidence: 60,
          timestamp,
        });
      }
    }

    // General code quality signals (applies to any code-based project)
    const codeQualitySignals: string[] = [];

    if (signals.has_tests) codeQualitySignals.push("tests");
    if (signals.has_linter) codeQualitySignals.push("linter");
    if (signals.has_prettier) codeQualitySignals.push("code formatting");
    if (signals.has_typescript) codeQualitySignals.push("TypeScript");
    if (signals.has_git && signals.commit_count > 0)
      codeQualitySignals.push(`${signals.commit_count} commits`);
    if (signals.has_deploy_config)
      codeQualitySignals.push(`${signals.deploy_platform} deployment`);
    if (signals.has_documentation) codeQualitySignals.push("documentation");

    // If substantial work is present, mark current substep as partially complete
    if (codeQualitySignals.length >= 3) {
      const secondSubstep = currentPhaseObj.substeps?.[1];
      if (secondSubstep) {
        results.push({
          phase_number: currentPhaseObj.phase_number,
          substep_number: secondSubstep.substep_number,
          status: "partial",
          evidence: `Code quality signals detected: ${codeQualitySignals.join(", ")}`,
          confidence: 70,
          timestamp,
        });
      }
    }

    // If extensive file structure exists, suggest progress beyond initial setup
    if (signals.file_count > 20 && signals.folder_depth > 2) {
      results.push({
        phase_number: currentPhaseObj.phase_number,
        substep_number: currentPhaseObj.substeps?.length || 1,
        status: "partial",
        evidence: `Substantial codebase detected (${signals.file_count} files, ${signals.folder_depth} levels deep)`,
        confidence: 65,
        timestamp,
      });
    }
  } // End fallback detection block

  // ========================================
  // CALCULATE RECOMMENDATIONS
  // ========================================

  let recommendedPhase: number;
  let recommendedSubstep: number;

  // Prioritize LLM-driven recommendations
  if (llmAnalysis?.actual_phase && currentRoadmap) {
    const phaseMatch = llmAnalysis.actual_phase.match(/P(\d+)/);
    if (phaseMatch) {
      const detectedPhase = parseInt(phaseMatch[1]);
      const phaseObj = currentRoadmap.find(
        (p) => p.phase_number === detectedPhase,
      );

      if (phaseObj) {
        const currentSubstepObj = phaseObj.substeps?.find((s) => !s.completed);
        recommendedPhase = detectedPhase;
        recommendedSubstep = currentSubstepObj?.substep_number || 1;
      } else {
        // Fall back to calculation
        recommendedPhase = Math.min(detectedPhase, 7);
        recommendedSubstep = 1;
      }
    } else {
      // Fall back to calculation
      const completedPhases = new Set(
        results
          .filter((r) => r.status === "complete")
          .map((r) => r.phase_number),
      );
      const highestCompletePhase =
        completedPhases.size > 0 ? Math.max(...Array.from(completedPhases)) : 0;
      recommendedPhase = Math.min(highestCompletePhase + 1, 7);
      recommendedSubstep = 1;
    }
  } else {
    // Fall back to static calculation
    const completedPhases = new Set(
      results.filter((r) => r.status === "complete").map((r) => r.phase_number),
    );
    const highestCompletePhase =
      completedPhases.size > 0 ? Math.max(...Array.from(completedPhases)) : 0;
    recommendedPhase = Math.min(highestCompletePhase + 1, 7);
    recommendedSubstep = 1;
  }

  // Calculate overall progress
  let progressPercentage: number;

  if (llmAnalysis?.substep_completion_percentage !== undefined) {
    // Use LLM's substep completion as indicator of current progress
    // Calculate based on current phase position and substep completion
    if (currentRoadmap && llmAnalysis.actual_phase) {
      const phaseMatch = llmAnalysis.actual_phase.match(/P(\d+)/);
      if (phaseMatch) {
        const currentPhase = parseInt(phaseMatch[1]);
        const totalPhases = 7;
        // Each phase represents ~14% of total progress
        const phaseProgress = (currentPhase / totalPhases) * 100;
        // Add current substep progress within phase
        const substepContribution =
          llmAnalysis.substep_completion_percentage / totalPhases;
        progressPercentage = Math.round(
          Math.min(phaseProgress + substepContribution, 100),
        );
      } else {
        progressPercentage = Math.round(
          llmAnalysis.substep_completion_percentage,
        );
      }
    } else {
      progressPercentage = Math.round(
        llmAnalysis.substep_completion_percentage,
      );
    }
  } else {
    // Fall back to static calculation
    const totalPossibleSubsteps = 25; // Approximate across all phases
    const completedCount = results.filter(
      (r) => r.status === "complete",
    ).length;
    const partialCount = results.filter((r) => r.status === "partial").length;
    progressPercentage = Math.round(
      ((completedCount + partialCount * 0.5) / totalPossibleSubsteps) * 100,
    );
  }

  // Generate human-readable summary
  const changesSummary = generateDiffSummary(results, recommendedPhase);

  return {
    completed_substeps: results,
    recommended_phase: recommendedPhase,
    recommended_substep: recommendedSubstep,
    changes_summary: changesSummary,
    progress_percentage: Math.min(progressPercentage, 100),
  };
}

/**
 * Generate human-readable diff summary for Workshop AI
 */
function generateDiffSummary(
  results: SubstepCompletionResult[],
  recommendedPhase: number,
): string {
  const complete = results.filter((r) => r.status === "complete");
  const partial = results.filter((r) => r.status === "partial");
  const incomplete = results.filter((r) => r.status === "incomplete");

  let summary = "📊 Artifact Analysis Results:\n\n";

  // Group by phase for readability
  const byPhase = new Map<number, SubstepCompletionResult[]>();
  complete.forEach((r) => {
    if (!byPhase.has(r.phase_number)) {
      byPhase.set(r.phase_number, []);
    }
    byPhase.get(r.phase_number)!.push(r);
  });

  if (complete.length > 0) {
    summary += "✅ COMPLETED:\n";
    Array.from(byPhase.entries())
      .sort(([a], [b]) => a - b)
      .forEach(([phase, substeps]) => {
        summary += `\nPhase ${phase}:\n`;
        substeps.forEach((r) => {
          summary += `  • Substep ${r.substep_number}: ${r.evidence}\n`;
        });
      });
  }

  if (partial.length > 0) {
    summary += "\n⚠️ PARTIALLY COMPLETE:\n";
    partial.forEach((r) => {
      summary += `  • P${r.phase_number}.${r.substep_number}: ${r.evidence}\n`;
    });
  }

  if (incomplete.length > 0) {
    summary += "\n❌ NEEDS WORK:\n";
    incomplete.forEach((r) => {
      summary += `  • P${r.phase_number}.${r.substep_number}: ${r.evidence}\n`;
    });
  }

  summary += `\n🎯 RECOMMENDATION: `;

  if (recommendedPhase === 1) {
    summary += `Start with Phase 1 (Build Environment)`;
  } else if (recommendedPhase <= 7) {
    summary += `Continue to Phase ${recommendedPhase}`;
  } else {
    summary += `Project appears complete! Move to Phase 7 (Reflect & Evolve)`;
  }

  const completedPhases = new Set(complete.map((r) => r.phase_number));
  if (completedPhases.size > 0) {
    summary += `\n\n✨ You've made progress on ${completedPhases.size} phase${completedPhases.size > 1 ? "s" : ""}!`;
  }

  return summary;
}

/**
 * Helper: Check if a specific substep is already marked complete in results
 */
export function isSubstepComplete(
  results: SubstepCompletionResult[],
  phase: number,
  substep: number,
): boolean {
  return results.some(
    (r) =>
      r.phase_number === phase &&
      r.substep_number === substep &&
      r.status === "complete",
  );
}

/**
 * Helper: Merge new completion results with existing project progress
 */
export function mergeCompletionResults(
  existingCompletions: SubstepCompletionResult[],
  newCompletions: SubstepCompletionResult[],
): SubstepCompletionResult[] {
  const merged = [...existingCompletions];

  newCompletions.forEach((newResult) => {
    const existingIndex = merged.findIndex(
      (e) =>
        e.phase_number === newResult.phase_number &&
        e.substep_number === newResult.substep_number,
    );

    if (existingIndex >= 0) {
      // Update if new result is better quality
      if (newResult.confidence >= merged[existingIndex].confidence) {
        merged[existingIndex] = newResult;
      }
    } else {
      // Add new completion
      merged.push(newResult);
    }
  });

  return merged.sort((a, b) => {
    if (a.phase_number !== b.phase_number) {
      return a.phase_number - b.phase_number;
    }
    return a.substep_number - b.substep_number;
  });
}
