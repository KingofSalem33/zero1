/**
 * Phase Generation Service
 *
 * Generates project-specific P1-P7 roadmap phases using LLM.
 * Falls back to universal phases if AI generation fails.
 */

import { makeOpenAI } from "../../../ai";
import { ENV } from "../../../env";
import { phaseGenerationJsonSchema } from "../../../ai/schemas";
import { PromptTemplates } from "../../../infrastructure/ai/PromptTemplates";

export interface PhaseGenerationRequest {
  goal: string;
  clarification_context?: string;
}

export interface Phase {
  phase_id: string;
  phase_number: number;
  goal: string;
  why_it_matters: string;
  acceptance_criteria: string[];
  rollback_plan: string[];
  substeps: any[];
  locked: boolean;
  completed?: boolean;
  expanded?: boolean;
  created_at?: string;
}

export interface PhaseGenerationResponse {
  phases: Phase[];
}

/**
 * PhaseGenerationService - Generate customized P1-P7 roadmap
 */
export class PhaseGenerationService {
  /**
   * Generate project-specific phases using LLM
   */
  async generatePhases(
    request: PhaseGenerationRequest,
  ): Promise<PhaseGenerationResponse> {
    console.log(
      "🎯 [PhaseGenerationService] Generating dynamic P1-P7 roadmap for:",
      request.goal,
    );

    const client = makeOpenAI();
    if (!client) {
      console.warn(
        "⚠️ [PhaseGenerationService] AI not configured, using fallback",
      );
      return this.generateFallbackPhases();
    }

    try {
      const systemPrompt = PromptTemplates.phaseGeneration(
        request.goal,
        request.clarification_context,
      );

      console.log("[PhaseGenerationService] Calling Responses API...");

      // Use Responses API with structured output
      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate customized P1-P7 phases for: "${request.goal}"`,
          },
        ],
        temperature: 0.4,
        max_output_tokens: 2000,
        text: {
          format: {
            type: "json_schema" as const,
            name: phaseGenerationJsonSchema.name,
            schema: phaseGenerationJsonSchema.schema,
          },
          verbosity: "medium",
        },
      });

      console.log("[PhaseGenerationService] Responses API call succeeded");

      // Parse Responses API format
      const assistantMessage = result.output.find(
        (item: any) => item.type === "message" && item.role === "assistant",
      ) as any;

      if (!assistantMessage) {
        throw new Error("No assistant message in response");
      }

      const responseText =
        assistantMessage.content
          ?.filter((c: any) => c.type === "text" || c.type === "output_text")
          .map((c: any) => c.text)
          .join("") || "";

      if (!responseText || responseText.trim().length === 0) {
        throw new Error("Empty response from AI - using fallback");
      }

      const parsed = JSON.parse(responseText);

      // Add phase_number and lock status
      const phases = parsed.phases.map((phase: any, index: number) => ({
        ...phase,
        phase_number: index + 1,
        substeps: [],
        locked: index > 0, // Only P1 is unlocked
        completed: false,
        expanded: false,
      }));

      console.log(
        `✅ [PhaseGenerationService] Generated ${phases.length} customized phases`,
      );

      return { phases };
    } catch (error) {
      console.error(
        "❌ [PhaseGenerationService] Failed to generate phases:",
        error,
      );
      console.log(
        "⚠️ [PhaseGenerationService] Falling back to universal phases",
      );
      return this.generateFallbackPhases();
    }
  }

  /**
   * Generate fallback universal phases when AI fails
   */
  private generateFallbackPhases(): PhaseGenerationResponse {
    const phases: Phase[] = [
      {
        phase_id: "P1",
        phase_number: 1,
        goal: "Build Environment",
        why_it_matters:
          "Set up the tools and infrastructure needed to work efficiently",
        acceptance_criteria: [
          "Development environment configured",
          "Version control initialized",
          "Hello World deployed",
        ],
        rollback_plan: [
          "Document current setup",
          "Keep backup of configurations",
        ],
        substeps: [],
        locked: false,
        completed: false,
        expanded: false,
      },
      {
        phase_id: "P2",
        phase_number: 2,
        goal: "Core Loop",
        why_it_matters:
          "Build the smallest version that proves your idea works",
        acceptance_criteria: [
          "Core functionality implemented",
          "Tested with real data",
          "Delivers measurable value",
        ],
        rollback_plan: [
          "Keep version before adding features",
          "Document what worked",
        ],
        substeps: [],
        locked: true,
        completed: false,
        expanded: false,
      },
      {
        phase_id: "P3",
        phase_number: 3,
        goal: "Layered Expansion",
        why_it_matters: "Add one high-value feature on top of your core",
        acceptance_criteria: [
          "Feature integrated with core",
          "End-to-end testing complete",
          "User value enhanced",
        ],
        rollback_plan: ["Keep core separate", "Feature flags enabled"],
        substeps: [],
        locked: true,
        completed: false,
        expanded: false,
      },
      {
        phase_id: "P4",
        phase_number: 4,
        goal: "Reality Test",
        why_it_matters: "Validate with real users before going further",
        acceptance_criteria: [
          "2-3 minute demo created",
          "Test script executed",
          "Decision made: PROCEED/PIVOT/KILL",
        ],
        rollback_plan: ["Document learnings", "Keep all test data"],
        substeps: [],
        locked: true,
        completed: false,
        expanded: false,
      },
      {
        phase_id: "P5",
        phase_number: 5,
        goal: "Polish & Freeze Scope",
        why_it_matters: "Get launch-ready by fixing critical issues only",
        acceptance_criteria: [
          "Critical bugs fixed",
          "v1.0 scope frozen",
          "Launch checklist complete",
        ],
        rollback_plan: ["Keep pre-polish version", "Document scope decisions"],
        substeps: [],
        locked: true,
        completed: false,
        expanded: false,
      },
      {
        phase_id: "P6",
        phase_number: 6,
        goal: "Launch",
        why_it_matters: "Get your project in front of real users",
        acceptance_criteria: [
          "Deployed to public URL",
          "Marketing materials created",
          "Launched on 3 channels",
          "Metrics tracking active",
        ],
        rollback_plan: ["Keep staging environment", "Monitor rollback metrics"],
        substeps: [],
        locked: true,
        completed: false,
        expanded: false,
      },
      {
        phase_id: "P7",
        phase_number: 7,
        goal: "Reflect & Evolve",
        why_it_matters: "Learn from this project to improve the next",
        acceptance_criteria: [
          "Metrics compared to targets",
          "Lessons documented",
          "Next path chosen",
        ],
        rollback_plan: ["Archive project state", "Save all analytics"],
        substeps: [],
        locked: true,
        completed: false,
        expanded: false,
      },
    ];

    console.log(
      `✅ [PhaseGenerationService] Generated ${phases.length} fallback phases`,
    );

    return { phases };
  }
}

/**
 * Singleton instance
 */
export const phaseGenerationService = new PhaseGenerationService();
