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
   * ✅ Gap #1 Fix: Build context from completed phases
   *
   * Extracts what was accomplished in previous phases to provide
   * continuity when generating new phase prompts and substeps.
   */
  private buildPreviousPhasesContext(
    currentPhaseNumber: number,
    allPhases?: any[],
  ): string {
    if (!allPhases || currentPhaseNumber <= 1) {
      return ""; // No previous phases
    }

    const previousPhases = allPhases
      .filter((p) => p.phase_number < currentPhaseNumber && p.completed)
      .sort((a, b) => a.phase_number - b.phase_number);

    if (previousPhases.length === 0) {
      return ""; // No completed previous phases
    }

    const context = previousPhases
      .map((phase) => {
        const completedSubsteps =
          phase.substeps?.filter((s: any) => s.completed) || [];
        const substepLabels = completedSubsteps
          .map((s: any) => `  - ${s.label}`)
          .join("\n");

        return `**${phase.phase_id}: ${phase.goal}** ✅ COMPLETED
${phase.why_it_matters}

Completed substeps:
${substepLabels || "  - (No substeps tracked)"}

Key accomplishments:
${this.extractKeyAccomplishments(phase)}`;
      })
      .join("\n\n---\n\n");

    return context;
  }

  /**
   * Extract key accomplishments from a completed phase
   */
  private extractKeyAccomplishments(phase: any): string {
    const accomplishments: string[] = [];

    // P1-specific accomplishments
    if (phase.phase_id === "P1") {
      accomplishments.push("  - Development environment configured");
      accomplishments.push("  - Version control initialized");
      accomplishments.push("  - Deployment pipeline set up");
      accomplishments.push("  - Hello World deployed and verified");
    }

    // P2-specific accomplishments
    if (phase.phase_id === "P2") {
      accomplishments.push("  - Core input/output flow defined");
      accomplishments.push("  - Minimal working implementation built");
      accomplishments.push("  - Core loop tested with real data");
    }

    // P3-specific accomplishments
    if (phase.phase_id === "P3") {
      accomplishments.push("  - First high-value feature added");
      accomplishments.push("  - Feature integrated with core loop");
      accomplishments.push("  - End-to-end testing completed");
    }

    // Add acceptance criteria as accomplishments
    if (phase.acceptance_criteria && phase.acceptance_criteria.length > 0) {
      phase.acceptance_criteria.forEach((criterion: string) => {
        accomplishments.push(`  - ${criterion}`);
      });
    }

    return accomplishments.length > 0
      ? accomplishments.join("\n")
      : "  - Phase completed successfully";
  }

  /**
   * Expand a phase with AI-generated substeps
   *
   * ✅ Gap #1 Fix: Now builds context from previous phases
   */
  async expandPhaseWithSubsteps(
    phase: any,
    projectGoal: string,
    stateSnapshot?: unknown,
    allPhases?: any[],
  ): Promise<ExpandedPhase> {
    console.log(`🔍 [SubstepGenerationService] Expanding phase: ${phase.goal}`);

    // ✅ NEW: Build context from previous completed phases
    const previousContext = this.buildPreviousPhasesContext(
      phase.phase_number,
      allPhases,
    );

    // Generate master prompt for this phase with context
    const masterPrompt = await this.getMasterPromptForPhase(
      phase.phase_id,
      projectGoal,
      previousContext,
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

      // ✅ Gap #1 Fix: Build context section
      const previousContextSection = previousContext
        ? `\n## 🎯 PREVIOUS PHASE ACCOMPLISHMENTS:\n${previousContext}\n\n⚠️ CRITICAL: Your substeps MUST reference and build upon these accomplishments. Don't ask the user to repeat work from previous phases.\n`
        : "\nNote: This is the first phase - establishing the foundation.\n";

      const systemPrompt = `You are a Master Builder AI designing substeps for a Zero-to-One project builder.

PHASE: ${phase.phase_id} - ${phase.goal}
PROJECT VISION: ${projectGoal}
PHASE PURPOSE: ${phase.why_it_matters}
${previousContextSection}
🚨 CRITICAL: SUBSTEPS MUST BE 100% CUSTOMIZED FOR THIS EXACT PROJECT TYPE 🚨

DO NOT generate generic substeps like "Set up Git repository" or "Configure development environment".

INSTEAD, generate substeps that are HYPER-SPECIFIC to the project domain:

❌ BAD (Generic):
- "Set up version control"
- "Configure your environment"
- "Deploy Hello World"

✅ GOOD (Specific to project type):

For "Build a cookie business":
- "Obtain Minnesota Cottage Food License and kitchen permits"
- "Source commercial-grade baking equipment and ingredients supplier"
- "Create first batch production schedule and recipe cards"

For "Build a SaaS productivity app":
- "Set up Node.js + React monorepo with TypeScript"
- "Configure Supabase database with authentication"
- "Deploy starter app to Vercel with CI/CD"

For "Launch a podcast":
- "Set up recording setup (microphone, Audacity, noise reduction)"
- "Create podcast hosting account (Buzzsprout) and RSS feed"
- "Record and publish 2-minute test episode"

🎯 YOUR TASK:
Analyze "${projectGoal}" and determine what TYPE of project this is (SaaS app, physical product, service business, content creation, etc.)

Then generate substeps that a DOMAIN EXPERT in that field would recommend - NOT generic software development steps.

📋 PHASE DISCIPLINE:
${phaseConstraints}

🧠 MASTER PROMPT PRINCIPLES:
${masterPrompt}

⚙️ CURRENT STATE:
${formattedSnapshot}

🔧 TECHNICAL NOTE:
The "prompt_to_send" field is a SYSTEM-LEVEL instruction to an AI that will execute this substep.

Write it TO the AI (not AS the AI). Tell it exactly what to generate for the user.

Example for a podcast project:
"You are a podcast production expert. The user is building: '${projectGoal}'

Execute this step:
1. Analyze their podcast concept and recommend specific equipment (model numbers, prices)
2. Generate a complete equipment shopping list with Amazon links
3. Provide noise reduction settings for their space type
4. Create a pre-flight checklist for their first recording

Return copy-paste-ready equipment list and setup instructions. End by asking them to upload a photo of their setup."

🎯 RULES:
1. Generate 3-5 substeps (15-30 min each)
2. Each substep addresses ONE specific deliverable
3. Substeps are written for THIS project type, not generic projects
4. Reference the EXACT domain/industry in labels and prompts
5. Include domain-specific terminology and best practices
6. Each prompt tells the AI what to GENERATE (not just guide)
7. Always end with upload/review instruction

BEGIN GENERATION:`;

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
        `✅ [SubstepGenerationService] AI successfully generated ${parsed.substeps.length} substeps for "${projectGoal}"`,
      );
      console.log(
        "First substep label:",
        parsed.substeps[0]?.label || "No label",
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
      console.error("Phase ID:", phase.phase_id);
      console.error("Project Goal:", projectGoal);
      console.error(
        "This error caused fallback to generic substeps. Check OpenAI API configuration and response format.",
      );
      return this.expandWithFallback(phase, projectGoal, masterPrompt);
    }
  }

  /**
   * Generate master prompt for a phase using LLM
   *
   * ✅ Gap #1 Fix: Now accepts previous phase context
   */
  private async getMasterPromptForPhase(
    phaseId: string,
    userVision: string,
    previousContext?: string,
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
        previousContext,
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
   *
   * ✅ IMPROVED: Now project-aware fallbacks instead of purely generic
   */
  private expandWithFallback(
    phase: any,
    projectGoal: string,
    masterPrompt: string,
  ): ExpandedPhase {
    console.log(
      "⚠️ [SubstepGenerationService] Using fallback substeps for",
      phase.phase_id,
      "- Project:",
      projectGoal,
    );

    const fallbackSubsteps = this.getFallbackSubsteps(
      phase.phase_id,
      projectGoal,
    );

    return {
      ...phase,
      master_prompt: masterPrompt,
      substeps: fallbackSubsteps,
    };
  }

  /**
   * Get fallback substeps for a phase
   *
   * ✅ IMPROVED: Project-aware fallbacks
   */
  private getFallbackSubsteps(phaseId: string, projectGoal: string): Substep[] {
    // ✅ IMPROVED: Project-aware fallback substeps
    const fallbacks: Record<string, Substep[]> = {
      P1: [
        {
          substep_id: "P1-1",
          step_number: 1,
          label: "Analyze project type and requirements",
          prompt_to_send: `You are a senior architect analyzing project requirements.

PROJECT: "${projectGoal}"

Your task:
1. Determine what TYPE of project this is (SaaS app, physical product, service business, content creation, e-commerce, etc.)
2. List the SPECIFIC tools, infrastructure, and setup needed for THIS project type
3. Provide a customized setup checklist with exact tool names, not generic recommendations
4. If it's a software project, recommend specific tech stack. If it's a physical product, recommend equipment/suppliers. If it's a service, recommend business infrastructure.

Generate a comprehensive, project-specific setup plan. Be concrete and actionable.

End by asking the user to confirm their chosen approach.`,
          rationale:
            "Establishes the right foundation for this specific project type.",
          why_next_step_matters:
            "Ensures all subsequent steps are tailored to the project domain.",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "P1-2",
          step_number: 2,
          label: "Execute customized setup",
          prompt_to_send: `You are a domain expert helping with project setup.

PROJECT: "${projectGoal}"

Your task:
1. Based on the project type, provide step-by-step setup instructions
2. Include specific commands, links, or procedures tailored to THIS project
3. Customize for this exact project - not generic guidance
4. Provide troubleshooting tips for common issues in this domain

Generate actionable, copy-paste-ready setup instructions specific to the project type.

End by asking the user to upload proof of setup completion.`,
          rationale: "Executes the customized setup plan for this project.",
          why_next_step_matters:
            "Creates the baseline environment for building.",
          completed: false,
          created_at: new Date().toISOString(),
        },
        {
          substep_id: "P1-3",
          step_number: 3,
          label: "Verify setup works",
          prompt_to_send: `You are a quality assurance specialist.

PROJECT: "${projectGoal}"

Your task:
1. Create a verification checklist specific to this project type
2. If software: test deployment. If physical: test production. If service: test core workflow.
3. Provide specific success criteria for THIS project (not generic)
4. Guide the user through validation with project-specific examples

Generate a customized verification plan.

End by asking the user to share verification results.`,
          rationale: "Validates the setup works before building core features.",
          why_next_step_matters:
            "Confirms the baseline so future work focuses on value creation.",
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
