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
  // FALLBACK: STATIC SIGNAL DETECTION (Code Projects Only)
  // ========================================

  // Only use static detection if LLM analysis is unavailable or incomplete
  // This primarily helps with code artifacts where file structure is detectable
  const useFallbackDetection = !llmAnalysis?.substep_requirements;

  if (useFallbackDetection) {
    // ========================================
    // PHASE 1: BUILD ENVIRONMENT
    // ========================================

    // P1.1: Identify essential tools
    if (signals.tech_stack.length > 0) {
      results.push({
        phase_number: 1,
        substep_number: 1,
        status: "complete",
        evidence: `Tech stack identified: ${signals.tech_stack.join(", ")}`,
        confidence: 100,
        timestamp,
      });
    }

    // P1.2: Install and configure tools
    const hasBasicSetup = signals.has_typescript || signals.file_count > 5;
    const hasQualityTools = signals.has_linter && signals.has_prettier;

    if (hasBasicSetup && hasQualityTools) {
      results.push({
        phase_number: 1,
        substep_number: 2,
        status: "complete",
        evidence: `Development environment configured (TypeScript: ${signals.has_typescript}, Linter: ${signals.has_linter}, Prettier: ${signals.has_prettier})`,
        confidence: 100,
        timestamp,
      });
    } else if (hasBasicSetup) {
      results.push({
        phase_number: 1,
        substep_number: 2,
        status: "partial",
        evidence: `Basic setup exists but missing quality tools (Linter: ${signals.has_linter}, Prettier: ${signals.has_prettier})`,
        confidence: 60,
        timestamp,
      });
    }

    // P1.3: Create workspace structure
    if (signals.file_count > 3 && signals.folder_depth > 1) {
      results.push({
        phase_number: 1,
        substep_number: 3,
        status: "complete",
        evidence: `Project structure created (${signals.file_count} files, ${signals.folder_depth} levels deep)`,
        confidence: 90,
        timestamp,
      });
    }

    // P1.4: Hello World / Proof Point
    if (signals.file_count > 10 || signals.has_tests) {
      results.push({
        phase_number: 1,
        substep_number: 4,
        status: "complete",
        evidence: `Working project detected (${signals.file_count} files${signals.has_tests ? ", tests present" : ""})`,
        confidence: 85,
        timestamp,
      });
    }

    // ========================================
    // PHASE 2: CORE LOOP
    // ========================================

    // P2.1: Define Input→Process→Output
    if (signals.file_count > 5) {
      results.push({
        phase_number: 2,
        substep_number: 1,
        status: "complete",
        evidence: `Core architecture defined (${signals.file_count} implementation files)`,
        confidence: 75,
        timestamp,
      });
    }

    // P2.2: Implement core loop
    const hasSubstantialCode = signals.file_count > 15;
    const hasTechStack = signals.tech_stack.length > 2;

    if (hasSubstantialCode && hasTechStack) {
      results.push({
        phase_number: 2,
        substep_number: 2,
        status: "complete",
        evidence: `Core loop implemented (${signals.file_count} files, tech: ${signals.tech_stack.join(", ")})`,
        confidence: 85,
        timestamp,
      });
    } else if (signals.file_count > 8) {
      results.push({
        phase_number: 2,
        substep_number: 2,
        status: "partial",
        evidence: `Core implementation started (${signals.file_count} files)`,
        confidence: 50,
        timestamp,
      });
    }

    // P2.3: Test core loop
    if (signals.has_tests) {
      results.push({
        phase_number: 2,
        substep_number: 3,
        status: "complete",
        evidence: `Tests found in project`,
        confidence: 95,
        timestamp,
      });
    }

    // ========================================
    // PHASE 3: LAYERED EXPANSION
    // ========================================

    // P3.1-3: Feature additions (if file count is high, assume expansion)
    if (signals.file_count > 30) {
      results.push({
        phase_number: 3,
        substep_number: 1,
        status: "complete",
        evidence: `Feature expansion detected (${signals.file_count} files indicates layered development)`,
        confidence: 70,
        timestamp,
      });
    }

    // ========================================
    // PHASE 4: REALITY TEST (harder to detect)
    // ========================================

    // Can't reliably detect from static analysis
    // Would need user feedback data or test results

    // ========================================
    // PHASE 5: POLISH & FREEZE SCOPE
    // ========================================

    // P5.1: Documentation
    if (signals.has_documentation && signals.readme_length > 500) {
      results.push({
        phase_number: 5,
        substep_number: 1,
        status: "complete",
        evidence: `Documentation present (README: ${signals.readme_length} chars, docs folder: ${signals.has_documentation})`,
        confidence: 90,
        timestamp,
      });
    } else if (signals.readme_length > 100) {
      results.push({
        phase_number: 5,
        substep_number: 1,
        status: "partial",
        evidence: `README started (${signals.readme_length} chars) but needs expansion`,
        confidence: 50,
        timestamp,
      });
    }

    // P5.2: Code quality checks
    if (signals.has_linter && signals.has_prettier && signals.has_tests) {
      results.push({
        phase_number: 5,
        substep_number: 2,
        status: "complete",
        evidence: `Code quality tools configured (Linter, Prettier, Tests)`,
        confidence: 95,
        timestamp,
      });
    }

    // ========================================
    // PHASE 6: LAUNCH
    // ========================================

    // P6.1: Deployment configuration
    if (signals.has_deploy_config && signals.deploy_platform) {
      results.push({
        phase_number: 6,
        substep_number: 1,
        status: "complete",
        evidence: `Deployment configured for ${signals.deploy_platform}`,
        confidence: 100,
        timestamp,
      });
    }

    // ========================================
    // VERSION CONTROL
    // ========================================

    // Git usage (applies to multiple phases)
    if (signals.has_git && signals.commit_count > 0) {
      const gitEvidence = `Git repository active (${signals.commit_count} commits${signals.last_commit_time ? `, last: ${new Date(signals.last_commit_time).toLocaleDateString()}` : ""})`;

      // Add as evidence for relevant phases
      if (
        !results.some((r) => r.phase_number === 1 && r.substep_number === 3)
      ) {
        results.push({
          phase_number: 1,
          substep_number: 3,
          status: "complete",
          evidence: gitEvidence,
          confidence: 85,
          timestamp,
        });
      }
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
