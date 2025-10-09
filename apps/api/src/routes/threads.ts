import { Router } from "express";
import { threadService } from "../services/threadService";

const router = Router();

// POST /api/threads - Create a new thread
router.post("/", async (req, res) => {
  try {
    const { project_id, title } = req.body;

    if (!project_id || typeof project_id !== "string") {
      return res.status(400).json({
        error: "Valid project_id is required",
      });
    }

    const thread = await threadService.createThread(project_id, title);

    return res.status(201).json({
      ok: true,
      thread,
    });
  } catch (error) {
    console.error("Error creating thread:", error);
    return res.status(500).json({
      error: "Failed to create thread",
    });
  }
});

// GET /api/threads/:threadId - Get a specific thread
router.get("/:threadId", async (req, res) => {
  try {
    const { threadId } = req.params;

    const thread = await threadService.getThread(threadId);

    if (!thread) {
      return res.status(404).json({
        error: "Thread not found",
      });
    }

    return res.json({
      ok: true,
      thread,
    });
  } catch (error) {
    console.error("Error fetching thread:", error);
    return res.status(500).json({
      error: "Failed to fetch thread",
    });
  }
});

// GET /api/threads/:threadId/messages - Get thread messages
router.get("/:threadId/messages", async (req, res) => {
  try {
    const { threadId } = req.params;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    const messages = await threadService.getRecentMessages(threadId, limit);

    return res.json({
      ok: true,
      messages,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({
      error: "Failed to fetch messages",
    });
  }
});

// GET /api/projects/:projectId/threads - List threads for a project
router.get("/project/:projectId", async (req, res) => {
  try {
    const { projectId } = req.params;

    const threads = await threadService.listThreads(projectId);

    return res.json({
      ok: true,
      threads,
    });
  } catch (error) {
    console.error("Error listing threads:", error);
    return res.status(500).json({
      error: "Failed to list threads",
    });
  }
});

// DELETE /api/threads/:threadId - Delete a thread
router.delete("/:threadId", async (req, res) => {
  try {
    const { threadId } = req.params;

    await threadService.deleteThread(threadId);

    return res.json({
      ok: true,
      message: "Thread deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting thread:", error);
    return res.status(500).json({
      error: "Failed to delete thread",
    });
  }
});

export default router;
