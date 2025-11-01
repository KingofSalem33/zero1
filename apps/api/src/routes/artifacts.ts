import { Router } from "express";
import { IncomingForm, File } from "formidable";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { supabase } from "../db";

const execAsync = promisify(exec);
import { uploadLimiter } from "../middleware/rateLimit";
import {
  analyzeDirectory,
  analyzeSingleFile,
  extractAndAnalyzeZip,
  type ArtifactSignals,
} from "../services/artifact-analyzer";
import { analyzeArtifactWithLLM } from "../services/llm-artifact-analyzer";
import {
  matchArtifactToRoadmap,
  mergeCompletionResults,
  type RoadmapDiff,
} from "../services/artifact-roadmap-matcher";
import {
  detectRollbackNeed,
  shouldAutoRollback,
} from "../services/rollback-detector";
import { generateCelebrationAndBriefing } from "../services/celebrationBriefing";
import { celebrationBriefingHelper } from "../services/celebrationBriefingHelper";
import { orchestrator } from "./projects";
import { streamingService } from "../infrastructure/ai/StreamingService";
import { detectIterationChanges } from "../services/llm-artifact-analyzer";
import { buildMomentumSummary } from "../services/momentum-summary";
import type { Response } from "express";

const router = Router();

// Store active SSE connections for artifact analysis status
const artifactStreamResponses = new Map<string, Response>();

// Configure upload directory
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Sanitize Git repository URL to prevent command injection
 */
function sanitizeGitUrl(url: string): string {
  // Only allow https:// and git:// protocols
  if (!url.startsWith("https://") && !url.startsWith("git://")) {
    throw new Error(
      "Invalid repository URL protocol. Only https:// and git:// are allowed.",
    );
  }

  // Remove any shell metacharacters
  if (/[;&|`$(){}[\]<>]/.test(url)) {
    throw new Error("Invalid characters in repository URL");
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error("Malformed repository URL");
  }

  return url;
}

/**
 * Sanitize Git branch name to prevent command injection
 */
function sanitizeBranch(branch: string): string {
  // Only allow alphanumeric, dash, underscore, and slash (for branch paths)
  if (!/^[a-zA-Z0-9/_-]+$/.test(branch)) {
    throw new Error(
      "Invalid branch name. Only alphanumeric characters, dash, underscore, and slash are allowed.",
    );
  }

  // Limit branch name length
  if (branch.length > 100) {
    throw new Error("Branch name too long");
  }

  return branch;
}

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and dangerous characters
  return filename
    .replace(/[/\\]/g, "") // Remove slashes
    .replace(/\.\./g, "") // Remove parent directory references
    .replace(/[^a-zA-Z0-9._-]/g, "_") // Replace special chars with underscore
    .substring(0, 255); // Limit length
}

/**
 * POST /api/artifacts/upload
 * Upload a file or zip for analysis (rate limited)
 */
router.post("/upload", uploadLimiter, (req, res) => {
  console.log("📤 [Artifacts] Upload request received");

  // Parse multipart form data
  const form = new IncomingForm({
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024, // 50MB limit
  });

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        console.error("❌ [Artifacts] Upload parse error:", err);
        return res.status(400).json({ error: "Failed to parse upload" });
      }

      const projectId = Array.isArray(fields.project_id)
        ? fields.project_id[0]
        : fields.project_id;

      if (!projectId) {
        return res.status(400).json({ error: "project_id is required" });
      }

      // Get the uploaded file
      const uploadedFile = Array.isArray(files.file)
        ? files.file[0]
        : files.file;

      if (!uploadedFile) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = uploadedFile as File;
      const originalFilename = file.originalFilename || "unknown";
      const filename = sanitizeFilename(originalFilename);
      const filePath = file.filepath;
      const fileSize = file.size;

      console.log(
        `📁 [Artifacts] Processing file: ${filename} (${fileSize} bytes)`,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let artifact: any = null; // Declare in outer scope for error handling

      try {
        // Determine artifact type
        const isZip = filename.endsWith(".zip");
        const artifactType = isZip ? "zip" : "single";

        // Run static analysis
        console.log("🔍 [Artifacts] Running static analysis...");
        let signals: ArtifactSignals;
        let extractedPath: string | null = null;

        if (isZip) {
          // Extract and analyze ZIP contents
          const result = await extractAndAnalyzeZip(filePath);
          signals = result.signals;
          extractedPath = result.extractedPath;
          console.log(`📦 [Artifacts] ZIP extracted to: ${extractedPath}`);
        } else {
          signals = await analyzeSingleFile(filePath);
        }

        console.log("✅ [Artifacts] Analysis complete:", signals);

        // Save artifact to database
        const { data: artifactData, error: artifactError } = await supabase
          .from("artifacts")
          .insert({
            project_id: projectId,
            type: artifactType,
            file_name: filename,
            file_path: filePath,
            size_bytes: fileSize,
            status: "uploaded",
          })
          .select()
          .single();

        if (artifactError || !artifactData) {
          console.error("❌ [Artifacts] Database error:", artifactError);
          return res.status(500).json({ error: "Failed to save artifact" });
        }

        artifact = artifactData; // Assign to outer scope variable

        // Save artifact signals
        const { error: signalsError } = await supabase
          .from("artifact_signals")
          .insert({
            artifact_id: artifact.id,
            artifact_type: signals.artifact_type,
            primary_file_types: signals.primary_file_types,
            content_hash: signals.content_hash,
            has_tests: signals.has_tests,
            has_linter: signals.has_linter,
            has_typescript: signals.has_typescript,
            has_prettier: signals.has_prettier,
            has_git: signals.has_git,
            last_commit_time: signals.last_commit_time,
            commit_count: signals.commit_count,
            has_deploy_config: signals.has_deploy_config,
            deploy_platform: signals.deploy_platform,
            file_count: signals.file_count,
            folder_depth: signals.folder_depth,
            readme_length: signals.readme_length,
            has_documentation: signals.has_documentation,
            tech_stack: signals.tech_stack,
          });

        if (signalsError) {
          console.error("❌ [Artifacts] Signals save error:", signalsError);
          // Non-fatal - continue
        }

        console.log("✅ [Artifacts] Artifact saved:", artifact.id);

        // Fetch project info for acknowledgment message
        const { data: project } = await supabase
          .from("projects")
          .select("*")
          .eq("id", projectId)
          .single();

        let acknowledgmentMessage = `✅ **Received:** ${filename}

I've analyzed your upload and it's being processed. I'll let you know when the analysis is complete.`;

        // Generate acknowledgment with current substep context if available
        if (project && project.roadmap) {
          const currentPhase = project.roadmap.phases?.find(
            (p: any) => p.phase_id === project.current_phase,
          );

          const currentSubstep = currentPhase?.substeps?.find(
            (s: any) => s.step_number === project.current_substep,
          );

          if (currentSubstep) {
            acknowledgmentMessage =
              celebrationBriefingHelper.generateArtifactAcknowledgment(
                filename,
                currentSubstep,
              );
          }
        }

        // Run LLM analysis in background (non-blocking)
        (async (): Promise<void> => {
          try {
            console.log("🤖 [Artifacts] Starting LLM analysis...");

            // Update status to analyzing
            await supabase
              .from("artifacts")
              .update({ status: "analyzing" })
              .eq("id", artifact.id);

            // Broadcast status change via SSE
            const analysisStreamResponse = artifactStreamResponses.get(
              artifact.id,
            );
            if (analysisStreamResponse) {
              streamingService.sendArtifactStatus(
                analysisStreamResponse,
                "analyzing",
                "Analyzing your artifact with AI...",
              );
            }

            // Get project context for analysis
            const { data: project } = await supabase
              .from("projects")
              .select("*")
              .eq("id", projectId)
              .single();

            // Get thread_id for this project
            const { data: thread } = await supabase
              .from("threads")
              .select("id")
              .eq("project_id", projectId)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            const threadId = thread?.id;
            console.log(
              'dY"? [Artifacts] Thread lookup: ' + (threadId || "not found"),
            );
            // Insert acknowledgment into thread to preserve narrative
            if (threadId && acknowledgmentMessage) {
              try {
                await supabase.from("messages").insert({
                  thread_id: threadId,
                  role: "assistant",
                  content: acknowledgmentMessage,
                  created_at: new Date().toISOString(),
                });
              } catch (e) {
                console.warn(
                  "[Artifacts] Failed to insert acknowledgment message:",
                  e,
                );
              }
            }
            console.log(
              `🔍 [Artifacts] Thread lookup: ${threadId || "not found"}`,
            );

            // Fetch previous artifact analyses AND signals for THIS substep
            const { data: previousArtifacts } = await supabase
              .from("artifacts")
              .select(
                `
                analysis,
                artifact_signals (*)
              `,
              )
              .eq("project_id", projectId)
              .eq("status", "analyzed")
              .not("analysis", "is", null)
              .order("analyzed_at", { ascending: true });

            // Filter to only include artifacts from the current substep
            const currentSubstepAnalyses =
              previousArtifacts
                ?.map((a) => a.analysis)
                .filter(
                  (analysis) =>
                    // Only include if it was for the same substep context
                    analysis && typeof analysis === "object",
                ) || [];

            // Extract previous signals for diff detection
            const previousSignals =
              previousArtifacts
                ?.map((a) => {
                  const signalArray = a.artifact_signals;
                  return Array.isArray(signalArray)
                    ? signalArray[0]
                    : signalArray;
                })
                .filter((s) => s) || [];

            const llmAnalysis = await analyzeArtifactWithLLM(
              extractedPath || filePath, // Use extracted directory if ZIP was uploaded
              signals,
              project
                ? {
                    vision_sentence: project.goal,
                    current_phase: project.current_phase,
                    current_substep: project.current_substep,
                    roadmap: project.roadmap,
                    previous_artifact_analyses: currentSubstepAnalyses,
                    previous_signals: previousSignals,
                  }
                : undefined,
            );

            // NEW: Match artifact to roadmap to detect completed substeps
            console.log("🎯 [Artifacts] Matching artifact to roadmap...");
            let roadmapDiff: RoadmapDiff | null = null;

            if (project && project.roadmap) {
              try {
                roadmapDiff = matchArtifactToRoadmap(
                  signals,
                  project.roadmap.phases || [],
                  undefined,
                  llmAnalysis, // Pass LLM analysis for content detection
                );

                console.log(
                  `✅ [Artifacts] Roadmap match complete: ${roadmapDiff.completed_substeps.length} substeps detected`,
                );

                // Merge new completions with existing
                const existingCompletions = project.completed_substeps || [];
                const mergedCompletions = mergeCompletionResults(
                  existingCompletions,
                  roadmapDiff.completed_substeps,
                );

                // Update project with new progress
                await supabase
                  .from("projects")
                  .update({
                    current_phase: `P${roadmapDiff.recommended_phase}`,
                    current_substep: roadmapDiff.recommended_substep,
                    completed_substeps: mergedCompletions,
                  })
                  .eq("id", projectId);

                console.log(
                  `📊 [Artifacts] Project updated: Phase P${roadmapDiff.recommended_phase}, Substep ${roadmapDiff.recommended_substep}`,
                );
              } catch (matchError) {
                console.error(
                  "⚠️ [Artifacts] Roadmap matching failed:",
                  matchError,
                );
                // Non-fatal - continue with LLM analysis
              }
            }

            // Build momentum summary (iteration diff + roadmap) before saving
            try {
              const previousAnalysis = currentSubstepAnalyses?.length
                ? currentSubstepAnalyses[currentSubstepAnalyses.length - 1]
                : null;
              const prevSignals = previousSignals?.length
                ? previousSignals[previousSignals.length - 1]
                : null;

              const iteration = prevSignals
                ? detectIterationChanges(
                    previousAnalysis as any,
                    prevSignals as any,
                    signals,
                  )
                : null;

              const momentumSummary = buildMomentumSummary({
                workType: signals.artifact_type || "artifact",
                iteration,
                roadmap: roadmapDiff,
                rollback: (llmAnalysis as any)?.rollback_warning
                  ? {
                      severity: (llmAnalysis as any).rollback_warning.severity,
                      reason: (llmAnalysis as any).rollback_warning.reason,
                    }
                  : null,
              });

              (llmAnalysis as any).momentum_summary = momentumSummary;
            } catch (e) {
              console.warn("[Artifacts] Momentum summary build failed:", e);
            }

            // Save LLM analysis results + roadmap diff
            await supabase
              .from("artifacts")
              .update({
                status: "analyzed",
                analyzed_at: new Date().toISOString(),
                analysis: llmAnalysis,
                completed_substeps: roadmapDiff?.completed_substeps || [],
                roadmap_diff: roadmapDiff?.changes_summary || null,
                progress_percentage: roadmapDiff?.progress_percentage || 0,
              })
              .eq("id", artifact.id);

            console.log("✅ [Artifacts] LLM analysis complete");

            // Store artifact feedback in the conversation thread for a cumulative narrative
            if (threadId) {
              try {
                const percent =
                  (llmAnalysis as any)?.substep_completion_percentage ?? 0;
                const missing = (llmAnalysis as any)?.missing_elements || [];
                const next = (llmAnalysis as any)?.next_steps || [];
                const detail = (llmAnalysis as any)?.detailed_analysis || "";

                const feedbackMessage = [
                  `🧪 Artifact Review — ${
                    signals.artifact_type?.toUpperCase?.() || "ARTIFACT"
                  } (${percent}% complete)`,
                  detail ? `\n${detail}` : "",
                  missing.length
                    ? `\n• Still Missing:\n${missing
                        .slice(0, 5)
                        .map((m: string) => `- ${m}`)
                        .join("\n")}`
                    : "",
                  next.length
                    ? `\n• Next Steps:\n${next
                        .slice(0, 5)
                        .map((n: string) => `- ${n}`)
                        .join("\n")}`
                    : "",
                ]
                  .filter(Boolean)
                  .join("\n");

                await supabase.from("messages").insert({
                  thread_id: threadId,
                  role: "assistant",
                  content: feedbackMessage,
                  created_at: new Date().toISOString(),
                });
                console.log(
                  "✅ [Artifacts] Artifact feedback stored in conversation thread",
                );
              } catch (e) {
                console.warn(
                  "[Artifacts] Failed to insert artifact feedback message:",
                  e,
                );
              }
            }

            // Broadcast completion via SSE
            const completionStreamResponse = artifactStreamResponses.get(
              artifact.id,
            );
            if (completionStreamResponse) {
              const progressMsg = roadmapDiff?.progress_percentage
                ? `${roadmapDiff.progress_percentage}% complete`
                : "Analysis complete";
              streamingService.sendArtifactStatus(
                completionStreamResponse,
                "analyzed",
                progressMsg,
              );
              const ms = (llmAnalysis as any)?.momentum_summary;
              if (ms) {
                streamingService.sendMomentumSummary(completionStreamResponse, {
                  summary: ms,
                });
                if (threadId) {
                  try {
                    await supabase.from("messages").insert({
                      thread_id: threadId,
                      role: "assistant",
                      content: ms,
                      created_at: new Date().toISOString(),
                    });
                  } catch (e) {
                    console.warn(
                      "[Artifacts] Failed to insert momentum summary message:",
                      e,
                    );
                  }
                }
              }
            }

            // ROLLBACK DETECTION: Check if user is stuck and needs to rollback
            const rollbackRecommendation = detectRollbackNeed(
              llmAnalysis,
              currentSubstepAnalyses,
              project.current_phase,
              project.current_substep,
              project.roadmap,
            );

            if (rollbackRecommendation.should_rollback) {
              console.log(
                `⚠️ [Rollback] Detected need for rollback: ${rollbackRecommendation.reason}`,
              );
              console.log(
                `   Evidence: ${rollbackRecommendation.evidence.join(", ")}`,
              );

              // Notify via SSE + thread about rollback recommendation
              {
                const rStream = artifactStreamResponses.get(artifact.id);
                if (rStream) {
                  streamingService.sendRollbackNotice(rStream, {
                    severity: rollbackRecommendation.severity,
                    reason: rollbackRecommendation.reason,
                  });
                }
                if (threadId) {
                  try {
                    await supabase.from("messages").insert({
                      thread_id: threadId,
                      role: "assistant",
                      content: `Rollback recommended: ${rollbackRecommendation.reason}`,
                      created_at: new Date().toISOString(),
                    });
                  } catch (e) {
                    console.warn(
                      "[Artifacts] Failed to insert rollback notice:",
                      e,
                    );
                  }
                }
              }
              // Auto-rollback if conditions are met
              if (
                shouldAutoRollback(
                  rollbackRecommendation,
                  currentSubstepAnalyses.length,
                )
              ) {
                console.log(
                  `🔄 [Rollback] Auto-rollback triggered to ${rollbackRecommendation.rollback_to_phase}`,
                );

                // Create checkpoint before rollback
                const { data: checkpoint } = await supabase
                  .from("checkpoints")
                  .insert({
                    project_id: projectId,
                    name: `Before rollback from ${project.current_phase}`,
                    reason: `Auto-rollback: ${rollbackRecommendation.reason}`,
                    created_by: "system",
                    current_phase: project.current_phase,
                    completed_substeps: project.completed_substeps,
                    roadmap_snapshot: project.roadmap,
                    project_state_hash: null,
                    artifact_ids: [artifact.id],
                  })
                  .select()
                  .single();

                if (checkpoint) {
                  console.log(
                    `💾 [Rollback] Checkpoint created: ${checkpoint.id}`,
                  );
                }

                // Execute rollback: revert to target phase/substep
                const updatedRoadmap = { ...project.roadmap };

                // Mark target phase and substep in roadmap
                const targetPhase = updatedRoadmap.phases?.find(
                  (p: any) =>
                    p.phase_id === rollbackRecommendation.rollback_to_phase,
                );

                if (targetPhase) {
                  // Mark all phases after target as incomplete
                  const targetPhaseNum = parseInt(
                    rollbackRecommendation.rollback_to_phase!.replace("P", ""),
                  );
                  updatedRoadmap.phases?.forEach((phase: any) => {
                    const phaseNum = parseInt(phase.phase_id.replace("P", ""));
                    if (phaseNum > targetPhaseNum) {
                      phase.completed = false;
                      phase.locked = true;
                      // Reset all substeps in future phases
                      phase.substeps?.forEach((substep: any) => {
                        substep.completed = false;
                      });
                    }
                  });

                  // Reset current phase substeps after rollback point
                  if (rollbackRecommendation.rollback_to_substep) {
                    targetPhase.substeps?.forEach((substep: any) => {
                      if (
                        substep.step_number >=
                        rollbackRecommendation.rollback_to_substep!
                      ) {
                        substep.completed = false;
                      }
                    });
                  }
                }

                // Update project with rollback state
                await supabase
                  .from("projects")
                  .update({
                    current_phase: rollbackRecommendation.rollback_to_phase,
                    current_substep:
                      rollbackRecommendation.rollback_to_substep || 1,
                    roadmap: updatedRoadmap,
                  })
                  .eq("id", projectId);

                // Add rollback guidance to artifact analysis
                (llmAnalysis as any).rollback_executed = true;
                (llmAnalysis as any).rollback_guidance =
                  rollbackRecommendation.guidance;

                console.log(
                  `✅ [Rollback] Project rolled back to ${rollbackRecommendation.rollback_to_phase}, substep ${rollbackRecommendation.rollback_to_substep}`,
                );

                // Update artifact with rollback info
                await supabase
                  .from("artifacts")
                  .update({
                    status: "analyzed",
                    analyzed_at: new Date().toISOString(),
                    analysis: llmAnalysis,
                    completed_substeps: [],
                    roadmap_diff: `ROLLBACK: ${rollbackRecommendation.reason}`,
                    progress_percentage: 0,
                  })
                  .eq("id", artifact.id);

                console.log(
                  `✅ [Rollback] Successfully executed rollback to ${rollbackRecommendation.rollback_to_phase}`,
                );

                // Broadcast rollback completion via SSE
                const rollbackStreamResponse = artifactStreamResponses.get(
                  artifact.id,
                );
                if (rollbackStreamResponse) {
                  streamingService.sendArtifactStatus(
                    rollbackStreamResponse,
                    "analyzed",
                    `Rollback to ${rollbackRecommendation.rollback_to_phase}`,
                  );
                }
                // Note: Response already sent before IIFE started
                return; // Exit early since we rolled back
              } else {
                // Warning only - add to analysis but don't rollback yet
                console.log(
                  `⚠️ [Rollback] Warning issued but auto-rollback not triggered`,
                );
                (llmAnalysis as any).rollback_warning = {
                  severity: rollbackRecommendation.severity,
                  reason: rollbackRecommendation.reason,
                  evidence: rollbackRecommendation.evidence,
                  guidance: rollbackRecommendation.guidance,
                };
              }
            }

            // Debug: Log completion percentage value
            console.log(
              `🔍 [Artifacts] Completion percentage value: ${llmAnalysis.substep_completion_percentage} (type: ${typeof llmAnalysis.substep_completion_percentage})`,
            );
            console.log(`🔍 [Artifacts] Has thread_id: ${!!threadId}`);

            // AUTO-COMPLETION: Check if substep requirements are 100% complete
            if (
              llmAnalysis.substep_completion_percentage === 100 &&
              project?.roadmap
            ) {
              console.log(
                "🎉 [Artifacts] Substep 100% complete - auto-advancing with celebration",
              );

              try {
                // Get current substep details for celebration

                const currentPhase = project.roadmap.phases?.find(
                  (p: any) => p.phase_id === project.current_phase,
                );

                const completedSubstep = currentPhase?.substeps?.find(
                  (s: any) => s.step_number === project.current_substep,
                );

                // Use ProjectStateManager to atomically update state
                const { state: newState, summary } =
                  await orchestrator.stateManager.applyProjectUpdate(
                    projectId,
                    {
                      completeSubstep: {
                        phase: project.current_phase,
                        substep: project.current_substep,
                      },
                      advanceSubstep: true,
                    },
                  );

                console.log(
                  `ARTIFACTS [State] ${newState.current_phase}/${newState.current_substep} | ${summary}`,
                );

                // Get next substep details for briefing
                const nextSubstep =
                  orchestrator.stateManager.getCurrentSubstep(newState);

                // Generate celebration + briefing if we have next substep
                if (completedSubstep && nextSubstep) {
                  const celebrationMessage =
                    await generateCelebrationAndBriefing(
                      project,
                      llmAnalysis,
                      newState,
                      completedSubstep,
                      nextSubstep,
                    );

                  console.log(
                    `🎊 [Artifacts] Celebration generated for next: ${celebrationMessage.nextSubstep.label}`,
                  );

                  // Store celebration in thread for user to see
                  if (threadId) {
                    console.log(
                      `💬 [Artifacts] Inserting celebration message into thread ${threadId}`,
                    );
                    const { error: insertError } = await supabase
                      .from("messages")
                      .insert({
                        thread_id: threadId,
                        role: "assistant",
                        content: celebrationMessage.fullMessage,
                        created_at: new Date().toISOString(),
                      });

                    if (insertError) {
                      console.error(
                        "❌ [Artifacts] Failed to insert celebration message:",
                        insertError,
                      );
                    } else {
                      console.log(
                        "✅ [Artifacts] Celebration message inserted successfully",
                      );
                    }
                  } else {
                    console.warn(
                      "⚠️ [Artifacts] No thread_id found - cannot insert celebration message",
                    );
                  }

                  // Update artifact with celebration info
                  await supabase
                    .from("artifacts")
                    .update({
                      celebration_message: celebrationMessage.fullMessage,
                    })
                    .eq("id", artifact.id);
                } else {
                  console.log(
                    "🏁 [Artifacts] Phase or project complete - no next substep",
                  );
                }
              } catch (stateError) {
                console.error(
                  "❌ [Artifacts] Error during state update/celebration:",
                  stateError,
                );
                // Non-fatal - artifact analysis still succeeded
              }
            } else if (llmAnalysis.substep_completion_percentage) {
              console.log(
                `📊 [Artifacts] Substep ${llmAnalysis.substep_completion_percentage}% complete - iteration continues`,
              );
              // Analysis complete - results will be shown in modal
            } else {
              console.log(
                "⚠️ [Artifacts] No substep_completion_percentage found",
              );
              // Analysis complete - results will be shown in modal
            }
          } catch (llmError) {
            console.error("❌ [Artifacts] LLM analysis failed:", llmError);
            await supabase
              .from("artifacts")
              .update({
                status: "failed",
                error_message: "LLM analysis failed",
              })
              .eq("id", artifact.id);

            // Broadcast failure via SSE
            const errorStreamResponse = artifactStreamResponses.get(
              artifact.id,
            );
            if (errorStreamResponse) {
              streamingService.sendArtifactStatus(
                errorStreamResponse,
                "failed",
                "Analysis failed - please try again",
              );
            }
          } finally {
            // Cleanup extracted ZIP directory if it exists
            if (extractedPath && fs.existsSync(extractedPath)) {
              try {
                fs.rmSync(extractedPath, { recursive: true, force: true });
                console.log(
                  `🗑️  [Artifacts] Cleaned up extracted directory: ${extractedPath}`,
                );
              } catch (cleanupError) {
                console.error(
                  `⚠️  [Artifacts] Failed to cleanup ${extractedPath}:`,
                  cleanupError,
                );
              }
            }
          }
        })();

        return res.json({
          ok: true,
          artifact: {
            id: artifact.id,
            file_name: filename,
            size_bytes: fileSize,
            signals,
            status: "analyzing",
          },
          acknowledgment: acknowledgmentMessage,
        });
      } catch (analysisError) {
        console.error("❌ [Artifacts] Analysis error:", analysisError);

        // Update artifact status to failed (if artifact was created)
        if (artifact?.id) {
          await supabase
            .from("artifacts")
            .update({
              status: "failed",
              error_message:
                analysisError instanceof Error
                  ? analysisError.message
                  : "Unknown error",
            })
            .eq("id", artifact.id); // ✅ Fixed: use artifact.id instead of projectId
        }

        return res.status(500).json({ error: "Failed to analyze artifact" });
      }
    } catch (error) {
      console.error("❌ [Artifacts] Upload error:", error);
      return res.status(500).json({ error: "Failed to upload artifact" });
    }
  });
});

/**
 * POST /api/artifacts/repo
 * Clone and analyze a GitHub repository
 */
router.post("/repo", uploadLimiter, async (req, res) => {
  try {
    const { project_id, repo_url, branch = "main" } = req.body;

    if (!project_id || !repo_url) {
      return res.status(400).json({
        error: "project_id and repo_url are required",
      });
    }

    // Sanitize inputs to prevent command injection
    let sanitizedUrl: string;
    let sanitizedBranch: string;

    try {
      sanitizedUrl = sanitizeGitUrl(repo_url);
      sanitizedBranch = sanitizeBranch(branch);
    } catch (sanitizeError) {
      console.error("❌ [Artifacts] Input sanitization failed:", sanitizeError);
      return res.status(400).json({
        error:
          sanitizeError instanceof Error
            ? sanitizeError.message
            : "Invalid input",
      });
    }

    console.log(
      `📦 [Artifacts] Cloning repo: ${sanitizedUrl} (branch: ${sanitizedBranch})`,
    );

    // Create temp directory for clone
    const repoName =
      sanitizedUrl.split("/").pop()?.replace(".git", "") || "repo";
    const sanitizedRepoName = sanitizeFilename(repoName);
    const clonePath = path.join(
      UPLOAD_DIR,
      `repo-${Date.now()}-${sanitizedRepoName}`,
    );

    // Ensure clonePath is within UPLOAD_DIR (additional safety)
    if (!clonePath.startsWith(UPLOAD_DIR)) {
      console.error("❌ [Artifacts] Path traversal attempt detected");
      return res.status(400).json({ error: "Invalid path" });
    }

    // Clone the repository using async exec (non-blocking)
    try {
      await execAsync(
        `git clone --depth 1 --branch "${sanitizedBranch}" -- "${sanitizedUrl}" "${clonePath}"`,
        { cwd: UPLOAD_DIR, timeout: 120000 }, // 2 minute timeout
      );
    } catch (cloneError) {
      console.error("❌ [Artifacts] Clone failed:", cloneError);
      return res.status(400).json({ error: "Failed to clone repository" });
    }

    console.log("🔍 [Artifacts] Analyzing repository...");

    // Analyze the cloned repository
    const signals = await analyzeDirectory(clonePath);

    console.log("✅ [Artifacts] Repository analysis complete");

    // Calculate total size (async)
    let sizeBytes = 0;
    try {
      const { stdout: sizeOutput } = await execAsync(`du -sb "${clonePath}"`, {
        encoding: "utf-8",
      });
      sizeBytes = parseInt(sizeOutput.split("\t")[0]);
    } catch (sizeError) {
      console.warn(
        "❌ [Artifacts] Failed to calculate size, using 0:",
        sizeError,
      );
    }

    // Save artifact to database
    const { data: artifact, error: artifactError } = await supabase
      .from("artifacts")
      .insert({
        project_id,
        type: "repo",
        repo_url,
        repo_branch: branch,
        file_path: clonePath,
        size_bytes: sizeBytes,
        status: "uploaded",
      })
      .select()
      .single();

    if (artifactError) {
      console.error("❌ [Artifacts] Database error:", artifactError);
      return res.status(500).json({ error: "Failed to save artifact" });
    }

    // Save artifact signals
    await supabase.from("artifact_signals").insert({
      artifact_id: artifact.id,
      artifact_type: signals.artifact_type,
      primary_file_types: signals.primary_file_types,
      content_hash: signals.content_hash,
      has_tests: signals.has_tests,
      has_linter: signals.has_linter,
      has_typescript: signals.has_typescript,
      has_prettier: signals.has_prettier,
      has_git: signals.has_git,
      last_commit_time: signals.last_commit_time,
      commit_count: signals.commit_count,
      has_deploy_config: signals.has_deploy_config,
      deploy_platform: signals.deploy_platform,
      file_count: signals.file_count,
      folder_depth: signals.folder_depth,
      readme_length: signals.readme_length,
      has_documentation: signals.has_documentation,
      tech_stack: signals.tech_stack,
    });

    console.log("✅ [Artifacts] Repository artifact saved:", artifact.id);

    return res.json({
      ok: true,
      artifact: {
        id: artifact.id,
        repo_url,
        branch,
        signals,
      },
    });
  } catch (error) {
    console.error("❌ [Artifacts] Repo error:", error);
    return res.status(500).json({ error: "Failed to process repository" });
  }
});

/**
 * GET /api/artifacts/stream/:artifactId
 * Open SSE connection for real-time artifact analysis status updates
 */
router.get("/stream/:artifactId", (req, res) => {
  const { artifactId } = req.params;

  console.log(
    `📡 [Artifacts] Client connecting to artifact stream: ${artifactId}`,
  );

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Store connection for broadcasting
  artifactStreamResponses.set(artifactId, res);

  // Send initial connected event
  streamingService.sendArtifactStatus(
    res,
    "connected",
    "Connected to artifact analysis stream",
  );

  // Cleanup on disconnect
  req.on("close", () => {
    console.log(
      `🔌 [Artifacts] Client disconnected from stream: ${artifactId}`,
    );
    artifactStreamResponses.delete(artifactId);
  });
});

/**
 * GET /api/artifacts/:artifactId
 * Get artifact details and analysis
 */
router.get("/:artifactId", async (req, res) => {
  try {
    const { artifactId } = req.params;

    const { data: artifact, error } = await supabase
      .from("artifacts")
      .select(
        `
        *,
        artifact_signals (*)
      `,
      )
      .eq("id", artifactId)
      .single();

    if (error || !artifact) {
      return res.status(404).json({ error: "Artifact not found" });
    }

    return res.json({
      ok: true,
      artifact,
    });
  } catch (error) {
    console.error("❌ [Artifacts] Fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch artifact" });
  }
});

export default router;
