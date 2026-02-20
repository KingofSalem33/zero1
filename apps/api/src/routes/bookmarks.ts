import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import { getProfiler, profileTime } from "../profiling/requestProfiler";
import { createUserSupabaseClient } from "../db";

const router = Router();

interface Bookmark {
  id: string;
  text: string;
  createdAt: string;
  userId: string;
}

interface BookmarkRow {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
}

const createBookmarkSchema = z.object({
  text: z.string().min(1).max(5000),
});

const mapBookmarkRow = (row: BookmarkRow): Bookmark => ({
  id: row.id,
  text: row.text,
  createdAt: row.created_at,
  userId: row.user_id,
});

// GET /api/bookmarks - Get all bookmarks for the authenticated user
router.get("/", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("bookmarks_list");
    profiler?.markHandlerStart();

    const userId = req.userId!;
    const userSupabase = createUserSupabaseClient(req.accessToken!);
    const { data, error } = await profileTime(
      "bookmarks.select",
      () =>
        userSupabase
          .from("bookmarks")
          .select("id,user_id,text,created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      { file: "routes/bookmarks.ts", fn: "supabase.from(bookmarks).select" },
    );

    if (error) {
      console.error("Get bookmarks error:", error);
      return res.status(500).json({
        error: {
          message: "Failed to get bookmarks",
          type: "internal_server_error",
          code: "get_bookmarks_failed",
        },
      });
    }

    return res.json({
      bookmarks: (data || []).map((row) => mapBookmarkRow(row as BookmarkRow)),
    });
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

// POST /api/bookmarks - Create a new bookmark for the authenticated user
router.post("/", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("bookmarks_create");
    profiler?.markHandlerStart();

    const { text } = await profileTime(
      "bookmarks.zod_parse",
      () => createBookmarkSchema.parse(req.body),
      { file: "routes/bookmarks.ts", fn: "createBookmarkSchema.parse" },
    );
    const userId = req.userId!;
    const userSupabase = createUserSupabaseClient(req.accessToken!);
    const normalizedText = text.trim();

    const { data: existing, error: lookupError } = await profileTime(
      "bookmarks.duplicate_lookup",
      () =>
        userSupabase
          .from("bookmarks")
          .select("id,user_id,text,created_at")
          .eq("user_id", userId)
          .eq("text", normalizedText)
          .maybeSingle(),
      {
        file: "routes/bookmarks.ts",
        fn: "supabase.from(bookmarks).maybeSingle",
      },
    );

    if (lookupError) {
      console.error("Bookmark duplicate check error:", lookupError);
      return res.status(500).json({
        error: {
          message: "Failed to create bookmark",
          type: "internal_server_error",
          code: "create_bookmark_failed",
        },
      });
    }

    if (existing) {
      return res.status(400).json({
        error: {
          message: "This text is already bookmarked",
          type: "validation_error",
          code: "duplicate_bookmark",
        },
      });
    }

    const newBookmarkId = `bm_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const createdAt = new Date().toISOString();

    const { data: inserted, error: insertError } = await profileTime(
      "bookmarks.insert",
      () =>
        userSupabase
          .from("bookmarks")
          .insert({
            id: newBookmarkId,
            user_id: userId,
            text: normalizedText,
            created_at: createdAt,
          })
          .select("id,user_id,text,created_at")
          .single(),
      { file: "routes/bookmarks.ts", fn: "supabase.from(bookmarks).insert" },
    );

    if (insertError || !inserted) {
      console.error("Create bookmark error:", insertError);
      return res.status(500).json({
        error: {
          message: "Failed to create bookmark",
          type: "internal_server_error",
          code: "create_bookmark_failed",
        },
      });
    }

    return res.status(201).json({ bookmark: mapBookmarkRow(inserted) });
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
    const profiler = getProfiler();
    profiler?.setPipeline("bookmarks_delete");
    profiler?.markHandlerStart();

    const { id } = req.params;
    const userId = req.userId!;
    const userSupabase = createUserSupabaseClient(req.accessToken!);

    const { data, error } = await profileTime(
      "bookmarks.delete",
      () =>
        userSupabase
          .from("bookmarks")
          .delete()
          .eq("id", id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle(),
      { file: "routes/bookmarks.ts", fn: "supabase.from(bookmarks).delete" },
    );

    if (error) {
      console.error("Delete bookmark error:", error);
      return res.status(500).json({
        error: {
          message: "Failed to delete bookmark",
          type: "internal_server_error",
          code: "delete_bookmark_failed",
        },
      });
    }

    if (!data) {
      return res.status(404).json({
        error: {
          message: "Bookmark not found",
          type: "not_found_error",
          code: "bookmark_not_found",
        },
      });
    }

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
