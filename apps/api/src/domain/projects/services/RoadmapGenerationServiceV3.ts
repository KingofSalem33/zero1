/**
 * Roadmap Generation Service V3 (P0-P7 Phase-Based)
 *
 * Uses proven P0-P7 template structure with LLM-generated substeps.
 * Teaches users a universal workflow: idea → launched product → next steps
 */

import { makeOpenAI } from "../../../ai";
import { ENV } from "../../../env";
import {
  getAllPhaseTemplates,
  generateMasterPrompt,
  type PhaseTemplate,
} from "../templates/PhaseTemplates";

export interface PhaseSubstep {
  substep_number: number;
  title: string;
  description: string;
  acceptance_criteria: string[];
  estimated_complexity: number;
  status: "pending" | "active" | "completed" | "skipped";
}

export interface RoadmapPhase {
  phase_number: number;
  phase_id: string;
  title: string;
  goal: string;
  pedagogical_purpose: string;
  visible_win: string;
  master_prompt: string;
  substeps: PhaseSubstep[];
  status: "locked" | "active" | "completed";
}

export interface GenerateRoadmapRequest {
  vision: string;
  clarification_context?: string;
  user_skill_level?: "beginner" | "intermediate" | "advanced";
}

export interface GenerateRoadmapResponse {
  phases: RoadmapPhase[];
  total_phases: number;
  estimated_timeline?: string;
  generated_by: string;
}

/**
 * JSON Schema for LLM-generated substeps for a phase
 */
const substepGenerationSchema = {
  name: "phase_substeps",
  schema: {
    type: "object",
    properties: {
      substeps: {
        type: "array",
        description: "2-5 substeps for this phase, tailored to the project",
        minItems: 2,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Clear, action-oriented title (e.g., 'Install Node.js')",
            },
            description: {
              type: "string",
              description: "What this substep accomplishes and why",
            },
            acceptance_criteria: {
              type: "array",
              description: "Specific, measurable completion criteria",
              items: { type: "string" },
            },
            estimated_complexity: {
              type: "number",
              description: "1 (trivial) to 10 (complex)",
              minimum: 1,
              maximum: 10,
            },
          },
          required: [
            "title",
            "description",
            "acceptance_criteria",
            "estimated_complexity",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["substeps"],
    additionalProperties: false,
  },
};

/**
 * RoadmapGenerationServiceV3
 *
 * Generates phase-based roadmaps with P0-P7 structure
 */
export class RoadmapGenerationServiceV3 {
  /**
   * Generate complete P0-P7 roadmap with substeps
   */
  async generateRoadmap(
    request: GenerateRoadmapRequest,
  ): Promise<GenerateRoadmapResponse> {
    console.log("🎯 [RoadmapV3] Generating P0-P7 roadmap for:", request.vision);

    const client = makeOpenAI();
    if (!client) {
      console.warn("⚠️ [RoadmapV3] AI not configured, using fallback");
      return this.generateFallbackRoadmap(request.vision);
    }

    const phaseTemplates = getAllPhaseTemplates();
    const phases: RoadmapPhase[] = [];

    // Generate substeps for each phase
    for (const template of phaseTemplates) {
      console.log(
        `🔨 [RoadmapV3] Generating substeps for ${template.phase_id}: ${template.title}`,
      );

      try {
        const substeps = await this.generateSubstepsForPhase(
          template,
          request,
          client,
        );

        // Generate master prompt with context
        const masterPrompt = generateMasterPrompt(template.phase_number, {
          user_goal: request.vision,
          vision_statement: request.vision,
        });

        phases.push({
          phase_number: template.phase_number,
          phase_id: template.phase_id,
          title: template.title,
          goal: template.goal,
          pedagogical_purpose: template.pedagogical_purpose,
          visible_win: template.visible_win,
          master_prompt: masterPrompt,
          substeps,
          status: template.phase_number === 0 ? "active" : "locked",
        });

        console.log(
          `✅ [RoadmapV3] Generated ${substeps.length} substeps for ${template.phase_id}`,
        );
      } catch (error) {
        console.error(
          `❌ [RoadmapV3] Error generating substeps for ${template.phase_id}:`,
          error,
        );
        // Use fallback substeps for this phase
        const fallbackSubsteps =
          this.generateFallbackSubstepsForPhase(template);
        phases.push({
          phase_number: template.phase_number,
          phase_id: template.phase_id,
          title: template.title,
          goal: template.goal,
          pedagogical_purpose: template.pedagogical_purpose,
          visible_win: template.visible_win,
          master_prompt: generateMasterPrompt(template.phase_number, {
            user_goal: request.vision,
            vision_statement: request.vision,
          }),
          substeps: fallbackSubsteps,
          status: template.phase_number === 0 ? "active" : "locked",
        });
      }
    }

    return {
      phases,
      total_phases: phases.length,
      estimated_timeline: this.estimateTimeline(phases),
      generated_by: ENV.OPENAI_MODEL_NAME,
    };
  }

  /**
   * Generate substeps for a specific phase
   */
  private async generateSubstepsForPhase(
    template: PhaseTemplate,
    request: GenerateRoadmapRequest,
    client: any,
  ): Promise<PhaseSubstep[]> {
    const systemPrompt = `You are a senior architect creating substeps for phase: ${template.title}

**PHASE GOAL:**
${template.goal}

**PEDAGOGICAL PURPOSE:**
${template.pedagogical_purpose}

**SUBSTEP GUIDANCE:**
${template.substep_generation_guidance}

Generate ${template.min_substeps}-${template.max_substeps} concrete, actionable substeps for this phase.
Each substep should be specific to the user's project vision.

**QUALITY CRITERIA:**
- Action-oriented titles (verbs: "Install", "Create", "Test")
- Specific to the project (not generic)
- Clear acceptance criteria
- Achievable wins
- Build on each other sequentially

Output ONLY the structured JSON. No commentary.`;

    const userPrompt = `**USER'S PROJECT VISION:**
"${request.vision}"

${request.clarification_context ? `\n**ADDITIONAL CONTEXT:**\n${request.clarification_context}\n` : ""}
Generate tailored substeps for the "${template.title}" phase that will help them achieve: ${template.goal}`;

    const result = await client.responses.create({
      model: ENV.OPENAI_MODEL_NAME,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.6, // Slightly more creative for bespoke substeps
      max_output_tokens: 2000,
      text: {
        format: {
          type: "json_schema" as const,
          name: substepGenerationSchema.name,
          schema: substepGenerationSchema.schema,
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

    if (!responseText) {
      throw new Error("No text content in assistant message");
    }

    const parsed = JSON.parse(responseText);

    // Map to PhaseSubstep interface
    return parsed.substeps.map((substep: any, index: number) => ({
      substep_number: index + 1,
      title: substep.title,
      description: substep.description,
      acceptance_criteria: substep.acceptance_criteria,
      estimated_complexity: substep.estimated_complexity,
      status: index === 0 && template.phase_number === 0 ? "active" : "pending",
    }));
  }

  /**
   * Generate fallback substeps for a phase (when LLM fails)
   */
  private generateFallbackSubstepsForPhase(
    template: PhaseTemplate,
  ): PhaseSubstep[] {
    // Simple fallback based on phase
    const fallbackMap: Record<number, PhaseSubstep[]> = {
      0: [
        {
          substep_number: 1,
          title: "Clarify Your Idea",
          description: "Define what problem you're solving and for whom",
          acceptance_criteria: [
            "Problem statement written",
            "Target audience identified",
          ],
          estimated_complexity: 2,
          status: "active",
        },
        {
          substep_number: 2,
          title: "Write Vision Statement",
          description: 'Create "I want to build X so that Y can Z" statement',
          acceptance_criteria: ["Vision statement written and clear"],
          estimated_complexity: 2,
          status: "pending",
        },
        {
          substep_number: 3,
          title: "Define Success Metrics",
          description: "Set 3 measurable goals",
          acceptance_criteria: ["3 specific, measurable metrics defined"],
          estimated_complexity: 3,
          status: "pending",
        },
      ],
      1: [
        {
          substep_number: 1,
          title: "Install Essential Tools",
          description: "Set up development environment",
          acceptance_criteria: ["Tools installed", "Versions verified"],
          estimated_complexity: 3,
          status: "pending",
        },
        {
          substep_number: 2,
          title: "Create Project Structure",
          description: "Initialize project with clean folder structure",
          acceptance_criteria: ["Project initialized", "Folders created"],
          estimated_complexity: 2,
          status: "pending",
        },
        {
          substep_number: 3,
          title: "Run Hello World",
          description: "Verify environment works with simple test",
          acceptance_criteria: ["Hello World runs successfully"],
          estimated_complexity: 2,
          status: "pending",
        },
      ],
      // Add more fallbacks for other phases as needed
    };

    return (
      fallbackMap[template.phase_number] || [
        {
          substep_number: 1,
          title: `Complete ${template.title}`,
          description: template.goal,
          acceptance_criteria: ["Phase objectives met"],
          estimated_complexity: 5,
          status: "pending",
        },
      ]
    );
  }

  /**
   * Estimate timeline based on substep complexity
   */
  private estimateTimeline(phases: RoadmapPhase[]): string {
    const totalComplexity = phases.reduce(
      (sum, phase) =>
        sum +
        phase.substeps.reduce((s, sub) => s + sub.estimated_complexity, 0),
      0,
    );

    if (totalComplexity < 30) return "1-2 weeks for a dedicated builder";
    if (totalComplexity < 60) return "2-4 weeks for a dedicated builder";
    if (totalComplexity < 100) return "1-2 months for a dedicated builder";
    return "2-3 months for a dedicated builder";
  }

  /**
   * Fallback roadmap when AI unavailable
   */
  private generateFallbackRoadmap(vision: string): GenerateRoadmapResponse {
    console.log("[RoadmapV3] Using fallback P0-P7 roadmap");

    const phases: RoadmapPhase[] = getAllPhaseTemplates().map((template) => ({
      phase_number: template.phase_number,
      phase_id: template.phase_id,
      title: template.title,
      goal: template.goal,
      pedagogical_purpose: template.pedagogical_purpose,
      visible_win: template.visible_win,
      master_prompt: generateMasterPrompt(template.phase_number, {
        user_goal: vision,
        vision_statement: vision,
      }),
      substeps: this.generateFallbackSubstepsForPhase(template),
      status: template.phase_number === 0 ? "active" : "locked",
    }));

    return {
      phases,
      total_phases: phases.length,
      estimated_timeline: "2-4 weeks",
      generated_by: "fallback",
    };
  }
}
