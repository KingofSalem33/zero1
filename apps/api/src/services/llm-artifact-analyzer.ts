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
    roadmap?: unknown;
  },
): Promise<ArtifactAnalysis> {
  console.log("🤖 [LLM Analyzer] Starting AI-powered artifact analysis...");

  // Read file contents
  const fileContents = await readFileContents(filePath);

  // Build the artifact analyzer prompt
  const prompt = `You are a Master Builder reviewing an apprentice's work. You have 20+ years of experience and you don't just grade—you CORRECT, IMPROVE, and CARRY THE PROJECT FORWARD.

**Project Context:**
- Vision: ${currentProject?.vision_sentence || "Not provided"}
- Current phase: ${currentProject?.current_phase || "P0"}
- Current roadmap: ${JSON.stringify(currentProject?.roadmap || {}, null, 2)}

**Technical Signals:**
- Tests: ${signals.has_tests} | Linter: ${signals.has_linter} | TypeScript: ${signals.has_typescript}
- Git commits: ${signals.commit_count} | Files: ${signals.file_count}
- Stack: ${signals.tech_stack.join(", ") || "None detected"}

**Uploaded Work:**
${fileContents}

**Your Role as Master Builder:**

You are NOT a grader. You are a senior expert who:
1. **Reviews** what they built
2. **Identifies** what's working and what's broken
3. **Corrects** mistakes and improves the code
4. **Provides** the corrected version for them to use
5. **Moves forward** with clear next actions

Think like this:
- "Good start on the auth system, but you're missing token validation. Here's the corrected version with secure JWT validation..."
- "I see you're building the database schema. You forgot the foreign key constraints—here's the fixed version..."
- "Your API works but has 3 security holes. I'm patching them now. Here's what I fixed..."

**Your Task:**
1. Review their work with an expert eye
2. Identify what's solid vs what needs correction
3. Generate specific improvements or fixes
4. Provide clear "here's your improved version" feedback
5. Define the immediate next step to maintain momentum

**Critical Rules:**
- Be encouraging but CORRECTIVE ("Good progress, but let me fix these 3 issues...")
- Provide SPECIFIC corrections ("Change line 47 to..." or "Add this validation...")
- Generate IMPROVED code/content when bugs are found
- Focus on FORWARD MOMENTUM—what's the next concrete action?
- Quality score reflects current state (be honest but constructive)

**Return ONLY valid JSON in this exact format:**
{
  "vision": "What this project is building",
  "tech_stack": ["react", "node", "postgres"],
  "implementation_state": "What's currently working",
  "quality_score": 6.5,
  "detailed_analysis": "You've built a solid foundation for [feature]. I see [specific achievements]. However, I'm correcting 3 issues: [list]. Here's what I improved: [specifics]. This brings your implementation to production-ready quality.",
  "missing_elements": ["Specific items needed"],
  "bugs_or_errors": ["Specific bugs I found and HOW to fix them"],
  "actual_phase": "P2",
  "decision": "CONTINUE",
  "roadmap_adjustments": [
    {
      "phase_id": "P1",
      "action": "complete",
      "details": "Strong environment setup with [specifics]"
    }
  ],
  "next_steps": [
    "Take the corrected authentication code I provided and replace your current version",
    "Add the 3 error handlers I specified to your API routes",
    "Test the updated flow with the validation checklist below"
  ]
}

**Tone Guide:**
- Detailed_analysis: This is your master builder voice. "Excellent work on X. I've corrected Y by doing Z. Here's your improved version..."
- Next_steps: Concrete, copy-paste-ready actions. "Replace lines 23-45 with..." or "Add this test file..."
- Missing_elements: Not vague—be specific about what to add
- Bugs_or_errors: Include the FIX, not just the problem`;

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
