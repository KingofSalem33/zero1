import { Router } from "express";
import { threadService } from "../services/threadService";
import { readOnlyLimiter } from "../middleware/rateLimit";

const router = Router();

// POST /api/threads - Create a new thread
router.post("/", async (req, res) => {
  try {
    const { project_id, title } = req.body;

    if (!project_id || typeof project_id !== "string") {
      return res.status(400).json({
        error: {
          message: "Valid project_id is required",
          type: "invalid_request_error",
          param: "project_id",
          code: "missing_required_parameter",
        },
      });
    }

    const thread = await threadService.createThread(project_id, title);

    return res.status(201).json({
      ...thread,
      object: "thread",
    });
  } catch (error) {
    console.error("Error creating thread:", error);
    return res.status(500).json({
      error: {
        message: "Failed to create thread",
        type: "internal_server_error",
        code: "thread_creation_failed",
      },
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
        error: {
          message: "Thread not found",
          type: "invalid_request_error",
          param: "threadId",
          code: "resource_not_found",
        },
      });
    }

    return res.json({
      ...thread,
      object: "thread",
    });
  } catch (error) {
    console.error("Error fetching thread:", error);
    return res.status(500).json({
      error: {
        message: "Failed to fetch thread",
        type: "internal_server_error",
        code: "thread_fetch_failed",
      },
    });
  }
});

// GET /api/threads/:threadId/messages - Get thread messages
router.get("/:threadId/messages", readOnlyLimiter, async (req, res) => {
  try {
    const { threadId } = req.params;
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 50;

    const messages = await threadService.getRecentMessages(threadId, limit);

    return res.json({
      object: "list",
      data: messages,
      has_more: false,
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    return res.status(500).json({
      error: {
        message: "Failed to fetch messages",
        type: "internal_server_error",
        code: "message_fetch_failed",
      },
    });
  }
});

// DELETE /api/threads/:threadId - Delete a thread
router.delete("/:threadId", async (req, res) => {
  try {
    const { threadId } = req.params;

    await threadService.deleteThread(threadId);

    return res.json({
      id: threadId,
      object: "thread.deleted",
      deleted: true,
    });
  } catch (error) {
    console.error("Error deleting thread:", error);
    return res.status(500).json({
      error: {
        message: "Failed to delete thread",
        type: "internal_server_error",
        code: "thread_deletion_failed",
      },
    });
  }
});

export default router;
