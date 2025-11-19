/**
 * Step Completion Service
 *
 * LLM-powered completion detection for dynamic roadmap steps.
 * Analyzes conversation, artifacts, and acceptance criteria to suggest completion.
 */

import { makeOpenAI } from "../../../ai";
import { ENV } from "../../../env";

// RoadmapStep interface (matches database schema)
export interface RoadmapStep {
  step_number: number;
  title: string;
  description: string;
  acceptance_criteria: string[];
  estimated_complexity: number;
  status?: "pending" | "active" | "completed" | "skipped";
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
}

export type StepStatusRecommendation =
  | "READY_TO_COMPLETE"
  | "KEEP_WORKING"
  | "BLOCKED";

/**
 * LLM Analysis Response (strict schema from OpenAI)
 */
interface LLMAnalysisResponse {
  status_recommendation: StepStatusRecommendation;
  confidence_score: number;
  reasoning: string;
  satisfied_criteria: string[];
  missing_criteria: string[];
  conversation_signals: string[];
  artifact_signals: string[];
  mentorship_feedback: string;
}

export interface CompletionSuggestion {
  status_recommendation: StepStatusRecommendation; // LLM's recommendation (backend decides final status)
  confidence_score: number; // 0-100 (combined score)
  conversation_confidence: number; // 0-100 (conversation-only)
  artifact_confidence: number; // 0-100 (artifact-only)
  auto_advance: boolean; // True if threshold met for auto-advancement (85%+)
  reasoning: string;
  evidence: {
    satisfied_criteria: string[];
    missing_criteria: string[];
    conversation_signals: string[];
    artifact_signals?: string[];
  };
  suggestion_message: string; // User-facing message
  celebration_message?: string; // Message for inline chat celebration
  mentorship_feedback: string; // Encouraging feedback (2-4 sentences)
  step_summary?: string; // Optional summary of what was accomplished (2-3 sentences)
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
              "Read the conversation messages above carefully. Extract SPECIFIC details: file names, data found, tools used, features created. Your mentorship feedback MUST reference these concrete things from the actual messages, not generic phrases. If the conversation shows no real work, say 'You haven't started yet' with specific first action. Prove you read the messages by quoting or referencing them.",
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent, focused analysis
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

      // Handle both "text" and "output_text" types (Responses API format for structured outputs)
      const responseText =
        assistantMessage.content
          ?.filter((c: any) => c.type === "text" || c.type === "output_text")
          .map((c: any) => c.text)
          .join("") || "";
      if (!responseText) {
        throw new Error("No text content in assistant message");
      }

      const analysis = JSON.parse(responseText) as LLMAnalysisResponse;

      // Validate LLM response has all required fields
      this.validateLLMResponse(analysis);

      // Calculate hybrid confidence score
      const conversationConf = analysis.confidence_score || 0;
      const artifactConf = this.calculateArtifactConfidence(request.artifacts);

      // Hybrid formula:
      // - If artifacts present: weighted average (70% conversation, 30% artifact)
      // - If no artifacts: conversation score needs to be higher (90% to auto-advance)
      const hasArtifacts =
        request.artifacts && (request.artifacts.file_count || 0) > 0;

      const combinedScore = hasArtifacts
        ? Math.round(conversationConf * 0.7 + artifactConf * 0.3)
        : conversationConf;

      // Auto-advance threshold:
      // - With artifacts: 85%+ combined score
      // - Without artifacts: 90%+ conversation score
      const autoAdvanceThreshold = hasArtifacts ? 85 : 90;
      const autoAdvance = combinedScore >= autoAdvanceThreshold;

      console.log(
        `[StepCompletionService] Scores - Conversation: ${conversationConf}%, Artifact: ${artifactConf}%, Combined: ${combinedScore}%, Auto-advance: ${autoAdvance}`,
      );

      return {
        status_recommendation: analysis.status_recommendation,
        confidence_score: combinedScore,
        conversation_confidence: conversationConf,
        artifact_confidence: artifactConf,
        auto_advance: autoAdvance,
        reasoning: analysis.reasoning,
        evidence: {
          satisfied_criteria: analysis.satisfied_criteria || [],
          missing_criteria: analysis.missing_criteria || [],
          conversation_signals: analysis.conversation_signals || [],
          artifact_signals: analysis.artifact_signals || [],
        },
        suggestion_message: this.formatSuggestionMessage(analysis),
        celebration_message: autoAdvance
          ? this.formatCelebrationMessage(request.step)
          : undefined,
        mentorship_feedback: analysis.mentorship_feedback || "Keep building!",
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

    let prompt = `You are a supportive senior developer coaching someone in real-time.

🚨 CRITICAL RULES FOR MENTORSHIP FEEDBACK:
1. READ THE CONVERSATION CAREFULLY - extract specific details they mentioned
2. REFERENCE ACTUAL THINGS: file names, component names, features, code snippets, data found
3. NEVER USE GENERIC PHRASES: "started working", "made progress", "builds foundation", "this step gets you"
4. If conversation is empty/minimal, say "You haven't started this yet" and give specific first action
5. Your feedback must prove you read their actual messages, not just the step description

🚫 BANNED PHRASES (DO NOT USE):
- "This step gets you..."
- "You started working on..."
- "You still need to address..."
- "Next: [repeating criteria]"
- "builds foundation"
- "essential for what comes next"
- Any phrase that just restates the step title or criteria

✅ INSTEAD DO THIS:
- If work was done: Quote or reference SPECIFIC things from the conversation (exact words, data, names)
- If NO work done yet: "You haven't started this step yet. First, [specific action with example]."
- Reference actual conversation content: "I see you mentioned X" or "You described Y"

STEP DETAILS:
Title: ${step.title}
Description: ${step.description}
Complexity: ${step.estimated_complexity}/10

ACCEPTANCE CRITERIA:
${step.acceptance_criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join("\n")}

CONVERSATION (${conversation.length} messages for THIS step only):
${conversation
  .map((m, i) => `Message ${i + 1} [${m.role}]: ${m.content.substring(0, 500)}`)
  .join("\n\n")}

⚠️ CRITICAL ANALYSIS INSTRUCTIONS:
1. Read EVERY message above carefully
2. Look for: specific names, numbers, data, files, tools, features mentioned
3. If the conversation shows actual work/research, QUOTE or REFERENCE it specifically
4. If conversation is just step intro with no work done, say "You haven't started yet"
5. NEVER say generic phrases - your response must prove you read the actual messages
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
**BIAS TOWARD PASSING**: If in doubt, PASS THEM.

WHEN TO PASS (say should_complete: true):
✓ 2+ criteria are DONE (even if 1 is partial)
✓ All criteria are PARTIAL or better (none completely missing)
✓ Core foundation exists (rough is fine!)
✓ They can build on what they have
✓ No CRITICAL blockers for next step

WHEN TO BLOCK (say should_complete: false):
✗ Zero progress on multiple criteria
✗ Critical architectural flaw that breaks future steps
✗ Completely wrong direction

CRITERIA EVALUATION RULES:
- SATISFIED = criterion is addressed, even if rough/incomplete
- MISSING = criterion was not addressed at all

**IMPORTANT:** "Outlined but lacks detail" = SATISFIED (not missing!)
**IMPORTANT:** "Could be better/clearer" = SATISFIED (not missing!)
**IMPORTANT:** "Needs refinement" = SATISFIED (not missing!)

Only mark as MISSING if they literally didn't do it at all.

CONVERSATION SIGNALS TO RECOGNIZE:
✓ User shows code/screenshots/working examples
✓ User describes testing or seeing results
✓ User mentions specific implementation details
✓ AI confirms completion of work
✓ Files/artifacts uploaded
✓ User asks "what's next" or seems ready to move on

CONFIDENCE SCORING (be generous):
- 80-100: Strong evidence - definitely pass
- 60-79: Good enough progress - pass them!
- 40-59: Some work done - if 2+ criteria met, still pass
- 0-39: Very little done - probably block

**REMEMBER:** You're a COACH not a CRITIC. Default to YES unless there's a real blocker.

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
        status_recommendation: {
          type: "string",
          enum: ["READY_TO_COMPLETE", "KEEP_WORKING", "BLOCKED"],
          description:
            "Your recommendation for this step's status. READY_TO_COMPLETE if 2+ criteria done or all partial/better. KEEP_WORKING if making progress but not ready. BLOCKED only if there's a critical blocker preventing any progress.",
        },
        confidence_score: {
          type: "number",
          description:
            "Confidence in your recommendation (0-100). Be generous: 60+ if decent progress, 80+ if strong work.",
          minimum: 0,
          maximum: 100,
        },
        reasoning: {
          type: "string",
          description:
            "Brief explanation focusing on what IS done (not what could be better). Supportive tone.",
        },
        satisfied_criteria: {
          type: "array",
          description:
            "Criteria that are addressed (even if rough/partial). 'Outlined but needs detail' counts as SATISFIED.",
          items: { type: "string" },
        },
        missing_criteria: {
          type: "array",
          description:
            "Criteria that were NOT addressed at all (empty list if all were at least attempted).",
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
        mentorship_feedback: {
          type: "string",
          description:
            "Encouraging feedback about their progress. Reference SPECIFIC things from the conversation (names, data, tools used). 2-4 sentences. Start with what's done, then what's next if incomplete. Be a supportive coach, not a taskmaster.",
        },
      },
      required: [
        "status_recommendation",
        "confidence_score",
        "reasoning",
        "satisfied_criteria",
        "missing_criteria",
        "conversation_signals",
        "artifact_signals",
        "mentorship_feedback",
      ],
      additionalProperties: false,
    };
  }

  /**
   * Calculate artifact confidence score
   */
  private calculateArtifactConfidence(artifacts?: {
    file_count?: number;
    tech_stack?: string[];
    has_tests?: boolean;
    quality_score?: number;
  }): number {
    if (!artifacts) return 0;

    let score = 0;

    // Files present: +40 points
    if (artifacts.file_count && artifacts.file_count > 0) {
      score += 40;
    }

    // Quality score: up to +30 points
    if (artifacts.quality_score) {
      score += (artifacts.quality_score / 10) * 30;
    }

    // Tests present: +20 points
    if (artifacts.has_tests) {
      score += 20;
    }

    // Tech stack identified: +10 points
    if (artifacts.tech_stack && artifacts.tech_stack.length > 0) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Format celebration message for inline chat
   */
  private formatCelebrationMessage(step: RoadmapStep): string {
    const celebrations = [
      `✅ **Step ${step.step_number} complete!** Great work on "${step.title}".\n\n🚀 Moving to Step ${step.step_number + 1}...`,
      `🎉 **Excellent!** You've completed "${step.title}".\n\n✨ Advancing to the next step...`,
      `👏 **Well done!** Step ${step.step_number} is complete.\n\n⚡ Continuing to Step ${step.step_number + 1}...`,
    ];

    // Pick a random celebration
    return celebrations[Math.floor(Math.random() * celebrations.length)];
  }

  /**
   * Format user-facing suggestion message
   */
  private formatSuggestionMessage(analysis: any): string {
    if (analysis.status_recommendation === "BLOCKED") {
      return "It looks like you might be stuck. Consider taking a different approach or asking for help.";
    }

    if (analysis.status_recommendation === "KEEP_WORKING") {
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

    const conversationScore = Math.min(baseScore, 100);
    const artifactScore = this.calculateArtifactConfidence(artifacts);

    const hasArtifacts = artifacts && (artifacts.file_count || 0) > 0;
    const combinedScore = hasArtifacts
      ? Math.round(conversationScore * 0.7 + artifactScore * 0.3)
      : conversationScore;

    // Determine status recommendation based on combined score
    let statusRecommendation: StepStatusRecommendation;
    if (combinedScore >= 60) {
      statusRecommendation = "READY_TO_COMPLETE";
    } else if (combinedScore >= 30) {
      statusRecommendation = "KEEP_WORKING";
    } else {
      statusRecommendation = "BLOCKED";
    }

    const autoAdvanceThreshold = hasArtifacts ? 85 : 90;
    const autoAdvance = combinedScore >= autoAdvanceThreshold;

    return {
      status_recommendation: statusRecommendation,
      confidence_score: Math.round(combinedScore),
      conversation_confidence: Math.round(conversationScore),
      artifact_confidence: Math.round(artifactScore),
      auto_advance: autoAdvance,
      reasoning:
        statusRecommendation === "READY_TO_COMPLETE"
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
      suggestion_message:
        statusRecommendation === "READY_TO_COMPLETE"
          ? "You've got what you need! The foundation is solid - let's build on it!"
          : "Keep going - you're making progress! Focus on getting the core work done.",
      celebration_message: autoAdvance
        ? this.formatCelebrationMessage(step)
        : undefined,
      mentorship_feedback:
        satisfied.length > 0
          ? `Great start! You've made progress on ${satisfied.slice(0, 2).join(" and ")}. ${statusRecommendation === "READY_TO_COMPLETE" ? "You're ready to move forward!" : "Keep building out the remaining pieces to complete this step."}`
          : `Let's get started on ${step.title}. First, ${step.acceptance_criteria[0] || "work on the core requirements"}.`,
    };
  }

  /**
   * Validate LLM response has all required fields with correct types
   */
  private validateLLMResponse(
    analysis: any,
  ): asserts analysis is LLMAnalysisResponse {
    const requiredFields: (keyof LLMAnalysisResponse)[] = [
      "status_recommendation",
      "confidence_score",
      "reasoning",
      "satisfied_criteria",
      "missing_criteria",
      "conversation_signals",
      "artifact_signals",
      "mentorship_feedback",
    ];

    for (const field of requiredFields) {
      if (!(field in analysis)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate types
    if (
      !["READY_TO_COMPLETE", "KEEP_WORKING", "BLOCKED"].includes(
        analysis.status_recommendation,
      )
    ) {
      throw new Error(
        `Invalid status_recommendation: ${analysis.status_recommendation}`,
      );
    }

    if (
      typeof analysis.confidence_score !== "number" ||
      analysis.confidence_score < 0 ||
      analysis.confidence_score > 100
    ) {
      throw new Error(`Invalid confidence_score: ${analysis.confidence_score}`);
    }

    if (typeof analysis.reasoning !== "string" || !analysis.reasoning.trim()) {
      throw new Error("Invalid reasoning: must be non-empty string");
    }

    if (!Array.isArray(analysis.satisfied_criteria)) {
      throw new Error("Invalid satisfied_criteria: must be array");
    }

    if (!Array.isArray(analysis.missing_criteria)) {
      throw new Error("Invalid missing_criteria: must be array");
    }

    if (!Array.isArray(analysis.conversation_signals)) {
      throw new Error("Invalid conversation_signals: must be array");
    }

    if (!Array.isArray(analysis.artifact_signals)) {
      throw new Error("Invalid artifact_signals: must be array");
    }

    if (
      typeof analysis.mentorship_feedback !== "string" ||
      !analysis.mentorship_feedback.trim()
    ) {
      throw new Error("Invalid mentorship_feedback: must be non-empty string");
    }
  }

  /**
   * Generate a 2-3 sentence summary of what was accomplished in this step
   */
  async generateStepSummary(
    step: RoadmapStep,
    conversation: Message[],
  ): Promise<string> {
    try {
      const client = makeOpenAI();
      if (!client) {
        return this.generateHeuristicSummary(step, conversation);
      }

      const prompt = `You are summarizing what a builder accomplished in this roadmap step.

**STEP:**
${step.title}
${step.description}

**ACCEPTANCE CRITERIA:**
${step.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

**CONVERSATION (what they actually did):**
${conversation
  .slice(-10)
  .map((m) => `${m.role}: ${m.content.substring(0, 500)}`)
  .join("\n\n")}

---

Write a 2-3 sentence summary of what was accomplished. Be specific:
- What did they build/create/define?
- What key decisions were made?
- What artifacts/outputs were produced?

Focus on CONCRETE outcomes, not just that they "worked on" something.
Be concise but specific.`;

      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [{ role: "user", content: prompt }],
        temperature: 0.5,
        max_output_tokens: 200,
      });

      const assistantMessage = result.output.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;

      if (!assistantMessage) {
        return this.generateHeuristicSummary(step, conversation);
      }

      const summary =
        assistantMessage.content
          ?.filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("") || "";

      return (
        summary.trim() || this.generateHeuristicSummary(step, conversation)
      );
    } catch (error) {
      console.error("[StepCompletionService] Error generating summary:", error);
      return this.generateHeuristicSummary(step, conversation);
    }
  }

  /**
   * Fallback summary when LLM unavailable
   */
  private generateHeuristicSummary(
    step: RoadmapStep,
    conversation: Message[],
  ): string {
    const criteriaCount = step.acceptance_criteria.length;
    const messageCount = conversation.length;

    return `Completed "${step.title}" with ${criteriaCount} acceptance ${criteriaCount === 1 ? "criterion" : "criteria"} addressed through ${messageCount} conversation ${messageCount === 1 ? "exchange" : "exchanges"}.`;
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
    return (
      analysis.status_recommendation === "READY_TO_COMPLETE" &&
      analysis.confidence_score >= 60
    );
  }
}
