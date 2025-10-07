import { Router } from "express";
import { IncomingForm, File } from "formidable";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { supabase } from "../db";
import {
  analyzeDirectory,
  analyzeSingleFile,
  type ArtifactSignals,
} from "../services/artifact-analyzer";
import { analyzeArtifactWithLLM } from "../services/llm-artifact-analyzer";
import {
  matchArtifactToRoadmap,
  mergeCompletionResults,
  type RoadmapDiff,
} from "../services/artifact-roadmap-matcher";

const router = Router();

// Configure upload directory
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * POST /api/artifacts/upload
 * Upload a file or zip for analysis
 */
router.post("/upload", (req, res) => {
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
      const filename = file.originalFilename || "unknown";
      const filePath = file.filepath;
      const fileSize = file.size;

      console.log(
        `📁 [Artifacts] Processing file: ${filename} (${fileSize} bytes)`,
      );

      try {
        // Determine artifact type
        const isZip = filename.endsWith(".zip");
        const artifactType = isZip ? "zip" : "single";

        // Run static analysis
        console.log("🔍 [Artifacts] Running static analysis...");
        let signals: ArtifactSignals;

        if (isZip) {
          // For zip files, extract and analyze
          // TODO: Implement zip extraction
          signals = await analyzeSingleFile(filePath);
        } else {
          signals = await analyzeSingleFile(filePath);
        }

        console.log("✅ [Artifacts] Analysis complete:", signals);

        // Save artifact to database
        const { data: artifact, error: artifactError } = await supabase
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

        if (artifactError) {
          console.error("❌ [Artifacts] Database error:", artifactError);
          return res.status(500).json({ error: "Failed to save artifact" });
        }

        // Save artifact signals
        const { error: signalsError } = await supabase
          .from("artifact_signals")
          .insert({
            artifact_id: artifact.id,
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

        // Run LLM analysis in background (non-blocking)
        (async () => {
          try {
            console.log("🤖 [Artifacts] Starting LLM analysis...");

            // Update status to analyzing
            await supabase
              .from("artifacts")
              .update({ status: "analyzing" })
              .eq("id", artifact.id);

            // Get project context for analysis
            const { data: project } = await supabase
              .from("projects")
              .select("*")
              .eq("id", projectId)
              .single();

            // Fetch previous artifact analyses for THIS substep to build iteration history
            const { data: previousArtifacts } = await supabase
              .from("artifacts")
              .select("analysis")
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

            const llmAnalysis = await analyzeArtifactWithLLM(
              filePath,
              signals,
              project
                ? {
                    vision_sentence: project.goal,
                    current_phase: project.current_phase,
                    current_substep: project.current_substep,
                    roadmap: project.roadmap,
                    previous_artifact_analyses: currentSubstepAnalyses,
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

            // AUTO-COMPLETION: Check if substep requirements are 100% complete
            if (
              llmAnalysis.substep_completion_percentage === 100 &&
              project?.roadmap
            ) {
              console.log(
                "🎉 [Artifacts] Substep 100% complete - auto-advancing",
              );

              const updatedRoadmap = { ...project.roadmap };
              const currentPhase = updatedRoadmap.phases?.find(
                (p: any) => p.phase_id === project.current_phase,
              );

              if (currentPhase) {
                // Mark current substep as completed
                const currentSubstep = currentPhase.substeps?.find(
                  (s: any) => s.step_number === project.current_substep,
                );

                if (currentSubstep) {
                  currentSubstep.completed = true;
                  console.log(
                    `✅ [Artifacts] Marked substep ${project.current_substep} as complete`,
                  );
                }

                // Find next uncompleted substep in current phase
                const nextSubstep = currentPhase.substeps?.find(
                  (s: any) =>
                    s.step_number > project.current_substep && !s.completed,
                );

                if (nextSubstep) {
                  // Advance to next substep in same phase
                  await supabase
                    .from("projects")
                    .update({
                      current_substep: nextSubstep.step_number,
                      roadmap: updatedRoadmap,
                    })
                    .eq("id", projectId);

                  console.log(
                    `📈 [Artifacts] Advanced to substep ${nextSubstep.step_number}: ${nextSubstep.label}`,
                  );
                } else {
                  // All substeps in phase complete - mark phase complete
                  currentPhase.completed = true;
                  console.log(
                    `🎊 [Artifacts] Phase ${project.current_phase} complete!`,
                  );

                  // Find next unlocked phase
                  const currentPhaseNum = parseInt(
                    project.current_phase.replace("P", ""),
                  );
                  const nextPhase = updatedRoadmap.phases?.find(
                    (p: any) =>
                      parseInt(p.phase_id.replace("P", "")) ===
                        currentPhaseNum + 1 && !p.locked,
                  );

                  if (nextPhase) {
                    // Advance to first substep of next phase
                    const firstSubstep = nextPhase.substeps?.[0];
                    if (firstSubstep) {
                      await supabase
                        .from("projects")
                        .update({
                          current_phase: nextPhase.phase_id,
                          current_substep: firstSubstep.step_number,
                          roadmap: updatedRoadmap,
                        })
                        .eq("id", projectId);

                      console.log(
                        `🚀 [Artifacts] Advanced to ${nextPhase.phase_id}: ${nextPhase.goal}`,
                      );
                    }
                  } else {
                    console.log(
                      "🏁 [Artifacts] All phases complete - project finished!",
                    );
                  }
                }
              }
            } else if (llmAnalysis.substep_completion_percentage) {
              console.log(
                `📊 [Artifacts] Substep ${llmAnalysis.substep_completion_percentage}% complete - iteration continues`,
              );
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
        });
      } catch (analysisError) {
        console.error("❌ [Artifacts] Analysis error:", analysisError);

        // Update artifact status to failed
        await supabase
          .from("artifacts")
          .update({
            status: "failed",
            error_message:
              analysisError instanceof Error
                ? analysisError.message
                : "Unknown error",
          })
          .eq("id", projectId);

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
router.post("/repo", async (req, res) => {
  try {
    const { project_id, repo_url, branch = "main" } = req.body;

    if (!project_id || !repo_url) {
      return res.status(400).json({
        error: "project_id and repo_url are required",
      });
    }

    console.log(`📦 [Artifacts] Cloning repo: ${repo_url} (branch: ${branch})`);

    // Create temp directory for clone
    const repoName = repo_url.split("/").pop()?.replace(".git", "") || "repo";
    const clonePath = path.join(UPLOAD_DIR, `repo-${Date.now()}-${repoName}`);

    // Clone the repository
    try {
      execSync(
        `git clone --depth 1 --branch ${branch} ${repo_url} "${clonePath}"`,
        {
          stdio: "inherit",
        },
      );
    } catch (cloneError) {
      console.error("❌ [Artifacts] Clone failed:", cloneError);
      return res.status(400).json({ error: "Failed to clone repository" });
    }

    console.log("🔍 [Artifacts] Analyzing repository...");

    // Analyze the cloned repository
    const signals = await analyzeDirectory(clonePath);

    console.log("✅ [Artifacts] Repository analysis complete");

    // Calculate total size
    const sizeOutput = execSync(`du -sb "${clonePath}"`, {
      encoding: "utf-8",
    });
    const sizeBytes = parseInt(sizeOutput.split("\t")[0]);

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

/**
 * GET /api/artifacts/project/:projectId
 * Get all artifacts for a project
 */
router.get("/project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: artifacts, error } = await supabase
      .from("artifacts")
      .select(
        `
        *,
        artifact_signals (*)
      `,
      )
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("❌ [Artifacts] Fetch error:", error);
      return res.status(500).json({ error: "Failed to fetch artifacts" });
    }

    return res.json({
      ok: true,
      artifacts: artifacts || [],
    });
  } catch (error) {
    console.error("❌ [Artifacts] Fetch error:", error);
    return res.status(500).json({ error: "Failed to fetch artifacts" });
  }
});

export default router;
