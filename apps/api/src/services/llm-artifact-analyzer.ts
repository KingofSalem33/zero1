/**
 * LLM-Powered Artifact Analyzer
 * Combines static analysis with AI-powered project reconstruction
 */

import { runModel } from "../ai/runModel";
import type { ArtifactSignals } from "./artifact-analyzer";
import * as fs from "fs";
import * as path from "path";

/**
 * Detect what changed between artifact iterations
 */
export interface IterationDiff {
  iteration_number: number;
  changes_detected: string[];
  improvements_made: string[];
  issues_fixed: string[];
  new_issues: string[];
  content_hash_changed: boolean;
}

export function detectIterationChanges(
  previousAnalysis: ArtifactAnalysis | null,
  previousSignals: ArtifactSignals | null,
  currentSignals: ArtifactSignals,
): IterationDiff {
  const diff: IterationDiff = {
    iteration_number: 1,
    changes_detected: [],
    improvements_made: [],
    issues_fixed: [],
    new_issues: [],
    content_hash_changed: false,
  };

  if (!previousAnalysis || !previousSignals) {
    return diff;
  }

  diff.iteration_number =
    (previousAnalysis as any).iteration_number !== undefined
      ? (previousAnalysis as any).iteration_number + 1
      : 2;

  // Check if content actually changed
  if (
    previousSignals.content_hash &&
    currentSignals.content_hash &&
    previousSignals.content_hash !== currentSignals.content_hash
  ) {
    diff.content_hash_changed = true;
    diff.changes_detected.push("File content was modified");
  } else if (
    previousSignals.content_hash &&
    currentSignals.content_hash &&
    previousSignals.content_hash === currentSignals.content_hash
  ) {
    diff.changes_detected.push(
      "No content changes detected (identical upload)",
    );
    return diff;
  }

  // Detect structural changes
  if (currentSignals.file_count > previousSignals.file_count) {
    diff.changes_detected.push(
      `Added ${currentSignals.file_count - previousSignals.file_count} new files`,
    );
  } else if (currentSignals.file_count < previousSignals.file_count) {
    diff.changes_detected.push(
      `Removed ${previousSignals.file_count - currentSignals.file_count} files`,
    );
  }

  // Detect improvements
  if (!previousSignals.has_tests && currentSignals.has_tests) {
    diff.improvements_made.push("Added tests");
  }
  if (!previousSignals.has_linter && currentSignals.has_linter) {
    diff.improvements_made.push("Added linter configuration");
  }
  if (!previousSignals.has_typescript && currentSignals.has_typescript) {
    diff.improvements_made.push("Migrated to TypeScript");
  }
  if (!previousSignals.has_deploy_config && currentSignals.has_deploy_config) {
    diff.improvements_made.push("Added deployment configuration");
  }

  // Compare tech stack
  const newTech = currentSignals.tech_stack.filter(
    (tech) => !previousSignals.tech_stack.includes(tech),
  );
  if (newTech.length > 0) {
    diff.improvements_made.push(`Added technologies: ${newTech.join(", ")}`);
  }

  // Detect issues addressed
  if (
    previousAnalysis.bugs_or_errors &&
    previousAnalysis.bugs_or_errors.length > 0
  ) {
    const previousIssues = previousAnalysis.bugs_or_errors;
    diff.issues_fixed.push(
      `Attempted to fix ${previousIssues.length} issues from previous iteration`,
    );
  }

  if (
    previousAnalysis.missing_elements &&
    previousAnalysis.missing_elements.length > 0
  ) {
    const previousMissing = previousAnalysis.missing_elements;
    diff.issues_fixed.push(
      `Attempted to address ${previousMissing.length} missing elements`,
    );
  }

  return diff;
}

export type DecisionType = "CONTINUE" | "BACKTRACK" | "PIVOT" | "RESCUE";

export interface SubstepRequirement {
  requirement: string;
  status: "DONE" | "PARTIAL" | "NOT_STARTED";
  evidence: string;
}

export interface ArtifactAnalysis {
  vision: string;
  tech_stack: string[];
  implementation_state: string;
  quality_score: number;
  substep_requirements?: SubstepRequirement[];
  substep_completion_percentage?: number;
  missing_elements: string[];
  bugs_or_errors: string[];
  actual_phase: string;
  decision: DecisionType;
  roadmap_adjustments: {
    phase_id: string;
    action: "complete" | "unlock" | "add_substep" | "update_substep";
    details: string;
  }[];
  next_steps: string[];
  detailed_analysis?: string;
}

/**
 * Read file contents for analysis
 */
async function readFileContents(
  filePath: string,
  maxFiles: number = 20,
): Promise<string> {
  const files: string[] = [];
  let totalSize = 0;
  const MAX_SIZE = 100000; // 100KB max total content

  function walkDir(dir: string) {
    if (files.length >= maxFiles || totalSize >= MAX_SIZE) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (files.length >= maxFiles || totalSize >= MAX_SIZE) break;

        const fullPath = path.join(dir, entry.name);

        // Skip unimportant directories
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "dist" ||
          entry.name === "build" ||
          entry.name === ".next"
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          // Only include source files
          const ext = path.extname(entry.name);
          if (
            [
              ".js",
              ".jsx",
              ".ts",
              ".tsx",
              ".py",
              ".java",
              ".go",
              ".rs",
              ".json",
              ".md",
            ].includes(ext)
          ) {
            try {
              const stat = fs.statSync(fullPath);
              if (stat.size < 50000 && totalSize + stat.size < MAX_SIZE) {
                const content = fs.readFileSync(fullPath, "utf-8");
                files.push(
                  `\n--- ${path.relative(dir, fullPath)} ---\n${content}`,
                );
                totalSize += stat.size;
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  if (fs.statSync(filePath).isDirectory()) {
    walkDir(filePath);
  } else {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      files.push(`\n--- ${path.basename(filePath)} ---\n${content}`);
    } catch {
      // Skip unreadable files
    }
  }

  return files.join("\n\n");
}

/**
 * Analyze artifact with LLM using ARTIFACT_ANALYZER prompt
 */
export async function analyzeArtifactWithLLM(
  filePath: string,
  signals: ArtifactSignals,
  currentProject?: {
    vision_sentence?: string;
    current_phase?: string;
    current_substep?: number;
    roadmap?: any;
    previous_artifact_analyses?: ArtifactAnalysis[];
    previous_signals?: ArtifactSignals[];
  },
): Promise<ArtifactAnalysis> {
  console.log("🤖 [LLM Analyzer] Starting AI-powered artifact analysis...");

  // Read file contents
  const fileContents = await readFileContents(filePath);

  // Detect changes from previous iteration
  const previousAnalysis = currentProject?.previous_artifact_analyses?.length
    ? currentProject.previous_artifact_analyses[
        currentProject.previous_artifact_analyses.length - 1
      ]
    : null;
  const previousSignals = currentProject?.previous_signals?.length
    ? currentProject.previous_signals[
        currentProject.previous_signals.length - 1
      ]
    : null;

  const iterationDiff = detectIterationChanges(
    previousAnalysis,
    previousSignals,
    signals,
  );

  console.log(
    `📊 [LLM Analyzer] Iteration ${iterationDiff.iteration_number} - ${iterationDiff.changes_detected.length} changes detected`,
  );

  // Get current substep details from roadmap
  const currentPhaseData = currentProject?.roadmap?.phases?.find(
    (p: any) => p.phase_id === currentProject?.current_phase,
  );
  const currentSubstep = currentPhaseData?.substeps?.find(
    (s: any) => s.step_number === currentProject?.current_substep,
  );

  const substepContext =
    currentSubstep && currentPhaseData
      ? `
**Current Substep:**
- Phase: ${currentPhaseData.goal}
- Substep ${currentSubstep.step_number}: ${currentSubstep.label}
- What you're working on: ${currentSubstep.prompt_to_send?.substring(0, 200)}...
`
      : "";

  // Build iteration history with diff awareness
  const previousAnalyses = currentProject?.previous_artifact_analyses || [];
  const iterationHistory =
    previousAnalyses.length > 0
      ? `
**Previous Iterations on This Substep:**
${previousAnalyses
  .map(
    (prev, idx) => `
Iteration ${idx + 1}:
- Quality: ${prev.quality_score}/10
- What was working: ${prev.implementation_state || "N/A"}
- Issues found: ${prev.bugs_or_errors?.join(", ") || "None"}
- Missing: ${prev.missing_elements?.join(", ") || "None"}
${idx === previousAnalyses.length - 1 && prev.detailed_analysis ? "\n**MOST RECENT FEEDBACK (what they need to fix):**\n" + prev.detailed_analysis : ""}
`,
  )
  .join("\n")}

**This is Iteration ${iterationDiff.iteration_number}**

**DETECTED CHANGES IN THIS UPLOAD:**
${
  iterationDiff.content_hash_changed
    ? `
✅ Content Changed: ${iterationDiff.changes_detected.join(", ")}
${iterationDiff.improvements_made.length > 0 ? `✨ Improvements: ${iterationDiff.improvements_made.join(", ")}` : ""}
${iterationDiff.issues_fixed.length > 0 ? `🔧 Attempted Fixes: ${iterationDiff.issues_fixed.join(", ")}` : ""}
`
    : `
⚠️ WARNING: Content hash identical to previous upload - no changes detected!
Make sure you uploaded the CORRECTED version, not the same file.
`
}

CRITICAL: Compare the NEW uploaded work against iteration ${previousAnalyses.length}'s feedback.
- What did they ACTUALLY FIX from last time? (verify fixes are real, not just claimed)
- What issues STILL remain?
- Did they add NEW problems?
- If no content changed, point this out immediately

Start your detailed_analysis with: "Since iteration ${previousAnalyses.length}, you've [what actually changed based on content hash]..."
`
      : "\n**This is Iteration 1** - first upload for this substep. Give comprehensive initial feedback.\n";

  // Determine artifact type context
  const artifactTypeContext =
    signals.artifact_type === "code"
      ? "This is CODE. Focus on: architecture, tests, error handling, deployment readiness."
      : signals.artifact_type === "document"
        ? "This is a DOCUMENT (PDF/Word). Focus on: structure, clarity, completeness, professionalism."
        : signals.artifact_type === "design"
          ? "This is DESIGN work (images/mockups). Focus on: visual hierarchy, branding, user experience, accessibility."
          : signals.artifact_type === "plan"
            ? "This is a BUSINESS PLAN or STRATEGY. Focus on: market analysis, revenue model, competitive advantage, feasibility."
            : signals.artifact_type === "content"
              ? "This is CONTENT (writing/documentation). Focus on: messaging, tone, structure, call-to-action."
              : "This work type is UNCLEAR. Identify what it is first, then provide appropriate feedback.";

  // Build the artifact analyzer prompt
  const prompt = `You are a Master Builder reviewing an apprentice's work. You have 20+ years of experience and you don't just grade—you CORRECT, IMPROVE, and CARRY THE PROJECT FORWARD.

**Project Context:**
- Vision: ${currentProject?.vision_sentence || "Not provided"}
- Current phase: ${currentProject?.current_phase || "P0"}
- **Artifact Type:** ${signals.artifact_type.toUpperCase()} (${artifactTypeContext})
${substepContext}
${iterationHistory}

**Uploaded Work:**
${fileContents}

**Your Role as Master Builder:**

You are NOT a grader. You are a senior expert who:
1. **Reviews** what they built FOR THIS SPECIFIC SUBSTEP
2. **Identifies** what's working and what needs correction
3. **Corrects** mistakes and provides improved versions
4. **Moves forward** with clear next actions
5. **Adapts** to the type of work (code, business plan, content, design, etc.)

**Your Task:**
1. Review their work with an expert eye SPECIFIC TO THE SUBSTEP
2. Identify what's solid vs what needs correction
3. Generate specific improvements (text, structure, code, design—whatever matches the work type)
4. Provide clear "here's your improved version" feedback
5. Define the immediate next action to maintain momentum

**Critical Rules:**
- **CONTEXT MATTERS**: If this is a business plan, don't talk about tests. If it's a landing page, focus on copy and design, not databases.
- Be encouraging but CORRECTIVE: "Good progress, but let me fix these 3 issues..."
- Provide SPECIFIC corrections tailored to the work type
- Generate IMPROVED versions when issues are found
- Focus on FORWARD MOMENTUM—what's the next concrete action for THIS substep?
- Quality score reflects current state (be honest but constructive)
- If this is iteration 2+, acknowledge previous feedback and show what improved

**SUBSTEP COMPLETION TRACKING:**
Extract the requirements from the current substep description and mark each:
- DONE: Fully implemented with evidence
- PARTIAL: Started but incomplete
- NOT_STARTED: Missing entirely

This determines auto-completion: 100% = substep auto-completes, <100% = iteration continues.

**Return ONLY valid JSON in this exact format:**
{
  "vision": "What this project is building",
  "tech_stack": ["Only if this is a technical substep, otherwise empty array"],
  "implementation_state": "What's currently complete for THIS substep",
  "quality_score": 6.5,
  "substep_requirements": [
    {
      "requirement": "Create brand color palette",
      "status": "DONE",
      "evidence": "User provided 3 colors with hex codes in the document"
    },
    {
      "requirement": "Define brand voice",
      "status": "PARTIAL",
      "evidence": "Mentioned 'friendly' but lacks detail and examples"
    },
    {
      "requirement": "Write mission statement",
      "status": "NOT_STARTED",
      "evidence": "No mission statement found in uploaded work"
    }
  ],
  "substep_completion_percentage": 33,
  "detailed_analysis": "Iteration-aware feedback. If iteration 2+: 'Since iteration X, you've fixed Y. Z still needs work.' Context-specific corrections.",
  "missing_elements": ["Specific to THIS substep's requirements"],
  "bugs_or_errors": ["Issues WITH fixes, specific to the work type"],
  "actual_phase": "P2",
  "decision": "CONTINUE",
  "roadmap_adjustments": [
    {
      "phase_id": "P1",
      "action": "complete",
      "details": "Context-specific achievement description"
    }
  ],
  "next_steps": [
    "Fix the 'brand voice' by adding 3 example sentences in this tone",
    "Write a mission statement: 'We help [audience] achieve [outcome] by [method]'",
    "Upload revised version - when all requirements show DONE, substep auto-completes"
  ]
}

**Tone Guide:**
- Detailed_analysis: Master builder voice adapted to work type. For business plan: "Strong market analysis, but your pricing model needs adjustment..." For code: "Solid API structure, but missing error handling..." For content: "Compelling narrative, but the call-to-action is weak..."
- Next_steps: Concrete actions specific to THIS substep. Not generic advice.
- Missing_elements: Only what's needed to complete THIS substep
- Bugs_or_errors: Include the FIX specific to the work type`;

  try {
    const result = await runModel([
      {
        role: "system",
        content:
          "You are a senior project analyst. Return ONLY valid JSON. No markdown, no explanations, just the JSON object.",
      },
      {
        role: "user",
        content: prompt,
      },
    ]);

    // Parse the JSON response
    let jsonText = result.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }

    const analysis: ArtifactAnalysis = JSON.parse(jsonText);

    console.log("✅ [LLM Analyzer] Analysis complete:");
    console.log(`   Decision: ${analysis.decision}`);
    console.log(`   Actual Phase: ${analysis.actual_phase}`);
    console.log(`   Quality Score: ${analysis.quality_score}/10`);

    return analysis;
  } catch (error) {
    console.error("❌ [LLM Analyzer] Analysis failed:", error);

    // Return safe default analysis
    return {
      vision: "Unable to determine from artifact",
      tech_stack: signals.tech_stack,
      implementation_state: "Analysis failed - using static signals only",
      quality_score: 5.0,
      missing_elements: ["LLM analysis failed"],
      bugs_or_errors: [],
      actual_phase: currentProject?.current_phase || "P0",
      decision: "CONTINUE",
      roadmap_adjustments: [],
      next_steps: ["Re-upload artifact or continue manually"],
    };
  }
}
