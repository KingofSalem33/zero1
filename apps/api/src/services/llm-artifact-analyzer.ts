/**
 * LLM-Powered Artifact Analyzer
 * Combines static analysis with AI-powered project reconstruction
 */

import { runModel } from "../ai/runModel";
import type { ArtifactSignals } from "./artifact-analyzer";
import * as fs from "fs";
import * as path from "path";

export type DecisionType = "CONTINUE" | "BACKTRACK" | "PIVOT" | "RESCUE";

export interface ArtifactAnalysis {
  vision: string;
  tech_stack: string[];
  implementation_state: string;
  quality_score: number;
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
}

/**
 * Read file contents for analysis
 */
async function readFileContents(filePath: string, maxFiles: number = 20): Promise<string> {
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
                files.push(`\n--- ${path.relative(dir, fullPath)} ---\n${content}`);
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
    roadmap?: unknown;
  }
): Promise<ArtifactAnalysis> {
  console.log("🤖 [LLM Analyzer] Starting AI-powered artifact analysis...");

  // Read file contents
  const fileContents = await readFileContents(filePath);

  // Build the artifact analyzer prompt
  const prompt = `You are a Senior Project Archaeologist with 20+ years reconstructing project state from artifacts. You have been given an uploaded file that represents current progress on a user's project.

**User Context:**
- Vision sentence: ${currentProject?.vision_sentence || "Not provided"}
- Current phase shown in UI: ${currentProject?.current_phase || "P0"}
- Current roadmap: ${JSON.stringify(currentProject?.roadmap || {}, null, 2)}

**Static Analysis Signals:**
- Has tests: ${signals.has_tests}
- Has linter: ${signals.has_linter}
- Has TypeScript: ${signals.has_typescript}
- Git commits: ${signals.commit_count}
- Tech stack: ${signals.tech_stack.join(", ") || "None detected"}
- File count: ${signals.file_count}
- Has documentation: ${signals.has_documentation}

**Uploaded File Contents:**
${fileContents}

**Your Task:**
Analyze the uploaded artifact as the source of truth. Determine the actual project state, identify completed work, find gaps or errors, and surgically adjust the roadmap to continue from the correct point.

Execute these steps sequentially:

### Step 1: Artifact Analysis
Examine the uploaded file and extract:
- **Vision/Purpose:** What is this project trying to achieve?
- **Tech Stack:** What languages, frameworks, databases are being used?
- **Implementation State:** What features/components are built and working?
- **Quality Indicators:** Are there tests? Is code well-structured? Any bugs?
- **Missing Elements:** What's incomplete or broken?

### Step 2: Reality vs. Roadmap Comparison
Compare artifact reality with the current roadmap:
- **Actual Phase Completed:** Based on the code, which phase (P0-P7) is truly complete?
- **Work Ahead of Roadmap:** Is the user farther along than the UI shows?
- **Work Behind Roadmap:** Is critical functionality missing?
- **Misalignment:** Does the code contradict the stated vision?

### Step 3: Decision Matrix
Choose ONE decision based on the comparison:

- **CONTINUE** ✅
  - Artifact matches roadmap perfectly
  - No conflicts, all substeps align
  - Action: Keep current roadmap, mark completed substeps as done

- **BACKTRACK** ⏪
  - User jumped ahead but skipped critical foundation
  - Code exists but lacks tests/structure/essentials
  - Action: Roll back to incomplete phase, add missing substeps

- **PIVOT** 🔄
  - Artifact reveals a DIFFERENT valid approach than roadmap
  - Not wrong, just different direction
  - Action: Regenerate roadmap to match artifact's direction

- **RESCUE** 🚨
  - Critical bugs, security issues, or broken fundamentals
  - Project cannot proceed without fixes
  - Action: Insert emergency fix phase BEFORE continuing

### Step 4: Roadmap Adjustments
Based on your decision, specify EXACT changes:
- Which phases to mark complete
- Which substeps to unlock/add/update
- What new substeps are needed
- Where to position the user next

**Return ONLY valid JSON in this exact format:**
{
  "vision": "Clear statement of what this project is trying to achieve",
  "tech_stack": ["react", "typescript", "express"],
  "implementation_state": "Brief summary of what's built and working",
  "quality_score": 7.5,
  "missing_elements": ["tests for auth", "error handling in API"],
  "bugs_or_errors": ["Auth token not validated", "SQL injection in search"],
  "actual_phase": "P2",
  "decision": "CONTINUE",
  "roadmap_adjustments": [
    {
      "phase_id": "P1",
      "action": "complete",
      "details": "Environment setup is fully complete based on artifact"
    }
  ],
  "next_steps": ["Add tests for authentication", "Implement error handling"]
}`;

  try {
    const result = await runModel(
      [
        {
          role: "system",
          content:
            "You are a senior project analyst. Return ONLY valid JSON. No markdown, no explanations, just the JSON object.",
        },
        {
          role: "user",
          content: prompt,
        },
      ]
    );

    // Parse the JSON response
    let jsonText = result.text.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
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
