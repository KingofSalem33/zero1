/**
 * Artifact Upload Routes (V2 Simplified)
 *
 * Handles file, folder, and repository uploads for V2 projects.
 * All V1-specific analysis, celebration, and rollback logic has been removed.
 */

import { Router } from "express";
import { IncomingForm, File } from "formidable";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { supabase } from "../db";
import { uploadLimiter, readOnlyLimiter } from "../middleware/rateLimit";
import { analyzeArtifact } from "../services/artifactAnalyzer";
import { threadService } from "../services/threadService";

const execAsync = promisify(exec);
const router = Router();

// Configure upload directory
const UPLOAD_DIR = path.join(__dirname, "../../uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Sanitize Git repository URL to prevent command injection
 */
function sanitizeGitUrl(url: string): string {
  if (!url.startsWith("https://") && !url.startsWith("git://")) {
    throw new Error(
      "Invalid repository URL protocol. Only https:// and git:// are allowed.",
    );
  }

  if (/[;&|`$(){}[\]<>]/.test(url)) {
    throw new Error("Invalid characters in repository URL");
  }

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
  if (!/^[a-zA-Z0-9/_-]+$/.test(branch)) {
    throw new Error(
      "Invalid branch name. Only alphanumeric characters, dash, underscore, and slash are allowed.",
    );
  }

  if (branch.length > 100) {
    throw new Error("Branch name too long");
  }

  return branch;
}

/**
 * Sanitize filename to prevent path traversal
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\]/g, "")
    .replace(/\.\./g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .substring(0, 255);
}

/**
 * POST /artifacts/upload
 * Upload a file, folder (zip), or URL reference
 */
router.post("/upload", uploadLimiter, (req, res) => {
  const form = new IncomingForm({
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    filter: function ({ originalFilename }) {
      // Block potentially dangerous file types
      const dangerous = /\.(exe|bat|cmd|sh|ps1|app|deb|rpm)$/i;
      if (originalFilename && dangerous.test(originalFilename)) {
        return false;
      }
      return true;
    },
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ [Artifacts] Upload error:", err);
      return res.status(500).json({ error: "File upload failed" });
    }

    try {
      const projectId = Array.isArray(fields.project_id)
        ? fields.project_id[0]
        : fields.project_id;

      if (!projectId) {
        return res.status(400).json({ error: "project_id is required" });
      }

      // Handle file upload
      const uploadedFile = Array.isArray(files.file)
        ? files.file[0]
        : files.file;

      if (!uploadedFile) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const file = uploadedFile as File;
      const filename = sanitizeFilename(file.originalFilename || "unknown");
      const filePath = file.filepath;

      console.log(
        `📤 [Artifacts] Uploaded: ${filename} for project ${projectId}`,
      );

      // Extract zip if needed
      let extractedPath: string | null = null;
      if (filename.endsWith(".zip")) {
        try {
          const extractDir = path.join(
            UPLOAD_DIR,
            `${path.basename(filePath)}_extracted`,
          );
          fs.mkdirSync(extractDir, { recursive: true });
          await execAsync(`unzip -q "${filePath}" -d "${extractDir}"`);
          extractedPath = extractDir;
          console.log(`📦 [Artifacts] Extracted zip to: ${extractDir}`);
        } catch (error) {
          console.error("❌ [Artifacts] Zip extraction failed:", error);
        }
      }

      // Save artifact to database
      const { data: artifact, error: dbError } = await supabase
        .from("artifacts")
        .insert({
          project_id: projectId,
          type: filename.endsWith(".zip") ? "zip" : "single",
          file_path: extractedPath || filePath,
          file_name: filename,
          status: "uploaded",
        })
        .select()
        .single();

      if (dbError) {
        console.error("❌ [Artifacts] DB error:", dbError);
        return res.status(500).json({ error: "Failed to save artifact" });
      }

      console.log(`✅ [Artifacts] Saved artifact: ${artifact.id}`);

      // Analyze artifact against current step (async, don't block response)
      // Get or create thread for this project
      console.log(
        `[Artifacts] Triggering analysis for artifact ${artifact.id}`,
      );
      analyzeAndPostFeedback(
        artifact.id,
        projectId,
        extractedPath || filePath,
        filename,
      ).catch((error) => {
        console.error("❌ [Artifacts] Analysis failed:", error);
      });

      return res.status(200).json({
        artifact_id: artifact.id,
        filename,
        status: "uploaded",
      });
    } catch (error) {
      console.error("❌ [Artifacts] Processing error:", error);
      return res.status(500).json({ error: "Failed to process artifact" });
    }
  });
});

/**
 * POST /artifacts/repo
 * Clone a Git repository
 */
router.post("/repo", uploadLimiter, async (req, res) => {
  try {
    const { project_id, thread_id, repo_url, branch = "main" } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: "project_id is required" });
    }

    if (!repo_url) {
      return res.status(400).json({ error: "repo_url is required" });
    }

    const sanitizedUrl = sanitizeGitUrl(repo_url);
    const sanitizedBranch = sanitizeBranch(branch);

    console.log(
      `📦 [Artifacts] Cloning repo: ${sanitizedUrl} (${sanitizedBranch})`,
    );

    // Create temp directory for clone
    const repoDir = path.join(UPLOAD_DIR, `repo_${Date.now()}`);
    fs.mkdirSync(repoDir, { recursive: true });

    // Clone repository
    await execAsync(
      `git clone --depth 1 --branch ${sanitizedBranch} "${sanitizedUrl}" "${repoDir}"`,
    );

    console.log(`✅ [Artifacts] Cloned repo to: ${repoDir}`);

    // Save artifact to database
    const { data: artifact, error: dbError } = await supabase
      .from("artifacts")
      .insert({
        project_id,
        type: "repo",
        file_path: repoDir,
        repo_url: sanitizedUrl,
        repo_branch: sanitizedBranch,
        status: "uploaded",
      })
      .select()
      .single();

    if (dbError) {
      console.error("❌ [Artifacts] DB error:", dbError);
      return res.status(500).json({ error: "Failed to save artifact" });
    }

    // Send acknowledgment to thread
    if (thread_id) {
      try {
        const { error: messageError } = await supabase.from("messages").insert({
          thread_id: thread_id,
          role: "assistant",
          content: `✅ **Repository cloned:** ${repo_url}\n\nBranch: ${sanitizedBranch}\n\nI've saved the repository. You can reference it in our conversation.`,
        });

        if (messageError) {
          console.error("❌ [Artifacts] Failed to post message:", messageError);
        } else {
          console.log(
            `✅ [Artifacts] Posted acknowledgment to thread ${thread_id}`,
          );
        }
      } catch (error) {
        console.error("❌ [Artifacts] Failed to post message:", error);
      }
    }

    return res.status(200).json({
      artifact_id: artifact.id,
      repo_url: sanitizedUrl,
      branch: sanitizedBranch,
      status: "cloned",
    });
  } catch (error: any) {
    console.error("❌ [Artifacts] Repo clone error:", error);
    return res.status(500).json({
      error: "Failed to clone repository",
      details: error.message,
    });
  }
});

/**
 * GET /artifacts/:artifactId
 * Get artifact details
 */
router.get("/:artifactId", async (req, res) => {
  try {
    const { artifactId } = req.params;

    const { data: artifact, error } = await supabase
      .from("artifacts")
      .select("*")
      .eq("id", artifactId)
      .single();

    if (error || !artifact) {
      return res.status(404).json({ error: "Artifact not found" });
    }

    return res.status(200).json({ artifact });
  } catch (error) {
    console.error("❌ [Artifacts] Get error:", error);
    return res.status(500).json({ error: "Failed to fetch artifact" });
  }
});

/**
 * GET /artifacts/project/:projectId/latest
 * Get the latest analyzed artifact for a project
 */
router.get("/project/:projectId/latest", readOnlyLimiter, async (req, res) => {
  try {
    const { projectId } = req.params;

    const { data: artifact, error } = await supabase
      .from("artifacts")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "analyzed")
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !artifact) {
      return res.status(404).json({ error: "No analyzed artifacts found" });
    }

    return res.status(200).json({
      artifact_id: artifact.id,
      file_name: artifact.file_name,
      analysis: artifact.analysis,
      analyzed_at: artifact.analyzed_at,
    });
  } catch (error) {
    console.error("❌ [Artifacts] Get latest error:", error);
    return res.status(500).json({ error: "Failed to fetch latest artifact" });
  }
});

/**
 * Helper: Analyze artifact and post feedback to thread
 */
async function analyzeAndPostFeedback(
  artifactId: string,
  projectId: string,
  filePath: string,
  fileName: string,
) {
  try {
    console.log(`[Artifacts] Starting analysis for artifact ${artifactId}`);

    // Get or create thread for this project (same as ExecutionService)
    const thread = await threadService.getOrCreateThread(projectId);

    if (!thread) {
      console.error("[Artifacts] Failed to get/create thread");
      return;
    }

    console.log(
      `[Artifacts] Using thread ${thread.id} for project ${projectId}`,
    );

    // Get current step from project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("current_step")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      console.error("[Artifacts] Project not found:", projectError);
      return;
    }

    // Get current step details
    const { data: step, error: stepError } = await supabase
      .from("roadmap_steps")
      .select("step_number, title, description, acceptance_criteria")
      .eq("project_id", projectId)
      .eq("step_number", project.current_step)
      .single();

    if (stepError || !step) {
      console.error("[Artifacts] Current step not found:", stepError);
      return;
    }

    // Analyze artifact
    const analysis = await analyzeArtifact({
      filePath,
      fileName,
      projectId,
      currentStep: step,
    });

    console.log(
      `[Artifacts] Analysis complete: quality=${analysis.quality_score}, suggest_completion=${analysis.suggest_completion}`,
    );

    // Note: We no longer post analysis to thread as a message
    // Instead, frontend fetches it via GET /artifacts/project/:projectId/latest
    // and displays it as an ArtifactAnalysisCard component
    console.log(`✅ [Artifacts] Analysis saved for artifact ${artifactId}`);

    // Store analysis in artifact record
    await supabase
      .from("artifacts")
      .update({
        analysis: {
          quality_score: analysis.quality_score,
          satisfied_criteria: analysis.satisfied_criteria,
          partial_criteria: analysis.partial_criteria,
          missing_criteria: analysis.missing_criteria,
          tech_stack: analysis.tech_stack,
          has_tests: analysis.has_tests,
          suggest_completion: analysis.suggest_completion,
          confidence: analysis.confidence,
        },
        status: "analyzed",
        analyzed_at: new Date().toISOString(),
      })
      .eq("id", artifactId);
  } catch (error) {
    console.error("[Artifacts] Error in analyzeAndPostFeedback:", error);
  }
}

export default router;
