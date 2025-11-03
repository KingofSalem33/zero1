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
import { uploadLimiter } from "../middleware/rateLimit";

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
      const threadId = Array.isArray(fields.thread_id)
        ? fields.thread_id[0]
        : fields.thread_id;
      const artifactType = Array.isArray(fields.artifact_type)
        ? fields.artifact_type[0]
        : fields.artifact_type || "file";

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
          artifact_type: artifactType,
          file_path: extractedPath || filePath,
          original_filename: filename,
          file_size: file.size,
          mime_type: file.mimetype || "application/octet-stream",
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (dbError) {
        console.error("❌ [Artifacts] DB error:", dbError);
        return res.status(500).json({ error: "Failed to save artifact" });
      }

      console.log(`✅ [Artifacts] Saved artifact: ${artifact.id}`);

      // Send simple acknowledgment to thread
      if (threadId) {
        try {
          await supabase.from("messages").insert({
            thread_id: threadId,
            role: "assistant",
            content: `✅ **Artifact received:** ${filename}\n\nI've saved your upload. You can reference it in our conversation.`,
            created_at: new Date().toISOString(),
          });
        } catch (error) {
          console.error("❌ [Artifacts] Failed to post message:", error);
        }
      }

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
        artifact_type: "repository",
        file_path: repoDir,
        original_filename: `repo_${sanitizedBranch}`,
        created_at: new Date().toISOString(),
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
        await supabase.from("messages").insert({
          thread_id: thread_id,
          role: "assistant",
          content: `✅ **Repository cloned:** ${repo_url}\n\nBranch: ${sanitizedBranch}\n\nI've saved the repository. You can reference it in our conversation.`,
          created_at: new Date().toISOString(),
        });
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

export default router;
