/**
 * Step Completion Service
 *
 * LLM-powered completion detection for dynamic roadmap steps.
 * Analyzes conversation, artifacts, and acceptance criteria to suggest completion.
 */

import { makeOpenAI } from "../../../ai";
import { ENV } from "../../../env";
import type { RoadmapStep } from "./RoadmapGenerationService";

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export interface CompletionSuggestion {
  should_complete: boolean;
  confidence_score: number; // 0-100
  reasoning: string;
  evidence: {
    satisfied_criteria: string[];
    missing_criteria: string[];
    conversation_signals: string[];
    artifact_signals?: string[];
  };
  suggestion_message: string; // User-facing message
}

export interface AnalyzeCompletionRequest {
  step: RoadmapStep;
  conversation: Message[];
  artifacts?: {
    file_count?: number;
    tech_stack?: string[];
    has_tests?: boolean;
    quality_score?: number;
  };
}

/**
 * StepCompletionService
 *
 * Intelligent step completion detection using LLM analysis
 */
export class StepCompletionService {
  /**
   * Analyze if a step is complete
   */
  async analyzeCompletion(
    request: AnalyzeCompletionRequest,
  ): Promise<CompletionSuggestion> {
    console.log(
      `[StepCompletionService] Analyzing step ${request.step.step_number}: ${request.step.title}`,
    );

    const client = makeOpenAI();
    if (!client) {
      console.warn(
        "[StepCompletionService] AI not configured, using heuristic analysis",
      );
      return this.heuristicAnalysis(request);
    }

    try {
      const systemPrompt = this.buildAnalysisPrompt(request);

      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              "Analyze if this step is complete based on the conversation and criteria provided. Focus on whether they can move forward, not perfection.",
          },
        ],
        temperature: 0.4, // Balanced temperature for fair but consistent analysis
        max_output_tokens: 1500,
        text: {
          format: {
            type: "json_schema" as const,
            name: "completion_analysis",
            schema: this.getCompletionSchema(),
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
        should_complete: analysis.should_complete,
        confidence_score: analysis.confidence_score,
        reasoning: analysis.reasoning,
        evidence: {
          satisfied_criteria: analysis.satisfied_criteria || [],
          missing_criteria: analysis.missing_criteria || [],
          conversation_signals: analysis.conversation_signals || [],
          artifact_signals: analysis.artifact_signals || [],
        },
        suggestion_message: this.formatSuggestionMessage(analysis),
      };
    } catch (error) {
      console.error(
        "[StepCompletionService] Error analyzing completion:",
        error,
      );
      return this.heuristicAnalysis(request);
    }
  }

  /**
   * Build LLM analysis prompt
   */
  private buildAnalysisPrompt(request: AnalyzeCompletionRequest): string {
    const { step, conversation, artifacts } = request;

    let prompt = `You are a supportive senior developer helping a builder make progress from zero to one.

Your job is to recognize when work is "GOOD ENOUGH TO MOVE FORWARD" - not perfect, but solid enough to build on.

STEP DETAILS:
Title: ${step.title}
Description: ${step.description}
Complexity: ${step.estimated_complexity}/10

ACCEPTANCE CRITERIA:
${step.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

CONVERSATION (last ${conversation.length} messages):
${conversation
  .slice(-10)
  .map((m) => `[${m.role}]: ${m.content.substring(0, 200)}`)
  .join("\n")}
`;

    if (artifacts) {
      prompt += `\n\nARTIFACTS UPLOADED:`;
      if (artifacts.file_count) prompt += `\n- Files: ${artifacts.file_count}`;
      if (artifacts.tech_stack)
        prompt += `\n- Tech Stack: ${artifacts.tech_stack.join(", ")}`;
      if (artifacts.has_tests) prompt += `\n- Tests: Present`;
      if (artifacts.quality_score)
        prompt += `\n- Quality Score: ${artifacts.quality_score}/10`;
    }

    prompt += `\n\nYOUR MINDSET:
This is ZERO-TO-ONE building. Momentum matters more than perfection.
- PASS them if the core work is done and they can build on it
- PASS them if they've shown working progress (even if rough)
- PASS them if 70%+ of criteria are met and nothing critical is missing
- Only BLOCK if there's a critical gap that will cause problems in next steps

EVALUATION CRITERIA:
1. What core work has been completed? (Look for evidence of progress, working code, real artifacts)
2. Is the foundation solid enough for the NEXT step? (Not perfect - just sufficient)
3. Are there any CRITICAL blockers? (Major architectural issues, complete lack of progress)
4. Overall: Can they move forward, or do they need to address something first?

CONVERSATION SIGNALS TO RECOGNIZE:
✓ User shows code/screenshots/working examples
✓ User describes testing or seeing results
✓ User mentions specific implementation details
✓ AI confirms completion of work
✓ Files/artifacts uploaded
✓ User asks "what's next" or seems ready to move on

CONFIDENCE SCORING:
- 80-100: Strong evidence of completion, definitely ready to advance
- 60-79: Good progress, sufficient to move forward even if not perfect
- 40-59: Some progress but likely needs more work
- 0-39: Little evidence of completion

**REMEMBER:** We're building MOMENTUM. If they've done the work and can build on it, PASS THEM. Don't nitpick polish.

Output your analysis as JSON.`;

    return prompt;
  }

  /**
   * JSON schema for completion analysis
   */
  private getCompletionSchema() {
    return {
      type: "object",
      properties: {
        should_complete: {
          type: "boolean",
          description: "Whether this step should be marked complete",
        },
        confidence_score: {
          type: "number",
          description: "Confidence that step is complete (0-100)",
          minimum: 0,
          maximum: 100,
        },
        reasoning: {
          type: "string",
          description: "Detailed explanation of the analysis",
        },
        satisfied_criteria: {
          type: "array",
          description: "Acceptance criteria that are met",
          items: { type: "string" },
        },
        missing_criteria: {
          type: "array",
          description: "Acceptance criteria that are not yet met",
          items: { type: "string" },
        },
        conversation_signals: {
          type: "array",
          description: "Signals from conversation indicating completion",
          items: { type: "string" },
        },
        artifact_signals: {
          type: "array",
          description: "Signals from artifacts indicating completion",
          items: { type: "string" },
        },
      },
      required: [
        "should_complete",
        "confidence_score",
        "reasoning",
        "satisfied_criteria",
        "missing_criteria",
      ],
      additionalProperties: false,
    };
  }

  /**
   * Format user-facing suggestion message
   */
  private formatSuggestionMessage(analysis: any): string {
    if (!analysis.should_complete) {
      return "Keep working - you're making progress! Focus on the core criteria to move forward.";
    }

    const messages = [
      "Solid progress! You've got enough to build on - ready to move forward!",
      "Great work! The foundation is solid - let's keep the momentum going!",
      "Excellent! You've done what's needed for this step - onward!",
      "Outstanding work! All the key pieces are in place - time to level up!",
    ];

    // Pick message based on confidence
    const index = Math.min(
      Math.floor(analysis.confidence_score / 25),
      messages.length - 1,
    );
    return messages[index];
  }

  /**
   * Heuristic fallback when LLM unavailable
   */
  private heuristicAnalysis(
    request: AnalyzeCompletionRequest,
  ): CompletionSuggestion {
    const { step, conversation, artifacts } = request;

    const satisfied: string[] = [];
    const signals: string[] = [];

    // Check for completion keywords in conversation
    const recentMessages = conversation.slice(-5);
    const conversationText = recentMessages
      .map((m) => m.content.toLowerCase())
      .join(" ");

    const completionKeywords = [
      "done",
      "finished",
      "complete",
      "working",
      "tested",
      "deployed",
    ];
    const foundKeywords = completionKeywords.filter((kw) =>
      conversationText.includes(kw),
    );

    if (foundKeywords.length >= 2) {
      signals.push(`Conversation mentions: ${foundKeywords.join(", ")}`);
      satisfied.push("User indicates work is complete");
    }

    // Check artifacts
    if (artifacts) {
      if (artifacts.file_count && artifacts.file_count > 0) {
        satisfied.push("Code files uploaded");
        signals.push(`${artifacts.file_count} files present`);
      }
      if (artifacts.has_tests) {
        satisfied.push("Tests present");
        signals.push("Test files found");
      }
      if (artifacts.quality_score && artifacts.quality_score >= 7) {
        satisfied.push("High quality code");
        signals.push(`Quality score: ${artifacts.quality_score}/10`);
      }
    }

    // Generous scoring for momentum - if ANY progress signals, bump the score
    let baseScore = Math.min(
      (satisfied.length / Math.max(step.acceptance_criteria.length, 1)) * 100,
      100,
    );

    // Bonus for showing any tangible work
    if (satisfied.length > 0) {
      baseScore = Math.max(baseScore, 60); // Minimum 60 if ANY criteria satisfied
    }
    if (artifacts && artifacts.file_count && artifacts.file_count > 0) {
      baseScore += 15; // Big bonus for actual artifacts
    }

    const score = Math.min(baseScore, 100);
    const shouldComplete = score >= 60; // Lower threshold - 60% is good enough!

    return {
      should_complete: shouldComplete,
      confidence_score: Math.round(score),
      reasoning: shouldComplete
        ? "Heuristic analysis suggests step is complete based on conversation signals and artifacts."
        : "Heuristic analysis suggests more work is needed.",
      evidence: {
        satisfied_criteria: satisfied,
        missing_criteria: step.acceptance_criteria.slice(satisfied.length),
        conversation_signals: signals,
        artifact_signals: artifacts
          ? [`${artifacts.file_count || 0} files`]
          : [],
      },
      suggestion_message: shouldComplete
        ? "You've got what you need! The foundation is solid - let's build on it!"
        : "Keep going - you're making progress! Focus on getting the core work done.",
    };
  }

  /**
   * Quick check if step meets completion threshold
   */
  async quickCheck(
    step: RoadmapStep,
    recentMessages: Message[],
  ): Promise<boolean> {
    const analysis = await this.analyzeCompletion({
      step,
      conversation: recentMessages,
    });

    // Lower threshold for quick check - 60% confidence is enough to move forward
    return analysis.should_complete && analysis.confidence_score >= 60;
  }
}
