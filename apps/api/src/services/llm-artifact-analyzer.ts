/**
 * LLM-Powered Artifact Analyzer
 * Combines static analysis with AI-powered project reconstruction
 */

import { runModel } from "../ai/runModel";
import type { ArtifactSignals } from "./artifact-analyzer";
import {
  buildIterationContext,
  generateIterationSummary,
  detectStuckState,
} from "./iteration-context-builder";
import * as fs from "fs";
import * as path from "path";
import { z } from "zod";

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
 * Zod schema for robust validation of LLM analysis responses
 */
const ArtifactAnalysisSchema = z.object({
  vision: z.string().min(1, "Vision cannot be empty"),
  tech_stack: z.array(z.string()).default([]),
  implementation_state: z
    .string()
    .min(1, "Implementation state cannot be empty"),
  quality_score: z.number().min(0).max(10),
  substep_requirements: z
    .array(
      z.object({
        requirement: z.string().min(1),
        status: z.enum(["DONE", "PARTIAL", "NOT_STARTED"]),
        evidence: z.string().min(1),
      }),
    )
    .optional(),
  substep_completion_percentage: z.number().min(0).max(100).optional(),
  missing_elements: z.array(z.string()).default([]),
  bugs_or_errors: z.array(z.string()).default([]),
  actual_phase: z
    .string()
    .regex(/^P\d+$/, "Phase must be in format P1, P2, etc."),
  decision: z.enum(["CONTINUE", "BACKTRACK", "PIVOT", "RESCUE"]),
  roadmap_adjustments: z
    .array(
      z.object({
        phase_id: z.string(),
        action: z.enum(["complete", "unlock", "add_substep", "update_substep"]),
        details: z.string(),
      }),
    )
    .default([]),
  next_steps: z
    .array(z.string().min(1))
    .min(1, "At least one next step required"),
  detailed_analysis: z.string().optional(),
});

/**
 * Attempt to fix common schema validation issues automatically
 */
function attemptSchemaFix(rawAnalysis: any, _error: z.ZodError): any {
  const fixed = { ...rawAnalysis };

  // Fix 1: Ensure required arrays exist
  if (!Array.isArray(fixed.tech_stack)) {
    fixed.tech_stack = [];
  }
  if (!Array.isArray(fixed.missing_elements)) {
    fixed.missing_elements = [];
  }
  if (!Array.isArray(fixed.bugs_or_errors)) {
    fixed.bugs_or_errors = [];
  }
  if (!Array.isArray(fixed.roadmap_adjustments)) {
    fixed.roadmap_adjustments = [];
  }
  if (!Array.isArray(fixed.next_steps)) {
    fixed.next_steps = ["Continue working on current substep"];
  }

  // Fix 2: Ensure quality_score is a number between 0-10
  if (typeof fixed.quality_score !== "number" || isNaN(fixed.quality_score)) {
    fixed.quality_score = 5.0;
  } else if (fixed.quality_score < 0) {
    fixed.quality_score = 0;
  } else if (fixed.quality_score > 10) {
    fixed.quality_score = 10;
  }

  // Fix 3: Ensure substep_completion_percentage is valid
  if (fixed.substep_completion_percentage !== undefined) {
    if (
      typeof fixed.substep_completion_percentage !== "number" ||
      isNaN(fixed.substep_completion_percentage)
    ) {
      fixed.substep_completion_percentage = 0;
    } else if (fixed.substep_completion_percentage < 0) {
      fixed.substep_completion_percentage = 0;
    } else if (fixed.substep_completion_percentage > 100) {
      fixed.substep_completion_percentage = 100;
    }
  }

  // Fix 4: Ensure actual_phase follows P# format
  if (
    typeof fixed.actual_phase === "string" &&
    !fixed.actual_phase.match(/^P\d+$/)
  ) {
    // Try to extract phase number
    const match = fixed.actual_phase.match(/\d+/);
    if (match) {
      fixed.actual_phase = `P${match[0]}`;
    } else {
      fixed.actual_phase = "P1";
    }
  } else if (!fixed.actual_phase) {
    fixed.actual_phase = "P1";
  }

  // Fix 5: Ensure decision is valid enum value
  const validDecisions = ["CONTINUE", "BACKTRACK", "PIVOT", "RESCUE"];
  if (!validDecisions.includes(fixed.decision)) {
    fixed.decision = "CONTINUE";
  }

  // Fix 6: Ensure substep_requirements have valid status
  if (Array.isArray(fixed.substep_requirements)) {
    fixed.substep_requirements = fixed.substep_requirements.map((req: any) => ({
      requirement: String(req.requirement || "Unknown requirement"),
      status: ["DONE", "PARTIAL", "NOT_STARTED"].includes(req.status)
        ? req.status
        : "NOT_STARTED",
      evidence: String(req.evidence || "No evidence provided"),
    }));
  }

  // Fix 7: Ensure required string fields exist
  if (!fixed.vision || typeof fixed.vision !== "string") {
    fixed.vision = "Unable to determine vision from artifact";
  }
  if (
    !fixed.implementation_state ||
    typeof fixed.implementation_state !== "string"
  ) {
    fixed.implementation_state = "Analysis incomplete";
  }

  return fixed;
}

/**
 * Smart file selection prioritization
 */
interface FileCandidate {
  path: string;
  size: number;
  priority: number; // Higher = more important
  content?: string;
}

function calculateFilePriority(filePath: string, size: number): number {
  const filename = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  let priority = 50; // Base priority

  // HIGH PRIORITY: Configuration and entry points
  if (
    ["package.json", "tsconfig.json", "readme.md", ".env.example"].includes(
      filename,
    )
  ) {
    priority += 100;
  } else if (
    filename.startsWith("index.") ||
    filename.startsWith("main.") ||
    filename.startsWith("app.")
  ) {
    priority += 80;
  } else if (ext === ".md" && size < 10000) {
    priority += 60; // Documentation is important
  }

  // MEDIUM PRIORITY: Source code
  else if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    priority += 40;
  } else if ([".py", ".java", ".go", ".rs", ".cpp", ".c"].includes(ext)) {
    priority += 40;
  }

  // LOWER PRIORITY: Tests and configs
  else if (filename.includes("test") || filename.includes("spec")) {
    priority += 20;
  } else if ([".json", ".yaml", ".yml", ".toml"].includes(ext)) {
    priority += 15;
  }

  // Penalize very large files (they might be generated)
  if (size > 50000) {
    priority -= 30;
  } else if (size > 100000) {
    priority -= 60;
  }

  return priority;
}

/**
 * Read file contents for analysis with smart prioritization
 */
async function readFileContents(
  filePath: string,
  maxFiles: number = 40, // Increased from 20
): Promise<string> {
  const candidates: FileCandidate[] = [];
  let totalSize = 0;
  const MAX_SIZE = 250000; // Increased from 100KB to 250KB max total content

  function walkDir(dir: string, basePath: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
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
          walkDir(fullPath, basePath);
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
              ".yaml",
              ".yml",
              ".toml",
            ].includes(ext)
          ) {
            try {
              const stat = fs.statSync(fullPath);
              // Include files up to 200KB (will be filtered by priority later)
              if (stat.size < 200000) {
                const priority = calculateFilePriority(fullPath, stat.size);
                candidates.push({
                  path: fullPath,
                  size: stat.size,
                  priority,
                });
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

  // Collect file candidates
  if (fs.statSync(filePath).isDirectory()) {
    walkDir(filePath, filePath);
  } else {
    try {
      const stat = fs.statSync(filePath);
      candidates.push({
        path: filePath,
        size: stat.size,
        priority: 100, // Single file uploads are always high priority
      });
    } catch {
      // Skip unreadable files
    }
  }

  // Sort candidates by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  console.log(
    `📊 [LLM Analyzer] Found ${candidates.length} file candidates, selecting top ${maxFiles} by priority`,
  );

  // Select top files by priority, respecting size limits
  const selectedFiles: string[] = [];
  let selectedCount = 0;

  for (const candidate of candidates) {
    if (selectedCount >= maxFiles || totalSize >= MAX_SIZE) break;

    try {
      const content = fs.readFileSync(candidate.path, "utf-8");
      const relativePath = fs.statSync(filePath).isDirectory()
        ? path.relative(filePath, candidate.path)
        : path.basename(candidate.path);

      selectedFiles.push(
        `\n--- ${relativePath} (priority: ${candidate.priority}) ---\n${content}`,
      );
      totalSize += candidate.size;
      selectedCount++;
    } catch {
      // Skip unreadable files
    }
  }

  console.log(
    `✅ [LLM Analyzer] Selected ${selectedCount} files (${(totalSize / 1024).toFixed(1)}KB total)`,
  );

  return selectedFiles.join("\n\n");
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

  // Get current substep details from roadmap (dynamically generated)
  const currentPhaseData = currentProject?.roadmap?.phases?.find(
    (p: any) => p.phase_id === currentProject?.current_phase,
  );
  const currentSubstep = currentPhaseData?.substeps?.find(
    (s: any) => s.step_number === currentProject?.current_substep,
  );

  const substepContext =
    currentSubstep && currentPhaseData
      ? `
**Current Substep (Dynamically Generated for This Project):**
- Phase ${currentProject?.current_phase}: ${currentPhaseData.goal}
- Substep ${currentSubstep.step_number}: ${currentSubstep.label}
- Expert guidance for this substep: ${currentSubstep.prompt_to_send?.substring(0, 300)}...

This substep was custom-generated by AI specifically for "${currentProject?.vision_sentence || "this project"}".
Focus your analysis on the EXACT requirements in the substep prompt above.
`
      : "";

  // Build CUMULATIVE iteration context with full memory
  const previousArtifactsWithData =
    currentProject?.previous_artifact_analyses?.map((analysis, idx) => ({
      analysis,
      content_hash: currentProject?.previous_signals?.[idx]?.content_hash || "",
      uploaded_at: new Date().toISOString(),
    })) || [];

  const iterationContext = currentSubstep
    ? buildIterationContext(previousArtifactsWithData, currentSubstep)
    : null;

  const iterationHistory = iterationContext
    ? generateIterationSummary(iterationContext)
    : "\n**This is Iteration 1** - first upload for this substep. Give comprehensive initial feedback.\n";

  // Check if user is stuck
  const stuckState = iterationContext
    ? detectStuckState(iterationContext)
    : { is_stuck: false, reason: "", guidance: [] };

  if (stuckState.is_stuck) {
    console.log(`⚠️ [LLM Analyzer] User appears stuck: ${stuckState.reason}`);
  }

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

**IMPORTANT: This project uses DYNAMICALLY GENERATED roadmaps.**
Every phase, substep, and expert prompt was custom-created by AI specifically for this user's vision.
Your feedback must align with the EXACT requirements in the current substep (see below).

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
- **CUMULATIVE MEMORY**: Never repeat feedback for things already fixed! Review the "Previously Addressed" list.
- **ACKNOWLEDGE PROGRESS**: If iteration 2+, start with "Since iteration X, you've fixed Y..."
- Be encouraging but CORRECTIVE: "Good progress, but let me fix these 3 issues..."
- Provide SPECIFIC corrections tailored to the work type
- Generate IMPROVED versions when issues are found
- Focus on FORWARD MOMENTUM—what's the next concrete action for THIS substep?
- Quality score reflects current state (be honest but constructive)
${stuckState.is_stuck ? `\n⚠️ **USER APPEARS STUCK**: ${stuckState.reason}\nProvide extra guidance: ${stuckState.guidance.join(", ")}` : ""}

**SUBSTEP COMPLETION TRACKING (CRITICAL):**

You MUST extract ALL requirements from the substep prompt above. Do a DEEP parse:

1. **Read the substep prompt carefully** - It contains expert guidance with specific tasks
2. **Break down each task** - If it says "set up X, Y, and Z", that's 3 requirements
3. **Look for implicit requirements** - If it says "professional setup", extract what that means (e.g., linting, testing, documentation)
4. **Check uploaded work against each requirement** - Don't guess, look for actual evidence in the files

Example of DEEP extraction:

Substep prompt says: "Set up a professional Node.js development environment with TypeScript, ESLint, and a Git repository."

SHALLOW extraction (❌ BAD):
- "Set up development environment" - PARTIAL

DEEP extraction (✅ GOOD):
- "Install Node.js and verify version" - DONE (package.json shows node 18)
- "Configure TypeScript with tsconfig.json" - DONE (tsconfig.json present and configured)
- "Set up ESLint with rules" - NOT_STARTED (no .eslintrc found)
- "Initialize Git repository" - DONE (.git folder present with 5 commits)

Mark each requirement:
- DONE: Fully implemented with specific evidence from uploaded files
- PARTIAL: Started but incomplete (explain what's missing)
- NOT_STARTED: Missing entirely

The substep requirements will vary by project type:
- Code projects: Break down tech setup, architecture, tests, deployment
- Business projects: Break down market analysis, financials, strategy docs
- Content projects: Break down messaging, design, copy, CTAs

**Completion percentage = (DONE count / total requirements) × 100**

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

    // Parse and validate the JSON response
    let jsonText = result.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }

    // Parse JSON
    let rawAnalysis: any;
    try {
      rawAnalysis = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("❌ [LLM Analyzer] JSON parsing failed:", parseError);
      console.error("Raw response:", jsonText.substring(0, 500));
      throw new Error(
        `Invalid JSON response from LLM: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
      );
    }

    // Validate against schema
    const validationResult = ArtifactAnalysisSchema.safeParse(rawAnalysis);

    if (!validationResult.success) {
      console.error("❌ [LLM Analyzer] Schema validation failed:");
      console.error(JSON.stringify(validationResult.error.format(), null, 2));

      // Try to fix common issues automatically
      const fixedAnalysis = attemptSchemaFix(
        rawAnalysis,
        validationResult.error,
      );
      const retryValidation = ArtifactAnalysisSchema.safeParse(fixedAnalysis);

      if (retryValidation.success) {
        console.log("✅ [LLM Analyzer] Schema auto-fixed successfully");
        const analysis = retryValidation.data;
        console.log("✅ [LLM Analyzer] Analysis complete:");
        console.log(`   Decision: ${analysis.decision}`);
        console.log(`   Actual Phase: ${analysis.actual_phase}`);
        console.log(`   Quality Score: ${analysis.quality_score}/10`);
        return analysis;
      }

      throw new Error(
        `Schema validation failed: ${JSON.stringify(validationResult.error.issues)}`,
      );
    }

    const analysis = validationResult.data;

    console.log("✅ [LLM Analyzer] Analysis complete:");
    console.log(`   Decision: ${analysis.decision}`);
    console.log(`   Actual Phase: ${analysis.actual_phase}`);
    console.log(`   Quality Score: ${analysis.quality_score}/10`);

    return analysis;
  } catch (error) {
    console.error("❌ [LLM Analyzer] Analysis failed:", error);
    console.error(
      "Error details:",
      error instanceof Error ? error.message : "Unknown error",
    );

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
