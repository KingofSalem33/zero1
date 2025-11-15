/**
 * Conversation Analyzer
 *
 * Analyzes conversation history to extract:
 * - What work has been completed
 * - Progress against acceptance criteria
 * - Key decisions and artifacts created
 * - Real-time context for dynamic system messages
 */

import type { Message } from "../../../services/threadService";

export interface AcceptanceCriterion {
  text: string;
  satisfied: boolean;
  evidence?: string;
}

export interface ProgressAnalysis {
  completed_work: string[];
  active_work: string[];
  acceptance_criteria_progress: AcceptanceCriterion[];
  key_artifacts: string[];
  tech_decisions: string[];
  progress_summary: string;
  completion_percentage: number;
}

/**
 * ConversationAnalyzer
 *
 * Analyzes conversation to track real-time progress
 */
export class ConversationAnalyzer {
  /**
   * Analyze conversation against substep acceptance criteria
   */
  analyzeProgress(
    messages: Message[],
    acceptanceCriteria: string[],
  ): ProgressAnalysis {
    const completedWork: string[] = [];
    const activeWork: string[] = [];
    const keyArtifacts: string[] = [];
    const techDecisions: string[] = [];

    // Combine all conversation text for pattern matching
    const conversationText = messages
      .map((m) => m.content.toLowerCase())
      .join(" ");

    // Extract completion signals from conversation
    this.extractCompletionSignals(messages, completedWork, activeWork);

    // Extract artifacts and decisions
    this.extractArtifacts(messages, keyArtifacts);
    this.extractTechDecisions(messages, techDecisions);

    // Analyze each acceptance criterion
    const criteriaProgress: AcceptanceCriterion[] = acceptanceCriteria.map(
      (criterion) => {
        const { satisfied, evidence } = this.checkCriterion(
          criterion,
          messages,
          conversationText,
        );
        return {
          text: criterion,
          satisfied,
          evidence,
        };
      },
    );

    // Calculate completion percentage
    const satisfiedCount = criteriaProgress.filter((c) => c.satisfied).length;
    const completionPercentage = Math.round(
      (satisfiedCount / Math.max(acceptanceCriteria.length, 1)) * 100,
    );

    // Build progress summary
    const progressSummary = this.buildProgressSummary(
      completedWork,
      activeWork,
      criteriaProgress,
    );

    return {
      completed_work: completedWork,
      active_work: activeWork,
      acceptance_criteria_progress: criteriaProgress,
      key_artifacts: keyArtifacts,
      tech_decisions: techDecisions,
      progress_summary: progressSummary,
      completion_percentage: completionPercentage,
    };
  }

  /**
   * Extract completion signals from conversation
   */
  private extractCompletionSignals(
    messages: Message[],
    completedWork: string[],
    activeWork: string[],
  ): void {
    // Patterns that indicate completed work
    const completionPatterns = [
      /✅\s+([^.\n]+)/gi, // Checkmark followed by text
      /completed?\s+([^.\n]+)/gi,
      /finished?\s+([^.\n]+)/gi,
      /created?\s+([^.\n]+)/gi,
      /installed?\s+([^.\n]+)/gi,
      /set up\s+([^.\n]+)/gi,
      /deployed?\s+([^.\n]+)/gi,
      /built?\s+([^.\n]+)/gi,
    ];

    // Patterns that indicate active work
    const activePatterns = [
      /working on\s+([^.\n]+)/gi,
      /currently\s+([^.\n]+)/gi,
      /in progress[:\s]+([^.\n]+)/gi,
      /🔄\s+([^.\n]+)/gi,
    ];

    for (const msg of messages) {
      // Skip very old messages (only analyze recent conversation)
      if (messages.indexOf(msg) < messages.length - 20) continue;

      // Extract completed work
      for (const pattern of completionPatterns) {
        const matches = [...msg.content.matchAll(pattern)];
        for (const match of matches) {
          const work = match[1]?.trim();
          if (work && work.length > 5 && work.length < 100) {
            completedWork.push(work);
          }
        }
      }

      // Extract active work
      for (const pattern of activePatterns) {
        const matches = [...msg.content.matchAll(pattern)];
        for (const match of matches) {
          const work = match[1]?.trim();
          if (work && work.length > 5 && work.length < 100) {
            activeWork.push(work);
          }
        }
      }
    }

    // Deduplicate
    completedWork.splice(
      0,
      completedWork.length,
      ...Array.from(new Set(completedWork)),
    );
    activeWork.splice(0, activeWork.length, ...Array.from(new Set(activeWork)));
  }

  /**
   * Extract artifacts from conversation (files, URLs, etc.)
   */
  private extractArtifacts(messages: Message[], artifacts: string[]): void {
    const artifactPatterns = [
      /created?\s+([\w\-/.]+\.(js|ts|jsx|tsx|py|go|rb|java|html|css|json|md))/gi,
      /wrote\s+([\w\-/.]+\.(js|ts|jsx|tsx|py|go|rb|java|html|css|json|md))/gi,
      /(https?:\/\/[^\s]+)/gi, // URLs
      /deployed to\s+([^\s]+)/gi,
    ];

    for (const msg of messages) {
      for (const pattern of artifactPatterns) {
        const matches = [...msg.content.matchAll(pattern)];
        for (const match of matches) {
          const artifact = match[1]?.trim();
          if (artifact) {
            artifacts.push(artifact);
          }
        }
      }
    }

    // Deduplicate
    artifacts.splice(0, artifacts.length, ...Array.from(new Set(artifacts)));
  }

  /**
   * Extract tech decisions from conversation
   */
  private extractTechDecisions(messages: Message[], decisions: string[]): void {
    const techKeywords = [
      "node.js",
      "python",
      "react",
      "vue",
      "angular",
      "next.js",
      "express",
      "django",
      "flask",
      "postgresql",
      "mysql",
      "mongodb",
      "redis",
      "docker",
      "kubernetes",
      "aws",
      "vercel",
      "netlify",
      "typescript",
      "javascript",
      "go",
      "rust",
    ];

    for (const msg of messages) {
      const lowerContent = msg.content.toLowerCase();

      // Look for tech stack mentions
      for (const tech of techKeywords) {
        if (lowerContent.includes(tech)) {
          // Try to extract the decision context
          const sentences = msg.content.split(/[.!?]\s+/);
          for (const sentence of sentences) {
            if (sentence.toLowerCase().includes(tech)) {
              decisions.push(sentence.trim());
              break;
            }
          }
        }
      }
    }

    // Deduplicate
    decisions.splice(0, decisions.length, ...Array.from(new Set(decisions)));
  }

  /**
   * Check if a specific acceptance criterion is satisfied
   */
  private checkCriterion(
    criterion: string,
    messages: Message[],
    conversationText: string,
  ): { satisfied: boolean; evidence?: string } {
    const lowerCriterion = criterion.toLowerCase();

    // Extract key terms from criterion (ignore common words)
    const stopWords = [
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "has",
      "have",
      "had",
      "do",
      "does",
      "did",
      "will",
      "would",
      "should",
      "could",
      "can",
      "may",
      "might",
      "must",
    ];

    const terms = lowerCriterion
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.includes(word))
      .slice(0, 5); // Take up to 5 key terms

    // Check if key terms appear in conversation
    let matchCount = 0;
    let evidence: string | undefined;

    for (const term of terms) {
      if (conversationText.includes(term)) {
        matchCount++;

        // Find evidence (sentence containing the term)
        if (!evidence) {
          for (const msg of messages.slice(-10)) {
            // Recent messages only
            const sentences = msg.content.split(/[.!?]\s+/);
            for (const sentence of sentences) {
              if (sentence.toLowerCase().includes(term)) {
                evidence = sentence.trim().substring(0, 100);
                break;
              }
            }
            if (evidence) break;
          }
        }
      }
    }

    // Criterion is satisfied if majority of key terms are present
    const satisfied = matchCount >= Math.ceil(terms.length * 0.6);

    return { satisfied, evidence };
  }

  /**
   * Build a human-readable progress summary
   */
  private buildProgressSummary(
    completedWork: string[],
    activeWork: string[],
    criteriaProgress: AcceptanceCriterion[],
  ): string {
    const parts: string[] = [];

    if (completedWork.length > 0) {
      parts.push(
        `**Completed:**\n${completedWork.slice(0, 5).map((w) => `- ${w}`).join("\n")}`,
      );
    }

    if (activeWork.length > 0) {
      parts.push(
        `**In Progress:**\n${activeWork.slice(0, 3).map((w) => `- ${w}`).join("\n")}`,
      );
    }

    const satisfiedCriteria = criteriaProgress.filter((c) => c.satisfied);
    const missingSriteria = criteriaProgress.filter((c) => !c.satisfied);

    if (satisfiedCriteria.length > 0) {
      parts.push(
        `**Acceptance Criteria Satisfied (${satisfiedCriteria.length}/${criteriaProgress.length}):**\n${satisfiedCriteria.map((c) => `✅ ${c.text}`).join("\n")}`,
      );
    }

    if (missingSriteria.length > 0) {
      parts.push(
        `**Still Needed:**\n${missingSriteria.map((c) => `⏳ ${c.text}`).join("\n")}`,
      );
    }

    if (parts.length === 0) {
      return "No progress detected yet. Starting fresh.";
    }

    return parts.join("\n\n");
  }

  /**
   * Quick check: Is this substep likely complete?
   */
  isLikelyComplete(
    messages: Message[],
    acceptanceCriteria: string[],
  ): boolean {
    const analysis = this.analyzeProgress(messages, acceptanceCriteria);

    // Consider complete if 80%+ of criteria satisfied
    return analysis.completion_percentage >= 80;
  }
}

export const conversationAnalyzer = new ConversationAnalyzer();
