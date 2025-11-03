/**
 * V2 Artifact Analyzer
 *
 * Momentum-focused artifact analysis for V2 dynamic roadmap projects.
 * Analyzes uploaded files against current step's acceptance criteria.
 */

import * as fs from "fs";
import * as path from "path";
import { makeOpenAI } from "../ai";
import { ENV } from "../env";

export interface ArtifactAnalysisRequest {
  filePath: string;
  fileName: string;
  projectId: string;
  currentStep: {
    step_number: number;
    title: string;
    description: string;
    acceptance_criteria: string[];
  };
}

export interface ArtifactAnalysisResult {
  quality_score: number; // 0-100
  satisfied_criteria: string[];
  partial_criteria: string[];
  missing_criteria: string[];
  tech_stack: string[];
  file_count: number;
  has_tests: boolean;
  feedback: string; // User-facing feedback
  suggest_completion: boolean;
  confidence: number; // 0-100
}

/**
 * Analyze uploaded artifact against current step criteria
 */
export async function analyzeArtifact(
  request: ArtifactAnalysisRequest,
): Promise<ArtifactAnalysisResult> {
  console.log(
    `[ArtifactAnalyzer] Analyzing ${request.fileName} for step ${request.currentStep.step_number}`,
  );

  try {
    // Read file content (or folder structure)
    const content = await readArtifactContent(
      request.filePath,
      request.fileName,
    );

    // Use LLM to analyze against acceptance criteria
    const client = makeOpenAI();
    if (!client) {
      console.warn(
        "[ArtifactAnalyzer] AI not configured, using basic analysis",
      );
      return basicAnalysis(content, request.currentStep);
    }

    const systemPrompt = buildAnalysisPrompt(request.currentStep, content);

    const result = await client.responses.create({
      model: ENV.OPENAI_MODEL_NAME,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            "Analyze this artifact against the step criteria. Be encouraging and momentum-focused.",
        },
      ],
      temperature: 0.4,
      max_output_tokens: 2000,
      text: {
        format: {
          type: "json_schema" as const,
          name: "artifact_analysis",
          schema: getAnalysisSchema(),
        },
        verbosity: "medium",
      },
    });

    const assistantMessage = result.output.find(
      (item: any) => item.type === "message" && item.role === "assistant",
    ) as any;

    if (!assistantMessage) {
      throw new Error("No assistant message in response");
    }

    const responseText = assistantMessage.content.find(
      (c: any) => c.type === "text",
    )?.text;

    if (!responseText) {
      throw new Error("No text content in assistant message");
    }

    const analysis = JSON.parse(responseText);

    return {
      quality_score: analysis.quality_score,
      satisfied_criteria: analysis.satisfied_criteria || [],
      partial_criteria: analysis.partial_criteria || [],
      missing_criteria: analysis.missing_criteria || [],
      tech_stack: analysis.tech_stack || [],
      file_count: content.file_count,
      has_tests: analysis.has_tests || false,
      feedback: analysis.feedback,
      suggest_completion: analysis.suggest_completion,
      confidence: analysis.confidence,
    };
  } catch (error) {
    console.error("[ArtifactAnalyzer] Error analyzing artifact:", error);
    return basicAnalysis(
      await readArtifactContent(request.filePath, request.fileName),
      request.currentStep,
    );
  }
}

/**
 * Build LLM analysis prompt (momentum-focused like StepCompletionService)
 */
function buildAnalysisPrompt(
  step: { title: string; description: string; acceptance_criteria: string[] },
  content: { preview: string; file_count: number; is_code: boolean },
): string {
  return `You are a supportive senior developer reviewing a builder's work.

**CURRENT STEP:**
${step.title}
${step.description}

**ACCEPTANCE CRITERIA:**
${step.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

**UPLOADED ARTIFACT:**
Files: ${content.file_count}
Type: ${content.is_code ? "Code/Project" : "Document"}

Content Preview:
${content.preview}

---

**YOUR MINDSET: MOMENTUM-FOCUSED COACH**

You're here to recognize GOOD ENOUGH work, not demand perfection.

**EVALUATION RULES:**

**SATISFIED** = Criterion is addressed, even if rough/incomplete
- Has the code/structure → SATISFIED
- Outlined but needs refinement → SATISFIED
- Working but could be better → SATISFIED

**PARTIAL** = Attempted but clearly incomplete
- Started but missing major pieces → PARTIAL
- Rough draft without key elements → PARTIAL

**MISSING** = Not addressed at all
- No evidence of attempting this → MISSING

**QUALITY SCORING (be generous):**
- 80-100: Strong work, definitely ready to move forward
- 60-79: Good progress, encourages to continue
- 40-59: Decent start, needs a bit more
- 0-39: Very early stage

**SUGGEST COMPLETION if:**
- 2+ criteria are SATISFIED (even if others are PARTIAL)
- All criteria are at least PARTIAL (none completely MISSING)
- The foundation is solid enough to build on

**FEEDBACK TONE:**
- Start with what IS done (not what's missing)
- Be specific and encouraging
- If suggesting more work, be brief and actionable
- Default to "this is good enough to move forward"

Output your analysis as JSON.`;
}

/**
 * JSON schema for analysis
 */
function getAnalysisSchema() {
  return {
    type: "object",
    properties: {
      quality_score: {
        type: "number",
        description:
          "Overall quality (0-100). Be generous: 60+ for decent work, 80+ for strong work.",
        minimum: 0,
        maximum: 100,
      },
      satisfied_criteria: {
        type: "array",
        description:
          "Criteria that are addressed (even if rough). Include criteria that are outlined/working but not perfect.",
        items: { type: "string" },
      },
      partial_criteria: {
        type: "array",
        description: "Criteria that are started but clearly incomplete.",
        items: { type: "string" },
      },
      missing_criteria: {
        type: "array",
        description: "Criteria that were not addressed at all.",
        items: { type: "string" },
      },
      tech_stack: {
        type: "array",
        description:
          "Technologies detected (e.g., 'React', 'TypeScript', 'Node.js')",
        items: { type: "string" },
      },
      has_tests: {
        type: "boolean",
        description: "Whether tests are present",
      },
      feedback: {
        type: "string",
        description:
          "User-facing feedback. Start with what's done well, be encouraging. 2-4 sentences max.",
      },
      suggest_completion: {
        type: "boolean",
        description:
          "Whether to suggest marking step complete. TRUE if 2+ criteria satisfied OR all are partial/better.",
      },
      confidence: {
        type: "number",
        description:
          "Confidence in completion suggestion (0-100). Be generous: 60+ if decent work.",
        minimum: 0,
        maximum: 100,
      },
    },
    required: [
      "quality_score",
      "satisfied_criteria",
      "partial_criteria",
      "missing_criteria",
      "tech_stack",
      "has_tests",
      "feedback",
      "suggest_completion",
      "confidence",
    ],
    additionalProperties: false,
  };
}

/**
 * Read artifact content for analysis
 */
async function readArtifactContent(
  filePath: string,
  fileName: string,
): Promise<{ preview: string; file_count: number; is_code: boolean }> {
  try {
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      // Read folder structure
      const files = readDirectoryRecursive(filePath, 3); // Max 3 levels deep
      const fileList = files.slice(0, 50).join("\n"); // Max 50 files
      return {
        preview: `Directory structure (${files.length} files):\n${fileList}${files.length > 50 ? "\n... and more" : ""}`,
        file_count: files.length,
        is_code: files.some((f) =>
          /\.(js|ts|py|java|go|rb|php|cs|cpp|c|h)$/i.test(f),
        ),
      };
    } else {
      // Read file content
      const content = fs.readFileSync(filePath, "utf-8");
      const preview = content.substring(0, 3000); // First 3000 chars
      return {
        preview: `File: ${fileName}\n\n${preview}${content.length > 3000 ? "\n... (truncated)" : ""}`,
        file_count: 1,
        is_code:
          /\.(js|ts|py|java|go|rb|php|cs|cpp|c|h|json|yaml|yml|md)$/i.test(
            fileName,
          ),
      };
    }
  } catch (error) {
    console.error("[ArtifactAnalyzer] Error reading content:", error);
    return {
      preview: `Unable to read file: ${fileName}`,
      file_count: 1,
      is_code: false,
    };
  }
}

/**
 * Read directory structure recursively
 */
function readDirectoryRecursive(dir: string, maxDepth: number): string[] {
  if (maxDepth <= 0) return [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      // Skip node_modules, .git, etc
      if (
        ["node_modules", ".git", "dist", "build", ".next"].includes(entry.name)
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        files.push(`${relativePath}/`);
        files.push(...readDirectoryRecursive(fullPath, maxDepth - 1));
      } else {
        files.push(relativePath);
      }
    }

    return files;
  } catch (error) {
    console.error(`[ArtifactAnalyzer] Error reading directory ${dir}:`, error);
    return [];
  }
}

/**
 * Basic heuristic analysis when LLM unavailable
 */
function basicAnalysis(
  content: { preview: string; file_count: number; is_code: boolean },
  step: { acceptance_criteria: string[] },
): ArtifactAnalysisResult {
  const hasContent = content.preview.length > 100;
  const hasMultipleFiles = content.file_count > 1;
  const hasTests = /test|spec/i.test(content.preview);

  const satisfiedCount = hasContent
    ? Math.min(step.acceptance_criteria.length, 2)
    : 0;

  return {
    quality_score: hasContent ? (hasMultipleFiles ? 70 : 60) : 30,
    satisfied_criteria: step.acceptance_criteria.slice(0, satisfiedCount),
    partial_criteria: [],
    missing_criteria: step.acceptance_criteria.slice(satisfiedCount),
    tech_stack: [],
    file_count: content.file_count,
    has_tests: hasTests,
    feedback: hasContent
      ? "Great! I can see you've uploaded your work. This looks like a solid start."
      : "I've received your file. Keep building!",
    suggest_completion: satisfiedCount >= 2,
    confidence: hasContent ? 60 : 30,
  };
}
