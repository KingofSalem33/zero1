/**
 * Activity Logger Service
 * Simple, non-blocking activity logging for analytics
 */

import { supabase } from "../db";

interface ActivityContext {
  userId?: string;
  projectId?: string;
  sessionId?: string;
}

interface ActivityMetadata {
  [key: string]: any;
}

/**
 * Log an activity to the activity_log table
 * Fire-and-forget: errors are logged but don't block execution
 */
export async function logActivity(
  action: string,
  context: ActivityContext,
  metadata: ActivityMetadata = {},
): Promise<void> {
  try {
    // Non-blocking insert
    supabase
      .from("activity_log")
      .insert({
        user_id: context.userId || null,
        project_id: context.projectId || null,
        session_id: context.sessionId || null,
        action,
        metadata,
      })
      .then(({ error }) => {
        if (error) {
          console.error("[ActivityLogger] Error logging activity:", {
            action,
            error: error.message,
          });
        }
      });
  } catch (error) {
    // Silently fail - analytics should never break the app
    console.error("[ActivityLogger] Exception logging activity:", error);
  }
}

/**
 * Capture a project vision before roadmap generation
 */
export async function captureVision(data: {
  userId: string;
  rawVision: string;
  buildApproach?: string;
  projectPurpose?: string;
  sessionId?: string;
  userAgent?: string;
}): Promise<{ id: string } | null> {
  try {
    const { data: visionRecord, error } = await supabase
      .from("project_visions")
      .insert({
        user_id: data.userId,
        raw_vision: data.rawVision,
        vision_length: data.rawVision.length,
        build_approach: data.buildApproach || null,
        project_purpose: data.projectPurpose || null,
        session_id: data.sessionId || null,
        user_agent: data.userAgent || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[ActivityLogger] Error capturing vision:", error);
      return null;
    }

    return visionRecord;
  } catch (error) {
    console.error("[ActivityLogger] Exception capturing vision:", error);
    return null;
  }
}

/**
 * Link a vision to a generated roadmap/project
 */
export async function linkVisionToProject(
  visionId: string,
  projectId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("project_visions")
      .update({
        roadmap_generated_at: new Date().toISOString(),
        project_id: projectId,
      })
      .eq("id", visionId);

    if (error) {
      console.error("[ActivityLogger] Error linking vision to project:", error);
    }
  } catch (error) {
    console.error("[ActivityLogger] Exception linking vision:", error);
  }
}

/**
 * Common activity actions (for type safety and consistency)
 */
export const ActivityActions = {
  // Roadmap lifecycle
  ROADMAP_GENERATION_STARTED: "roadmap.generation_started",
  ROADMAP_GENERATED: "roadmap.generated",
  ROADMAP_GENERATION_FAILED: "roadmap.generation_failed",

  // Step lifecycle
  STEP_STARTED: "step.started",
  STEP_COMPLETED: "step.completed",
  STEP_SKIPPED: "step.skipped",

  // Artifacts
  ARTIFACT_UPLOADED: "artifact.uploaded",
  ARTIFACT_ANALYZED: "artifact.analyzed",
  ARTIFACT_FEEDBACK_GENERATED: "artifact.feedback_generated",

  // Completion suggestions
  COMPLETION_SUGGESTED: "completion.suggested",
  COMPLETION_ACCEPTED: "completion.accepted",
  COMPLETION_REJECTED: "completion.rejected",

  // Checkpoints
  CHECKPOINT_CREATED: "checkpoint.created",
  CHECKPOINT_RESTORED: "checkpoint.restored",

  // Chat
  CHAT_MESSAGE_SENT: "chat.message_sent",
  CHAT_RESPONSE_RECEIVED: "chat.response_received",

  // Project lifecycle
  PROJECT_CREATED: "project.created",
  PROJECT_RESUMED: "project.resumed",
  PROJECT_COMPLETED: "project.completed",
} as const;

/**
 * Helper: Log step completion
 */
export async function logStepCompletion(
  userId: string,
  projectId: string,
  stepId: string,
  metadata: {
    phaseNumber?: number;
    stepNumber?: number;
    duration?: number;
    manualComplete?: boolean;
  } = {},
): Promise<void> {
  await logActivity(
    ActivityActions.STEP_COMPLETED,
    { userId, projectId },
    {
      stepId,
      ...metadata,
    },
  );
}

/**
 * Helper: Log artifact upload
 */
export async function logArtifactUpload(
  userId: string,
  projectId: string,
  metadata: {
    artifactId?: string;
    artifactType?: string;
    fileSize?: number;
    iteration?: number;
  } = {},
): Promise<void> {
  await logActivity(
    ActivityActions.ARTIFACT_UPLOADED,
    { userId, projectId },
    metadata,
  );
}

/**
 * Helper: Log completion suggestion
 */
export async function logCompletionSuggestion(
  userId: string,
  projectId: string,
  metadata: {
    stepId?: string;
    confidence?: number;
    accepted?: boolean;
  } = {},
): Promise<void> {
  await logActivity(
    ActivityActions.COMPLETION_SUGGESTED,
    { userId, projectId },
    metadata,
  );
}
