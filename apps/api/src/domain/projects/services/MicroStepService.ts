/**
 * Micro-Step Service
 *
 * Manages the "Plan → Approve → Execute" micro-step workflow.
 * Breaks roadmap steps into 2-3 minute micro-tasks for better UX.
 */

import { makeOpenAI } from "../../../ai";
import { ENV } from "../../../env";
import { supabase } from "../../../db";
import { PromptTemplates } from "../../../infrastructure/ai/PromptTemplates";
import { microStepGenerationJsonSchema } from "../../../ai/schemas";
import { randomUUID } from "crypto";

export interface MicroStep {
  id: string;
  step_id: string;
  micro_step_number: number;
  title: string;
  description: string;
  estimated_duration: string;
  acceptance_criteria: string[];
  status: "pending" | "in_progress" | "completed" | "skipped";
  created_at?: string;
  completed_at?: string;
}

export interface GeneratePlanRequest {
  step_id: string;
  step_title: string;
  step_description: string;
  acceptance_criteria: string[];
  project_goal: string;
}

export interface GeneratePlanResponse {
  plan_generated: boolean;
  micro_steps: MicroStep[];
  total_micro_steps: number;
  estimated_total_duration: string;
}

/**
 * MicroStepService - Plan generation and approval workflow
 */
export class MicroStepService {
  /**
   * Generate micro-step plan for a roadmap step
   */
  async generatePlan(
    request: GeneratePlanRequest,
  ): Promise<GeneratePlanResponse> {
    console.log(
      `[MicroStepService] Generating plan for step: ${request.step_title}`,
    );

    const client = makeOpenAI();
    if (!client) {
      throw new Error("AI client not configured");
    }

    // Generate prompt
    const prompt = PromptTemplates.microStepGeneration(
      request.step_title,
      request.step_description,
      request.acceptance_criteria,
      request.project_goal,
    );

    console.log("[MicroStepService] Calling AI to generate micro-steps...");

    try {
      const result = await client.responses.create({
        model: ENV.OPENAI_MODEL_NAME,
        input: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7, // Balanced creativity for task breakdown
        max_output_tokens: 2000,
        text: {
          format: {
            type: "json_schema" as const,
            name: microStepGenerationJsonSchema.name,
            schema: microStepGenerationJsonSchema.schema,
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

      const responseText =
        assistantMessage.content
          ?.filter((c: any) => c.type === "text" || c.type === "output_text")
          .map((c: any) => c.text)
          .join("") || "";

      if (!responseText) {
        throw new Error("No text content in assistant message");
      }

      const parsed = JSON.parse(responseText);
      const microStepsData = parsed.micro_steps || [];

      console.log(
        `[MicroStepService] Generated ${microStepsData.length} micro-steps`,
      );

      // Calculate total duration estimate
      const totalMinutes = microStepsData.reduce((acc: number, ms: any) => {
        const duration = ms.estimated_duration || "3 minutes";
        const match = duration.match(/\d+/);
        return acc + (match ? parseInt(match[0]) : 3);
      }, 0);

      const estimatedTotalDuration =
        totalMinutes < 60
          ? `${totalMinutes} minutes`
          : `${Math.round(totalMinutes / 60)} hour${totalMinutes >= 120 ? "s" : ""}`;

      // Save micro-steps to database
      const microStepsToInsert = microStepsData.map((ms: any) => ({
        id: randomUUID(),
        step_id: request.step_id,
        micro_step_number: ms.micro_step_number,
        title: ms.title,
        description: ms.description,
        estimated_duration: ms.estimated_duration,
        acceptance_criteria: ms.acceptance_criteria,
        status: "pending",
        created_at: new Date().toISOString(),
      }));

      const { data: insertedMicroSteps, error: insertError } = await supabase
        .from("micro_steps")
        .insert(microStepsToInsert)
        .select();

      if (insertError) {
        console.error(
          "[MicroStepService] Error inserting micro-steps:",
          insertError,
        );
        throw new Error(`Failed to save micro-steps: ${insertError.message}`);
      }

      // Update roadmap step plan_status to 'generated'
      const { error: updateError } = await supabase
        .from("roadmap_steps")
        .update({ plan_status: "generated", current_micro_step: 0 })
        .eq("id", request.step_id);

      if (updateError) {
        console.error(
          "[MicroStepService] Error updating step plan_status:",
          updateError,
        );
      }

      return {
        plan_generated: true,
        micro_steps: insertedMicroSteps || [],
        total_micro_steps: microStepsData.length,
        estimated_total_duration: estimatedTotalDuration,
      };
    } catch (error) {
      console.error("[MicroStepService] Error generating plan:", error);
      throw error;
    }
  }

  /**
   * Approve the generated plan and start execution
   */
  async approvePlan(step_id: string): Promise<{ approved: boolean }> {
    console.log(`[MicroStepService] Approving plan for step: ${step_id}`);

    // Update plan_status to 'approved' and set current_micro_step to 1
    const { error } = await supabase
      .from("roadmap_steps")
      .update({
        plan_status: "approved",
        current_micro_step: 1,
      })
      .eq("id", step_id);

    if (error) {
      console.error("[MicroStepService] Error approving plan:", error);
      throw new Error(`Failed to approve plan: ${error.message}`);
    }

    // Mark first micro-step as in_progress
    const { error: microStepError } = await supabase
      .from("micro_steps")
      .update({ status: "in_progress" })
      .eq("step_id", step_id)
      .eq("micro_step_number", 1);

    if (microStepError) {
      console.warn(
        "[MicroStepService] Could not mark first micro-step as in_progress:",
        microStepError,
      );
    }

    return { approved: true };
  }

  /**
   * Reject plan and regenerate
   */
  async rejectPlan(step_id: string): Promise<{ rejected: boolean }> {
    console.log(`[MicroStepService] Rejecting plan for step: ${step_id}`);

    // Delete existing micro-steps
    const { error: deleteError } = await supabase
      .from("micro_steps")
      .delete()
      .eq("step_id", step_id);

    if (deleteError) {
      console.error(
        "[MicroStepService] Error deleting micro-steps:",
        deleteError,
      );
      throw new Error(`Failed to reject plan: ${deleteError.message}`);
    }

    // Reset plan_status to 'not_generated'
    const { error: updateError } = await supabase
      .from("roadmap_steps")
      .update({
        plan_status: "not_generated",
        current_micro_step: 0,
      })
      .eq("id", step_id);

    if (updateError) {
      console.error(
        "[MicroStepService] Error resetting plan_status:",
        updateError,
      );
      throw new Error(`Failed to reset plan status: ${updateError.message}`);
    }

    return { rejected: true };
  }

  /**
   * Get micro-steps for a roadmap step
   */
  async getMicroSteps(step_id: string): Promise<MicroStep[]> {
    const { data, error } = await supabase
      .from("micro_steps")
      .select("*")
      .eq("step_id", step_id)
      .order("micro_step_number", { ascending: true });

    if (error) {
      console.error("[MicroStepService] Error fetching micro-steps:", error);
      throw new Error(`Failed to fetch micro-steps: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Complete a micro-step and move to next
   */
  async completeMicroStep(
    step_id: string,
    micro_step_number: number,
  ): Promise<{ completed: boolean; next_micro_step?: number }> {
    console.log(
      `[MicroStepService] Completing micro-step ${micro_step_number} for step: ${step_id}`,
    );

    // Mark current micro-step as completed
    const { error: completeError } = await supabase
      .from("micro_steps")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("step_id", step_id)
      .eq("micro_step_number", micro_step_number);

    if (completeError) {
      console.error(
        "[MicroStepService] Error completing micro-step:",
        completeError,
      );
      throw new Error(
        `Failed to complete micro-step: ${completeError.message}`,
      );
    }

    // Get total micro-steps
    const { data: allMicroSteps } = await supabase
      .from("micro_steps")
      .select("micro_step_number")
      .eq("step_id", step_id)
      .order("micro_step_number", { ascending: true });

    const totalMicroSteps = allMicroSteps?.length || 0;
    const nextMicroStep = micro_step_number + 1;

    // Check if there's a next micro-step
    if (nextMicroStep <= totalMicroSteps) {
      // Update roadmap step to point to next micro-step
      await supabase
        .from("roadmap_steps")
        .update({ current_micro_step: nextMicroStep })
        .eq("id", step_id);

      // Mark next micro-step as in_progress
      await supabase
        .from("micro_steps")
        .update({ status: "in_progress" })
        .eq("step_id", step_id)
        .eq("micro_step_number", nextMicroStep);

      return { completed: true, next_micro_step: nextMicroStep };
    } else {
      // All micro-steps complete - mark step as complete
      await supabase
        .from("roadmap_steps")
        .update({
          current_micro_step: 0,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", step_id);

      return { completed: true };
    }
  }
}
