/**
 * Substep Generation Service
 *
 * Expands phases into actionable substeps using LLM.
 * Generates master prompts for each phase.
 * Falls back to predefined substeps if AI generation fails.
 */

import { makeOpenAI } from "../../../ai";
import { ENV } from "../../../env";
import { substepGenerationJsonSchema } from "../../../ai/schemas";
import { PromptTemplates } from "../../../infrastructure/ai/PromptTemplates";

export interface Substep {
  substep_id: string;
  step_number: number;
  label: string;
  prompt_to_send: string;
  commands?: string;
  rationale?: string;
  why_next_step_matters?: string;
  completed: boolean;
  created_at: string;
}

export interface ExpandedPhase {
  phase_id: string;
  phase_number: number;
  goal: string;
  why_it_matters: string;
  acceptance_criteria: string[];
  rollback_plan: string[];
  master_prompt: string;
  substeps: Substep[];
  locked: boolean;
  completed: boolean;
  expanded: boolean;
  created_at?: string;
}

/**
 * SubstepGenerationService - Expand phases with AI-generated substeps
 */
export class SubstepGenerationService {
  /**
   * Expand a phase with AI-generated substeps
   */
  async expandPhaseWithSubsteps(
    phase: any,
    projectGoal: string,
    stateSnapshot?: unknown,
  ): Promise<ExpandedPhase> {
    console.log(`🔍 [SubstepGenerationService] Expanding phase: ${phase.goal}`);

    // Generate master prompt for this phase
    const masterPrompt = await this.getMasterPromptForPhase(
      phase.phase_id,
      projectGoal,
    );

    const client = makeOpenAI();
    if (!client) {
      console.warn(
        "⚠️ [SubstepGenerationService] AI not configured, using fallback",
      );
      return this.expandWithFallback(phase, projectGoal, masterPrompt);
    }

    try {
      const phaseConstraints = PromptTemplates.getPhaseConstraints(
        phase.phase_id,
      );

      // Format optional state snapshot for inclusion in prompt
      const formattedSnapshot = (() => {
        if (stateSnapshot == null) return "No additional context provided.";
        try {
          const text =
            typeof stateSnapshot === "string"
              ? stateSnapshot
              : JSON.stringify(stateSnapshot, null, 2);
          // Truncate overly long context to avoid prompt bloat
          return text.length > 4000
            ? text.slice(0, 4000) + "\n…(truncated)"
            : text;
        } catch {
          return "[Unserializable snapshot provided]";
        }
      })();

      const systemPrompt = `You are a Master Builder AI designing substeps for a Zero-to-One project builder.

PHASE: ${phase.phase_id} - ${phase.goal}
PROJECT VISION: ${projectGoal}
PHASE PURPOSE: ${phase.why_it_matters}

🚨 PHASE DISCIPLINE ENFORCEMENT:
You MUST respect the phase boundaries. Each phase has a specific purpose in the Zero-to-One journey:

${phaseConstraints}

dY"x CURRENT PROJECT CONTEXT (STATE SNAPSHOT):
${formattedSnapshot}

Your substeps MUST ONLY address activities within this phase's scope.

📋 MASTER PROMPT PRINCIPLES FOR THIS PHASE:
${masterPrompt}

Your substeps should break down these principles into concrete, executable tasks.

CRITICAL INSTRUCTION:
The "prompt_to_send" field is a SYSTEM-LEVEL instruction to an AI that will execute this substep.

✅ CORRECT EXAMPLE:
"You are a senior brand strategist with 20+ years of experience. We are in Phase P1: Build Environment — Substep 2: Brand Identity Foundation for '${projectGoal}'.

Execute this step now:
- Generate a complete brand identity system including color palette, typography, brand voice
- Create a ready-to-use brand guide document
- Return copy-paste-ready content

End by instructing the user to review and upload their finalized version."

RULES:
1. Generate 3-5 substeps (15-30 min each)
2. Each prompt is written TO the AI, not AS the AI
3. Focus on generating copy-paste-ready deliverables
4. Always end with upload/review instruction
5. Keep substeps small and actionable
6. When possible, include a short 'rationale' and 'why_next_step_matters' for each substep`;

      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Generate the substeps for this phase." },
        ],
        temperature: 0.3,
        max_output_tokens: 2000,
        text: {
          format: {
            type: "json_schema" as const,
            name: substepGenerationJsonSchema.name,
            schema: substepGenerationJsonSchema.schema,
          },
          verbosity: "medium",
        },
      });

      // Parse response
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

      console.log(
        `✅ [SubstepGenerationService] Generated ${parsed.substeps.length} substeps`,
      );

      const mapped: Substep[] = parsed.substeps.map(
        (substep: any, index: number) => ({
          ...substep,
          step_number: index + 1,
          completed: false,
          created_at: new Date().toISOString(),
        }),
      );

      const labels = mapped.map((s) => s.label || `Substep ${s.step_number}`);
      const enriched = mapped.map((s, i) => {
        const rationale = s.rationale?.trim()
          ? s.rationale.trim()
          : `This step advances the phase goal: ${phase.goal}.`;
        const nextLabel = labels[i + 1];
        const whyNext = s.why_next_step_matters?.trim()
          ? s.why_next_step_matters.trim()
          : nextLabel
            ? `Prepares you for “${nextLabel}” by ensuring the right groundwork is in place.`
            : `Completes this phase’s critical path and aligns with the acceptance criteria.`;
        return { ...s, rationale, why_next_step_matters: whyNext };
      });

      return {
        ...phase,
        master_prompt: masterPrompt,
        substeps: enriched,
      };
    } catch (error) {
      console.error(
        "❌ [SubstepGenerationService] Failed to expand phase:",
        error,
      );
      return this.expandWithFallback(phase, projectGoal, masterPrompt);
    }
  }

  /**
   * Generate master prompt for a phase using LLM
   */
  private async getMasterPromptForPhase(
    phaseId: string,
    userVision: string,
  ): Promise<string> {
    const client = makeOpenAI();
    if (!client) {
      return PromptTemplates.getFallbackMasterPrompt(phaseId, userVision);
    }

    try {
      const prompt = PromptTemplates.masterPromptGeneration(
        phaseId,
        `Phase ${phaseId}`,
        userVision,
      );

      const result = await client.chat.completions.create({
        model: ENV.OPENAI_MODEL_NAME,
        messages: [
          { role: "system", content: prompt },
          {
            role: "user",
            content: `Generate the master prompt for ${phaseId}: "${userVision}"`,
          },
        ],
        temperature: 0.5,
        max_tokens: 800,
      });

      const masterPrompt = result.choices[0]?.message?.content || "";

      if (masterPrompt.trim().length > 0) {
        return masterPrompt;
      }

      throw new Error("Empty master prompt from AI");
    } catch (error) {
      console.error(
        `❌ [SubstepGenerationService] Failed to generate master prompt for ${phaseId}:`,
        error,
      );
      return PromptTemplates.getFallbackMasterPrompt(phaseId, userVision);
    }
  }

  /**
   * Expand phase with fallback substeps
   */
  private expandWithFallback(
    phase: any,
    _projectGoal: string,
    masterPrompt: string,
  ): ExpandedPhase {
    console.log(
      "⚠️ [SubstepGenerationService] Using fallback substeps for",
      phase.phase_id,
    );

    const fallbackSubsteps = this.getFallbackSubsteps(phase.phase_id);

    return {
      ...phase,
      master_prompt: masterPrompt,
      substeps: fallbackSubsteps,
    };
  }

  /**
   * Get fallback substeps for a phase
   */
  private getFallbackSubsteps(phaseId: string): Substep[] {
    const fallbacks: Record<string, Substep[]> = {
      P1: [
        {
          substep_id: "P1-1",
          step_number: 1,
          label: "Set up version control",
          prompt_to_send:
            "You are a senior DevOps engineer. Guide the user to initialize a Git repository and make their first commit. Provide step-by-step commands.",
          rationale: "Establishes a safe, reversible history for all work.",
          why_next_step_matters:
            "Prepares your environment setup to be tracked and reproducible.",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "P1-2",
          step_number: 2,
          label: "Configure development environment",
          prompt_to_send:
            "You are a senior developer. Help the user set up their development tools and dependencies. Provide installation commands and verification steps.",
          rationale:
            "Ensures tools and dependencies are consistent across machines.",
          why_next_step_matters:
            "Sets up a smooth path to deploy a working Hello World.",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "P1-3",
          step_number: 3,
          label: "Deploy Hello World",
          prompt_to_send:
            "You are a deployment specialist. Guide the user to deploy a minimal 'Hello World' to verify the full pipeline works end-to-end.",
          rationale:
            "Validates end-to-end flow early to reduce integration risk.",
          why_next_step_matters:
            "Confirms the baseline so future changes focus on product value.",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
      P2: [
        {
          substep_id: "P2-1",
          step_number: 1,
          label: "Define core input/output",
          prompt_to_send:
            "You are a product architect. Help the user define the simplest input → process → output flow that proves value. Be concrete and specific.",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "P2-2",
          step_number: 2,
          label: "Build minimal implementation",
          prompt_to_send:
            "You are a senior engineer. Guide the user to build the core loop without polish. Focus on functionality, not aesthetics.",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "P2-3",
          step_number: 3,
          label: "Test with real data",
          prompt_to_send:
            "You are a QA specialist. Help the user test the core loop with real, concrete examples. Verify it delivers value.",
          rationale: "Surfaces issues and confirms the loop delivers value.",
          why_next_step_matters:
            "Informs what to refine or scale next with evidence.",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ],
    };

    return (
      fallbacks[phaseId] || [
        {
          substep_id: `${phaseId}-1`,
          step_number: 1,
          label: "Complete this phase",
          prompt_to_send: `You are a senior expert. Guide the user to complete ${phaseId} for their project.`,
          rationale: "Moves the phase forward toward its acceptance criteria.",
          why_next_step_matters:
            "Builds momentum and unlocks subsequent work with clarity.",
          completed: false,
          created_at: new Date().toISOString(),
        },
      ]
    );
  }
}

/**
 * Singleton instance
 */
export const substepGenerationService = new SubstepGenerationService();
