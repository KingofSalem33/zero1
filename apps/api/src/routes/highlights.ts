import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { supabase } from "../db";
import { z } from "zod";

const router = Router();

const highlightSchema = z.object({
  id: z.string().uuid(),
  book: z.string().min(1),
  chapter: z.number().int().positive(),
  verses: z.array(z.number().int().positive()).min(1),
  text: z.string(),
  color: z.string(),
  note: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const syncSchema = z.object({
  highlights: z.array(highlightSchema),
  last_synced_at: z.string().nullable(),
});

// GET /api/highlights — fetch all highlights for the authenticated user
router.get("/", requireAuth, readOnlyLimiter, async (req, res) => {
  try {
    const userId = req.userId!;
    const since = req.query.since as string | undefined;

    let query = supabase
      .from("highlights")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // If `since` is provided, return only highlights modified after that timestamp
    // (including soft-deleted ones so the client can remove them)
    if (since) {
      query = supabase
        .from("highlights")
        .select("*")
        .eq("user_id", userId)
        .gte("updated_at", since)
        .order("updated_at", { ascending: false });
    } else {
      // Full fetch: exclude soft-deleted
      query = query.is("deleted_at", null);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Highlights] GET error:", error);
      return res.status(500).json({ error: "Failed to fetch highlights" });
    }

    return res.json({ highlights: data || [] });
  } catch (error) {
    console.error("[Highlights] GET exception:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/highlights/sync — merge client highlights with server
// This is the main sync endpoint. The client sends its full local state
// and we reconcile server-side.
router.post("/sync", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const { highlights: clientHighlights } = syncSchema.parse(req.body);

    // 1. Fetch all server highlights (including soft-deleted for merge)
    const { data: serverHighlights, error: fetchError } = await supabase
      .from("highlights")
      .select("*")
      .eq("user_id", userId);

    if (fetchError) {
      console.error("[Highlights] Sync fetch error:", fetchError);
      return res
        .status(500)
        .json({ error: "Failed to fetch server highlights" });
    }

    const serverMap = new Map(
      (serverHighlights || []).map((h: Record<string, unknown>) => [h.id, h]),
    );

    const upserts: Record<string, unknown>[] = [];
    const mergedIds = new Set<string>();

    // 2. Process each client highlight
    for (const ch of clientHighlights) {
      mergedIds.add(ch.id);
      const server = serverMap.get(ch.id) as
        | Record<string, unknown>
        | undefined;

      if (!server) {
        // New on client, insert to server
        upserts.push({
          id: ch.id,
          user_id: userId,
          book: ch.book,
          chapter: ch.chapter,
          verses: ch.verses,
          text: ch.text,
          color: ch.color,
          note: ch.note || null,
          created_at: ch.created_at || new Date().toISOString(),
          updated_at: ch.updated_at || new Date().toISOString(),
          deleted_at: null,
        });
      } else {
        // Exists on both — last-write-wins based on updated_at
        const clientTime = new Date(
          ch.updated_at || ch.created_at || 0,
        ).getTime();
        const serverTime = new Date(
          (server.updated_at as string) || 0,
        ).getTime();

        if (clientTime >= serverTime) {
          upserts.push({
            id: ch.id,
            user_id: userId,
            book: ch.book,
            chapter: ch.chapter,
            verses: ch.verses,
            text: ch.text,
            color: ch.color,
            note: ch.note || null,
            created_at: ch.created_at || (server.created_at as string),
            updated_at: ch.updated_at || new Date().toISOString(),
            deleted_at: null,
          });
        }
        // If server is newer, we keep server version (no upsert needed)
      }
    }

    // 3. Upsert all client-wins records
    if (upserts.length > 0) {
      const { error: upsertError } = await supabase
        .from("highlights")
        .upsert(upserts, { onConflict: "id" });

      if (upsertError) {
        console.error("[Highlights] Sync upsert error:", upsertError);
        return res.status(500).json({ error: "Failed to sync highlights" });
      }
    }

    // 4. Return the merged server state (excluding soft-deleted)
    const { data: merged, error: mergedError } = await supabase
      .from("highlights")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (mergedError) {
      console.error("[Highlights] Sync merged fetch error:", mergedError);
      return res
        .status(500)
        .json({ error: "Failed to fetch merged highlights" });
    }

    return res.json({
      highlights: merged || [],
      synced_at: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid request",
        details: error.errors,
      });
    }
    console.error("[Highlights] Sync exception:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/highlights/:id — update a single highlight
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const updateSchema = z.object({
      color: z.string().optional(),
      note: z.string().nullable().optional(),
      verses: z.array(z.number().int().positive()).optional(),
      text: z.string().optional(),
    });

    const updates = updateSchema.parse(req.body);

    const { data, error } = await supabase
      .from("highlights")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select()
      .single();

    if (error) {
      console.error("[Highlights] PUT error:", error);
      return res.status(error.code === "PGRST116" ? 404 : 500).json({
        error:
          error.code === "PGRST116"
            ? "Highlight not found"
            : "Failed to update",
      });
    }

    return res.json({ highlight: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Invalid request", details: error.errors });
    }
    console.error("[Highlights] PUT exception:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/highlights/:id — soft-delete a highlight
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const { error } = await supabase
      .from("highlights")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("[Highlights] DELETE error:", error);
      return res.status(500).json({ error: "Failed to delete highlight" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("[Highlights] DELETE exception:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
