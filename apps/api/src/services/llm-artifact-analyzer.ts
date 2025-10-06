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
  },
): Promise<ArtifactAnalysis> {
  console.log("🤖 [LLM Analyzer] Starting AI-powered artifact analysis...");

  // Read file contents
  const fileContents = await readFileContents(filePath);

  // Get current substep details from roadmap
  const currentPhaseData = currentProject?.roadmap?.phases?.find(
    (p: any) => p.phase_id === currentProject.current_phase,
  );
  const currentSubstep = currentPhaseData?.substeps?.find(
    (s: any) => s.step_number === currentProject.current_substep,
  );

  const substepContext = currentSubstep
    ? `
**Current Substep:**
- Phase: ${currentPhaseData.goal}
- Substep ${currentSubstep.step_number}: ${currentSubstep.label}
- What you're working on: ${currentSubstep.prompt_to_send?.substring(0, 200)}...
`
    : "";

  // Build iteration history if there are previous analyses for this substep
  const iterationHistory = currentProject?.previous_artifact_analyses?.length
    ? `
**Previous Iterations on This Substep:**
${currentProject.previous_artifact_analyses
  .map(
    (prev, idx) => `
Iteration ${idx + 1}:
- Quality: ${prev.quality_score}/10
- Feedback: ${prev.detailed_analysis}
- Issues addressed: ${prev.bugs_or_errors?.join(", ") || "None"}
`,
  )
  .join("\n")}

**This is Iteration ${(currentProject.previous_artifact_analyses.length || 0) + 1}** - build on the previous feedback, don't repeat it.
`
    : "\n**This is Iteration 1** - first upload for this substep.\n";

  // Build the artifact analyzer prompt
  const prompt = `You are a Master Builder reviewing an apprentice's work. You have 20+ years of experience and you don't just grade—you CORRECT, IMPROVE, and CARRY THE PROJECT FORWARD.

**Project Context:**
- Vision: ${currentProject?.vision_sentence || "Not provided"}
- Current phase: ${currentProject?.current_phase || "P0"}
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

**Return ONLY valid JSON in this exact format:**
{
  "vision": "What this project is building",
  "tech_stack": ["Only if this is a technical substep, otherwise empty array"],
  "implementation_state": "What's currently complete for THIS substep",
  "quality_score": 6.5,
  "detailed_analysis": "Iteration-aware feedback. If iteration 2+: 'Great improvement from last time—you addressed [previous issues]. Now I'm refining [new issues].' Context-specific corrections for the work type.",
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
    "Concrete action 1 for THIS substep",
    "Concrete action 2 for THIS substep",
    "When complete, upload your revised version for final review"
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
