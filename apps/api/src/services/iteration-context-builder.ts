/**
 * Iteration Context Builder
 * Builds cumulative memory from all artifacts in the current substep
 * Ensures AI doesn't forget previous feedback and tracks progression
 */

import type { ArtifactAnalysis } from "./llm-artifact-analyzer";

export interface IterationContext {
  iteration_number: number;
  substep_label: string;
  substep_requirements: string[];
  previously_addressed: string[];
  still_missing: string[];
  quality_progression: number[];
  previous_feedback: string[];
  file_diff_summary: string;
  content_hashes: string[];
  has_meaningful_changes: boolean;
}

interface ArtifactWithAnalysis {
  analysis: ArtifactAnalysis;
  content_hash: string;
  uploaded_at: string;
}

/**
 * Build cumulative context from all previous artifact iterations
 */
export function buildIterationContext(
  previousArtifacts: ArtifactWithAnalysis[],
  currentSubstep: { label: string; prompt_to_send: string },
): IterationContext {
  const context: IterationContext = {
    iteration_number: previousArtifacts.length + 1,
    substep_label: currentSubstep.label,
    substep_requirements: extractRequirements(currentSubstep.prompt_to_send),
    previously_addressed: [],
    still_missing: [],
    quality_progression: [],
    previous_feedback: [],
    file_diff_summary: "",
    content_hashes: [],
    has_meaningful_changes: true,
  };

  if (previousArtifacts.length === 0) {
    context.still_missing = context.substep_requirements;
    return context;
  }

  // Extract quality progression and feedback
  for (const artifact of previousArtifacts) {
    const analysis = artifact.analysis;

    // Track quality scores
    if (analysis.quality_score) {
      context.quality_progression.push(analysis.quality_score);
    }

    // Track content hashes to detect duplicate uploads
    context.content_hashes.push(artifact.content_hash);

    // Collect all previous feedback
    if (analysis.detailed_analysis) {
      context.previous_feedback.push(
        `Iteration ${context.previous_feedback.length + 1}: ${analysis.detailed_analysis}`,
      );
    }

    // Track what was missing
    if (analysis.missing_elements) {
      // These were missing in THIS iteration
      // Don't add to "still_missing" yet - need to check if fixed in later iterations
    }
  }

  // Check for duplicate/unchanged uploads
  if (context.content_hashes.length > 1) {
    const lastHash = context.content_hashes[context.content_hashes.length - 1];
    const secondLastHash =
      context.content_hashes[context.content_hashes.length - 2];
    if (lastHash === secondLastHash) {
      context.has_meaningful_changes = false;
    }
  }

  // Analyze what's been addressed over time
  const latestAnalysis =
    previousArtifacts[previousArtifacts.length - 1]?.analysis;

  if (latestAnalysis) {
    // What's currently still missing (from most recent analysis)
    context.still_missing = latestAnalysis.missing_elements || [];

    // What's been addressed = requirements - still_missing
    context.previously_addressed = context.substep_requirements.filter(
      (req) =>
        !context.still_missing.some(
          (missing) =>
            missing.toLowerCase().includes(req.toLowerCase()) ||
            req.toLowerCase().includes(missing.toLowerCase()),
        ),
    );

    // Build diff summary
    if (context.quality_progression.length > 1) {
      const firstScore = context.quality_progression[0];
      const latestScore =
        context.quality_progression[context.quality_progression.length - 1];
      const improvement = latestScore - firstScore;

      context.file_diff_summary =
        improvement > 0
          ? `Quality improved from ${firstScore}/10 to ${latestScore}/10 (+${improvement.toFixed(1)} points)`
          : improvement < 0
            ? `Quality decreased from ${firstScore}/10 to ${latestScore}/10 (${improvement.toFixed(1)} points)`
            : `Quality unchanged at ${latestScore}/10`;
    }
  }

  return context;
}

/**
 * Extract specific requirements from substep prompt
 */
function extractRequirements(prompt: string): string[] {
  const requirements: string[] = [];

  // Look for bullet points or numbered lists
  const bulletMatches = prompt.match(/[-•*]\s+([^\n]+)/g);
  if (bulletMatches) {
    requirements.push(
      ...bulletMatches.map((m) => m.replace(/^[-•*]\s+/, "").trim()),
    );
  }

  // Look for "must include", "should contain", etc.
  const mustInclude = prompt.match(
    /must\s+(?:include|have|contain):\s*([^\n.]+)/gi,
  );
  if (mustInclude) {
    requirements.push(...mustInclude.map((m) => m.split(":")[1].trim()));
  }

  // Look for numbered requirements
  const numberedMatches = prompt.match(/\d+\.\s+([^\n]+)/g);
  if (numberedMatches) {
    requirements.push(
      ...numberedMatches.map((m) => m.replace(/^\d+\.\s+/, "").trim()),
    );
  }

  // Fallback: extract key action verbs
  if (requirements.length === 0) {
    const actionPattern =
      /(create|build|design|implement|add|include|define|establish|develop)\s+([^,.\n]+)/gi;
    const actions = prompt.match(actionPattern);
    if (actions) {
      requirements.push(...actions.slice(0, 5)); // Limit to top 5
    }
  }

  return requirements.length > 0
    ? requirements
    : ["Complete the substep requirements"];
}

/**
 * Generate iteration summary for LLM prompt
 */
export function generateIterationSummary(context: IterationContext): string {
  if (context.iteration_number === 1) {
    return `**First Iteration**: Analyze against all substep requirements.

**Requirements**:
${context.substep_requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
  }

  let summary = `**Iteration ${context.iteration_number}** (Building on ${context.iteration_number - 1} previous attempts)

**Quality Progression**: ${context.quality_progression.join(" → ")}
**Diff**: ${context.file_diff_summary}

**Requirements for "${context.substep_label}"**:
${context.substep_requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}

`;

  if (context.previously_addressed.length > 0) {
    summary += `**✅ Already Addressed** (don't repeat this feedback):
${context.previously_addressed.map((a) => `- ${a}`).join("\n")}

`;
  }

  if (context.still_missing.length > 0) {
    summary += `**⏳ Still Missing** (focus here):
${context.still_missing.map((m) => `- ${m}`).join("\n")}

`;
  }

  if (!context.has_meaningful_changes) {
    summary += `⚠️ **WARNING**: User uploaded identical file. No changes detected since last iteration.
Provide clear guidance on WHAT to change and HOW.

`;
  }

  if (context.previous_feedback.length > 0) {
    summary += `**Previous Feedback History**:
${context.previous_feedback.map((f) => f).join("\n\n")}

`;
  }

  return summary;
}

/**
 * Check if user is stuck (multiple iterations without improvement)
 */
export function detectStuckState(context: IterationContext): {
  is_stuck: boolean;
  reason: string;
  guidance: string[];
} {
  const result = {
    is_stuck: false,
    reason: "",
    guidance: [] as string[],
  };

  // Stuck if 3+ iterations without meaningful changes
  if (context.iteration_number >= 3 && !context.has_meaningful_changes) {
    result.is_stuck = true;
    result.reason =
      "User uploaded identical file multiple times without making changes";
    result.guidance = [
      "Review the feedback carefully",
      "Make specific changes to address missing elements",
      "Ask for clarification if requirements are unclear",
    ];
    return result;
  }

  // Stuck if quality is declining
  if (context.quality_progression.length >= 3) {
    const recentScores = context.quality_progression.slice(-3);
    const isDecreasing =
      recentScores[1] < recentScores[0] && recentScores[2] < recentScores[1];

    if (isDecreasing) {
      result.is_stuck = true;
      result.reason = "Quality scores are declining across iterations";
      result.guidance = [
        "Review earlier versions that had higher quality",
        "Focus on addressing core requirements first",
        "Consider asking the AI for specific examples",
      ];
      return result;
    }
  }

  // Stuck if too many iterations without reaching completion
  if (context.iteration_number >= 5 && context.still_missing.length > 0) {
    result.is_stuck = true;
    result.reason = `After ${context.iteration_number} iterations, requirements are still incomplete`;
    result.guidance = [
      "Break down requirements into smaller tasks",
      "Focus on completing ONE missing element at a time",
      "Ask the AI to provide a detailed example",
    ];
    return result;
  }

  return result;
}
