import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

const router = Router();

// Bookmark interface
interface Bookmark {
  id: string;
  text: string;
  createdAt: string;
  userId: string;
}

// Path to bookmarks storage file
const BOOKMARKS_FILE = path.join(process.cwd(), "data", "bookmarks.json");

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.join(process.cwd(), "data");
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Load bookmarks from file
async function loadBookmarks(): Promise<Bookmark[]> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(BOOKMARKS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    // File doesn't exist yet or is empty
    return [];
  }
}

// Save bookmarks to file
async function saveBookmarks(bookmarks: Bookmark[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(BOOKMARKS_FILE, JSON.stringify(bookmarks, null, 2));
}

// Validation schema for creating bookmark
const createBookmarkSchema = z.object({
  text: z.string().min(1).max(5000),
  userId: z.string().optional().default("anonymous"),
});

// GET /api/bookmarks - Get all bookmarks for a user
router.get("/", readOnlyLimiter, async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const bookmarks = await loadBookmarks();

    // Filter by user and sort by date (newest first)
    const userBookmarks = bookmarks
      .filter((b) => b.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({ bookmarks: userBookmarks });
  } catch (error) {
    console.error("Get bookmarks error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to get bookmarks",
        type: "internal_server_error",
        code: "get_bookmarks_failed",
      },
    });
  }
});

// POST /api/bookmarks - Create a new bookmark
router.post("/", readOnlyLimiter, async (req, res) => {
  try {
    const { text, userId } = createBookmarkSchema.parse(req.body);

    const bookmarks = await loadBookmarks();

    // Check for duplicate (same text for same user)
    const duplicate = bookmarks.find(
      (b) => b.userId === userId && b.text.trim() === text.trim()
    );

    if (duplicate) {
      return res.status(400).json({
        error: {
          message: "This text is already bookmarked",
          type: "validation_error",
          code: "duplicate_bookmark",
        },
      });
    }

    // Create new bookmark
    const newBookmark: Bookmark = {
      id: `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      text,
      userId,
      createdAt: new Date().toISOString(),
    };

    bookmarks.push(newBookmark);
    await saveBookmarks(bookmarks);

    return res.status(201).json({ bookmark: newBookmark });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Bookmark validation error:", error.errors);
      return res.status(400).json({
        error: {
          message: "Invalid request parameters",
          type: "invalid_request_error",
          code: "validation_error",
          details: error.errors,
        },
      });
    }

    console.error("Create bookmark error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to create bookmark",
        type: "internal_server_error",
        code: "create_bookmark_failed",
      },
    });
  }
});

// DELETE /api/bookmarks/:id - Delete a bookmark
router.delete("/:id", readOnlyLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req.query.userId as string) || "anonymous";

    const bookmarks = await loadBookmarks();

    // Find bookmark
    const bookmarkIndex = bookmarks.findIndex(
      (b) => b.id === id && b.userId === userId
    );

    if (bookmarkIndex === -1) {
      return res.status(404).json({
        error: {
          message: "Bookmark not found",
          type: "not_found_error",
          code: "bookmark_not_found",
        },
      });
    }

    // Remove bookmark
    bookmarks.splice(bookmarkIndex, 1);
    await saveBookmarks(bookmarks);

    return res.json({ ok: true, message: "Bookmark deleted successfully" });
  } catch (error) {
    console.error("Delete bookmark error:", error);
    return res.status(500).json({
      error: {
        message: "Failed to delete bookmark",
        type: "internal_server_error",
        code: "delete_bookmark_failed",
      },
    });
  }
});

export default router;
