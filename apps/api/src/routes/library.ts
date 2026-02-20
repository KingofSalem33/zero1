import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import crypto from "crypto";
import { getProfiler, profileTime } from "../profiling/requestProfiler";
import { createUserSupabaseClient } from "../db";

const router = Router();

interface BundleRecord {
  id: string;
  userId: string;
  bundleHash: string;
  bundle: unknown;
  anchorRef?: string;
  verseCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ConnectionRecord {
  id: string;
  userId: string;
  bundleId: string;
  fromVerse: { id: number; reference: string; text: string };
  toVerse: { id: number; reference: string; text: string };
  connectionType: string;
  similarity: number;
  synopsis: string;
  explanation?: string;
  connectedVerseIds?: number[];
  connectedVerses?: Array<{ id: number; reference: string; text: string }>;
  goDeeperPrompt: string;
  mapSession: unknown;
  note?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

interface MapRecord {
  id: string;
  userId: string;
  bundleId: string;
  title?: string;
  note?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}

interface LibraryBundleRow {
  id: string;
  user_id: string;
  bundle_hash: string;
  bundle: unknown;
  anchor_ref: string | null;
  verse_count: number;
  edge_count: number;
  created_at: string;
  updated_at: string;
}

interface LibraryConnectionRow {
  id: string;
  user_id: string;
  bundle_id: string;
  from_verse: { id: number; reference: string; text: string };
  to_verse: { id: number; reference: string; text: string };
  connection_type: string;
  similarity: number;
  synopsis: string;
  explanation: string | null;
  connected_verse_ids: number[] | null;
  connected_verses: Array<{
    id: number;
    reference: string;
    text: string;
  }> | null;
  go_deeper_prompt: string;
  map_session: unknown;
  note: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface LibraryMapRow {
  id: string;
  user_id: string;
  bundle_id: string;
  title: string | null;
  note: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

const bundleSchema = z
  .object({
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
    rootId: z.number().optional(),
    lens: z.string().optional(),
  })
  .passthrough();

const createBundleSchema = z.object({
  bundle: bundleSchema,
});

const createConnectionSchema = z.object({
  bundleId: z.string(),
  fromVerse: z.object({
    id: z.number(),
    reference: z.string(),
    text: z.string(),
  }),
  toVerse: z.object({
    id: z.number(),
    reference: z.string(),
    text: z.string(),
  }),
  connectionType: z.string(),
  similarity: z.number(),
  synopsis: z.string(),
  explanation: z.string().optional(),
  connectedVerseIds: z.array(z.number()).optional(),
  connectedVerses: z
    .array(
      z.object({
        id: z.number(),
        reference: z.string(),
        text: z.string(),
      }),
    )
    .optional(),
  goDeeperPrompt: z.string(),
  mapSession: z.any(),
});

const updateConnectionSchema = z.object({
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const createMapSchema = z.object({
  bundleId: z.string(),
  title: z.string().optional(),
});

const updateMapSchema = z.object({
  title: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const computeBundleHash = (bundle: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(bundle)).digest("hex");

const resolveAnchorRef = (bundle: any) => {
  const nodes = Array.isArray(bundle?.nodes) ? bundle.nodes : [];
  const rootId = bundle?.rootId;
  if (!rootId) return undefined;
  const anchor = nodes.find((n: any) => n.id === rootId);
  if (!anchor) return undefined;
  return `${anchor.book_name} ${anchor.chapter}:${anchor.verse}`;
};

const mapBundleRow = (row: LibraryBundleRow): BundleRecord => ({
  id: row.id,
  userId: row.user_id,
  bundleHash: row.bundle_hash,
  bundle: row.bundle,
  anchorRef: row.anchor_ref || undefined,
  verseCount: row.verse_count,
  edgeCount: row.edge_count,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapConnectionRow = (row: LibraryConnectionRow): ConnectionRecord => ({
  id: row.id,
  userId: row.user_id,
  bundleId: row.bundle_id,
  fromVerse: row.from_verse,
  toVerse: row.to_verse,
  connectionType: row.connection_type,
  similarity: row.similarity,
  synopsis: row.synopsis,
  explanation: row.explanation || undefined,
  connectedVerseIds: row.connected_verse_ids || undefined,
  connectedVerses: row.connected_verses || undefined,
  goDeeperPrompt: row.go_deeper_prompt,
  mapSession: row.map_session,
  note: row.note || undefined,
  tags: row.tags || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapMapRow = (row: LibraryMapRow): MapRecord => ({
  id: row.id,
  userId: row.user_id,
  bundleId: row.bundle_id,
  title: row.title || undefined,
  note: row.note || undefined,
  tags: row.tags || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

router.post("/bundles", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_bundle_create");
    profiler?.markHandlerStart();

    const { bundle } = await profileTime(
      "library.bundle.parse",
      () => createBundleSchema.parse(req.body),
      { file: "routes/library.ts", fn: "createBundleSchema.parse" },
    );
    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);

    const bundleHash = computeBundleHash(bundle);
    const { data: existing, error: lookupError } = await profileTime(
      "library.bundle.lookup_existing",
      () =>
        supabase
          .from("library_bundles")
          .select("id")
          .eq("user_id", userId)
          .eq("bundle_hash", bundleHash)
          .maybeSingle(),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_bundles).maybeSingle",
      },
    );

    if (lookupError) {
      console.error("Bundle lookup error:", lookupError);
      return res.status(500).json({ error: "Failed to save bundle" });
    }

    if (existing?.id) {
      return res.json({ bundleId: existing.id, existing: true });
    }

    const now = new Date().toISOString();
    const nodes = Array.isArray((bundle as { nodes?: unknown[] }).nodes)
      ? (bundle as { nodes: unknown[] }).nodes
      : [];
    const edges = Array.isArray((bundle as { edges?: unknown[] }).edges)
      ? (bundle as { edges: unknown[] }).edges
      : [];
    const newBundleId = `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const { error: insertError } = await profileTime(
      "library.bundle.insert",
      () =>
        supabase.from("library_bundles").insert({
          id: newBundleId,
          user_id: userId,
          bundle_hash: bundleHash,
          bundle,
          anchor_ref: resolveAnchorRef(bundle),
          verse_count: nodes.length,
          edge_count: edges.length,
          created_at: now,
          updated_at: now,
        }),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_bundles).insert",
      },
    );

    if (insertError) {
      console.error("Create bundle error:", insertError);
      return res.status(500).json({ error: "Failed to save bundle" });
    }

    return res.status(201).json({ bundleId: newBundleId, existing: false });
  } catch (error) {
    console.error("Create bundle error:", error);
    return res.status(500).json({ error: "Failed to save bundle" });
  }
});

router.get("/connections", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_connections_list");
    profiler?.markHandlerStart();

    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);
    const { data: connectionRows, error: connectionError } = await profileTime(
      "library.connections.select",
      () =>
        supabase
          .from("library_connections")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_connections).select",
      },
    );

    if (connectionError) {
      console.error("List connections error:", connectionError);
      return res.status(500).json({ error: "Failed to load connections" });
    }

    const connections = (connectionRows || []).map((row) =>
      mapConnectionRow(row as LibraryConnectionRow),
    );

    const bundleIds = Array.from(
      new Set(connections.map((entry) => entry.bundleId).filter(Boolean)),
    );
    const bundleLookup = new Map<string, BundleRecord>();

    if (bundleIds.length > 0) {
      const { data: bundleRows, error: bundleError } = await profileTime(
        "library.connections.bundle_lookup",
        () =>
          supabase
            .from("library_bundles")
            .select("*")
            .eq("user_id", userId)
            .in("id", bundleIds),
        {
          file: "routes/library.ts",
          fn: "supabase.from(library_bundles).in",
        },
      );

      if (bundleError) {
        console.error("List connection bundle lookup error:", bundleError);
        return res.status(500).json({ error: "Failed to load connections" });
      }

      (bundleRows || [])
        .map((row) => mapBundleRow(row as LibraryBundleRow))
        .forEach((bundle) => {
          bundleLookup.set(bundle.id, bundle);
        });
    }

    const userConnections = connections.map((entry) => {
      const bundle = bundleLookup.get(entry.bundleId);
      return {
        ...entry,
        bundle: bundle?.bundle,
        bundleMeta: bundle
          ? {
              anchorRef: bundle.anchorRef,
              verseCount: bundle.verseCount,
              edgeCount: bundle.edgeCount,
            }
          : undefined,
      };
    });

    return res.json({ connections: userConnections });
  } catch (error) {
    console.error("List connections error:", error);
    return res.status(500).json({ error: "Failed to load connections" });
  }
});

router.post("/connections", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_connections_create");
    profiler?.markHandlerStart();

    const payload = await profileTime(
      "library.connection.parse",
      () => createConnectionSchema.parse(req.body),
      { file: "routes/library.ts", fn: "createConnectionSchema.parse" },
    );
    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);

    const { data: candidates, error: candidateError } = await profileTime(
      "library.connection.duplicate_lookup",
      () =>
        supabase
          .from("library_connections")
          .select("*")
          .eq("user_id", userId)
          .eq("bundle_id", payload.bundleId)
          .eq("connection_type", payload.connectionType),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_connections).duplicate_lookup",
      },
    );

    if (candidateError) {
      console.error("Create connection duplicate check error:", candidateError);
      return res.status(500).json({ error: "Failed to save connection" });
    }

    const duplicate = (candidates || [])
      .map((row) => mapConnectionRow(row as LibraryConnectionRow))
      .find(
        (entry) =>
          entry.fromVerse.id === payload.fromVerse.id &&
          entry.toVerse.id === payload.toVerse.id,
      );

    if (duplicate) {
      return res.json({ connection: duplicate, existing: true });
    }

    const now = new Date().toISOString();
    const newConnectionId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const { data: inserted, error: insertError } = await profileTime(
      "library.connection.insert",
      () =>
        supabase
          .from("library_connections")
          .insert({
            id: newConnectionId,
            user_id: userId,
            bundle_id: payload.bundleId,
            from_verse: payload.fromVerse,
            to_verse: payload.toVerse,
            connection_type: payload.connectionType,
            similarity: payload.similarity,
            synopsis: payload.synopsis,
            explanation: payload.explanation || null,
            connected_verse_ids: payload.connectedVerseIds || null,
            connected_verses: payload.connectedVerses || null,
            go_deeper_prompt: payload.goDeeperPrompt,
            map_session: payload.mapSession ?? null,
            note: "",
            tags: [],
            created_at: now,
            updated_at: now,
          })
          .select("*")
          .single(),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_connections).insert",
      },
    );

    if (insertError || !inserted) {
      console.error("Create connection error:", insertError);
      return res.status(500).json({ error: "Failed to save connection" });
    }

    return res.status(201).json({
      connection: mapConnectionRow(inserted as LibraryConnectionRow),
      existing: false,
    });
  } catch (error) {
    console.error("Create connection error:", error);
    return res.status(500).json({ error: "Failed to save connection" });
  }
});

router.patch("/connections/:id", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_connections_update");
    profiler?.markHandlerStart();

    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);
    const { id } = req.params;
    const updates = await updateConnectionSchema.parseAsync(req.body);

    const { data, error } = await profileTime(
      "library.connection.update",
      () =>
        supabase
          .from("library_connections")
          .update({
            note: updates.note,
            tags: updates.tags,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", userId)
          .select("*")
          .maybeSingle(),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_connections).update",
      },
    );

    if (error) {
      console.error("Update connection error:", error);
      return res.status(500).json({ error: "Failed to update connection" });
    }

    if (!data) {
      return res.status(404).json({ error: "Connection not found" });
    }

    return res.json({
      connection: mapConnectionRow(data as LibraryConnectionRow),
    });
  } catch (error) {
    console.error("Update connection error:", error);
    return res.status(500).json({ error: "Failed to update connection" });
  }
});

router.delete("/connections/:id", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_connections_delete");
    profiler?.markHandlerStart();

    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);
    const { id } = req.params;

    const { data, error } = await profileTime(
      "library.connection.delete",
      () =>
        supabase
          .from("library_connections")
          .delete()
          .eq("id", id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle(),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_connections).delete",
      },
    );

    if (error) {
      console.error("Delete connection error:", error);
      return res.status(500).json({ error: "Failed to delete connection" });
    }

    if (!data) {
      return res.status(404).json({ error: "Connection not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete connection error:", error);
    return res.status(500).json({ error: "Failed to delete connection" });
  }
});

router.get("/maps", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_maps_list");
    profiler?.markHandlerStart();

    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);
    const { data: mapRows, error: mapError } = await profileTime(
      "library.maps.select",
      () =>
        supabase
          .from("library_maps")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
      { file: "routes/library.ts", fn: "supabase.from(library_maps).select" },
    );

    if (mapError) {
      console.error("List maps error:", mapError);
      return res.status(500).json({ error: "Failed to load maps" });
    }

    const maps = (mapRows || []).map((row) => mapMapRow(row as LibraryMapRow));
    const bundleIds = Array.from(
      new Set(maps.map((entry) => entry.bundleId).filter(Boolean)),
    );
    const bundleLookup = new Map<string, BundleRecord>();

    if (bundleIds.length > 0) {
      const { data: bundleRows, error: bundleError } = await profileTime(
        "library.maps.bundle_lookup",
        () =>
          supabase
            .from("library_bundles")
            .select("*")
            .eq("user_id", userId)
            .in("id", bundleIds),
        { file: "routes/library.ts", fn: "supabase.from(library_bundles).in" },
      );

      if (bundleError) {
        console.error("List maps bundle lookup error:", bundleError);
        return res.status(500).json({ error: "Failed to load maps" });
      }

      (bundleRows || [])
        .map((row) => mapBundleRow(row as LibraryBundleRow))
        .forEach((bundle) => {
          bundleLookup.set(bundle.id, bundle);
        });
    }

    const userMaps = maps.map((entry) => {
      const bundle = bundleLookup.get(entry.bundleId);
      return {
        ...entry,
        bundle: bundle?.bundle,
        bundleMeta: bundle
          ? {
              anchorRef: bundle.anchorRef,
              verseCount: bundle.verseCount,
              edgeCount: bundle.edgeCount,
            }
          : undefined,
      };
    });

    return res.json({ maps: userMaps });
  } catch (error) {
    console.error("List maps error:", error);
    return res.status(500).json({ error: "Failed to load maps" });
  }
});

router.post("/maps", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_maps_create");
    profiler?.markHandlerStart();

    const payload = await profileTime(
      "library.map.parse",
      () => createMapSchema.parse(req.body),
      { file: "routes/library.ts", fn: "createMapSchema.parse" },
    );
    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);

    const { data: existing, error: lookupError } = await profileTime(
      "library.map.lookup_existing",
      () =>
        supabase
          .from("library_maps")
          .select("*")
          .eq("user_id", userId)
          .eq("bundle_id", payload.bundleId)
          .maybeSingle(),
      {
        file: "routes/library.ts",
        fn: "supabase.from(library_maps).maybeSingle",
      },
    );

    if (lookupError) {
      console.error("Create map duplicate check error:", lookupError);
      return res.status(500).json({ error: "Failed to save map" });
    }

    if (existing) {
      return res.json({
        map: mapMapRow(existing as LibraryMapRow),
        existing: true,
      });
    }

    const now = new Date().toISOString();
    const newMapId = `map_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const { data: inserted, error: insertError } = await profileTime(
      "library.map.insert",
      () =>
        supabase
          .from("library_maps")
          .insert({
            id: newMapId,
            user_id: userId,
            bundle_id: payload.bundleId,
            title: payload.title || null,
            note: "",
            tags: [],
            created_at: now,
            updated_at: now,
          })
          .select("*")
          .single(),
      { file: "routes/library.ts", fn: "supabase.from(library_maps).insert" },
    );

    if (insertError || !inserted) {
      console.error("Create map error:", insertError);
      return res.status(500).json({ error: "Failed to save map" });
    }

    return res.status(201).json({
      map: mapMapRow(inserted as LibraryMapRow),
      existing: false,
    });
  } catch (error) {
    console.error("Create map error:", error);
    return res.status(500).json({ error: "Failed to save map" });
  }
});

router.patch("/maps/:id", readOnlyLimiter, async (req, res) => {
  try {
    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);
    const { id } = req.params;
    const updates = await updateMapSchema.parseAsync(req.body);

    const { data, error } = await profileTime(
      "library.map.update",
      () =>
        supabase
          .from("library_maps")
          .update({
            title: updates.title,
            note: updates.note,
            tags: updates.tags,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", userId)
          .select("*")
          .maybeSingle(),
      { file: "routes/library.ts", fn: "supabase.from(library_maps).update" },
    );

    if (error) {
      console.error("Update map error:", error);
      return res.status(500).json({ error: "Failed to update map" });
    }

    if (!data) {
      return res.status(404).json({ error: "Map not found" });
    }

    return res.json({ map: mapMapRow(data as LibraryMapRow) });
  } catch (error) {
    console.error("Update map error:", error);
    return res.status(500).json({ error: "Failed to update map" });
  }
});

router.delete("/maps/:id", readOnlyLimiter, async (req, res) => {
  try {
    const userId = req.userId!;
    const supabase = createUserSupabaseClient(req.accessToken!);
    const { id } = req.params;

    const { data, error } = await profileTime(
      "library.map.delete",
      () =>
        supabase
          .from("library_maps")
          .delete()
          .eq("id", id)
          .eq("user_id", userId)
          .select("id")
          .maybeSingle(),
      { file: "routes/library.ts", fn: "supabase.from(library_maps).delete" },
    );

    if (error) {
      console.error("Delete map error:", error);
      return res.status(500).json({ error: "Failed to delete map" });
    }

    if (!data) {
      return res.status(404).json({ error: "Map not found" });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete map error:", error);
    return res.status(500).json({ error: "Failed to delete map" });
  }
});

export default router;
