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
import { PromptTemplates } from "../../../infrastructure/ai/PromptTemplates";

export interface PhaseSubstep {
  substep_number: number;
  title: string;
  description: string;
  acceptance_criteria: string[];
  estimated_complexity: number;
  status: "pending" | "active" | "completed" | "skipped";
  master_prompt?: string; // Substep-specific master prompt
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
  build_approach?: "code" | "platform" | "auto";
  project_purpose?: "personal" | "business" | "learning" | "creative";
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
    // Use centralized PromptTemplates.substepGeneration
    const promptText = PromptTemplates.substepGeneration(
      template.goal,
      template.phase_id,
      request.vision,
      undefined, // No previous phases context at generation time
    );

    // Add phase constraints for better substep generation
    const phaseConstraints = PromptTemplates.getPhaseConstraints(
      template.phase_id,
    );

    // Build approach guidance for LLM
    let buildApproachGuidance = "";
    if (request.build_approach === "platform") {
      buildApproachGuidance = `\n**BUILD APPROACH: NO-CODE/LOW-CODE PLATFORMS**
- User wants to use existing platforms (Shopify, Wix, Bubble, Ghost, Substack, etc.)
- Substeps should focus on platform setup, configuration, and using platform features
- DO NOT suggest writing code, installing development tools, or custom programming
- Recommend appropriate platforms for this type of project
- Focus on achieving goals through platform capabilities\n`;
    } else if (request.build_approach === "code") {
      buildApproachGuidance = `\n**BUILD APPROACH: CUSTOM CODE**
- User wants to build with code (has technical skills or wants to learn)
- Substeps should include development environment setup, coding tasks, and deployment
- Suggest appropriate frameworks, languages, and tools for this project
- Include steps for version control, testing, and best practices\n`;
    } else {
      // "auto" - let LLM decide based on project vision
      buildApproachGuidance = `\n**BUILD APPROACH: FLEXIBLE**
- Choose the best approach (platform vs code) based on the project vision
- For simple e-commerce/content sites: prefer platforms (Shopify, Wix, Ghost)
- For custom features, complex logic, or unique requirements: prefer code
- Consider user skill level: ${request.user_skill_level || "beginner"}\n`;
    }

    // Project purpose guidance for LLM
    let projectPurposeGuidance = "";
    if (request.project_purpose === "business") {
      projectPurposeGuidance = `\n**PROJECT PURPOSE: BUSINESS/REVENUE**
- User wants to generate revenue or build a sustainable business
- Focus on revenue-generating features (payments, subscriptions, monetization)
- Include customer acquisition, validation, and market testing steps
- Prioritize features that drive conversions, sales, and business metrics
- Consider scalability and professional polish from the start\n`;
    } else if (request.project_purpose === "learning") {
      projectPurposeGuidance = `\n**PROJECT PURPOSE: LEARNING/EDUCATION**
- User is building this primarily to learn and develop skills
- Provide detailed explanations and teaching moments in substeps
- Include best practices and explain WHY decisions are made
- Build from fundamentals to maximize learning opportunities
- Focus on understanding core concepts, not just getting it working
- Encourage experimentation and exploration\n`;
    } else if (request.project_purpose === "creative") {
      projectPurposeGuidance = `\n**PROJECT PURPOSE: CREATIVE/PORTFOLIO**
- User wants to showcase their abilities and creative vision
- Focus on polish, aesthetics, and impressive features
- Include documentation, case study elements, and presentation
- Prioritize unique, standout implementations that demonstrate skill
- Consider how this will look in a portfolio or to potential clients
- Quality and visual impact matter more than speed\n`;
    } else {
      // "personal" or default
      projectPurposeGuidance = `\n**PROJECT PURPOSE: PERSONAL USE**
- User is building for themselves or close friends/family
- No need for public-facing polish or enterprise scale
- Focus on solving the specific problem quickly and effectively
- Can skip features like user accounts, analytics, marketing pages
- Prioritize functionality over aesthetics
- Keep it simple and maintainable\n`;
    }

    const enhancedPrompt = `${promptText}

${phaseConstraints}

${buildApproachGuidance}
${projectPurposeGuidance}
${request.clarification_context ? `\n**ADDITIONAL CONTEXT:**\n${request.clarification_context}\n` : ""}

Output ONLY the structured JSON. No commentary.`;

    const result = await client.responses.create({
      model: ENV.OPENAI_MODEL_NAME,
      input: [{ role: "user", content: enhancedPrompt }],
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

    // Map to PhaseSubstep interface with unique master prompts
    // Get completed substeps context (empty at generation time)
    const completedSubsteps = "None yet - this is the first substep";

    return parsed.substeps.map((substep: any, index: number) => {
      // Use centralized PromptTemplates.executionSystem for substep master prompt
      const substepMasterPrompt = PromptTemplates.executionSystem(
        request.vision, // projectGoal
        template.goal, // phaseGoal
        substep.title, // substepLabel
        completedSubsteps, // completedSubsteps
        template.master_prompt_template, // masterPrompt (phase-level guidance)
        undefined, // cumulativeContext (not available at generation time)
        substep.description, // substepDescription - CRITICAL for focus!
        substep.acceptance_criteria, // acceptanceCriteria - CRITICAL for tracking!
      );

      return {
        substep_number: index + 1,
        title: substep.title,
        description: substep.description,
        acceptance_criteria: substep.acceptance_criteria,
        estimated_complexity: substep.estimated_complexity,
        status:
          index === 0 && template.phase_number === 0 ? "active" : "pending",
        master_prompt: substepMasterPrompt,
      };
    });
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
