import { Router } from "express";
import { readOnlyLimiter } from "../middleware/rateLimit";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { getProfiler, profileTime } from "../profiling/requestProfiler";

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

const DATA_DIR = path.join(process.cwd(), "data");
const BUNDLES_FILE = path.join(DATA_DIR, "library_bundles.json");
const CONNECTIONS_FILE = path.join(DATA_DIR, "library_connections.json");
const MAPS_FILE = path.join(DATA_DIR, "library_maps.json");

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function loadJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function saveJsonFile<T>(filePath: string, data: T): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
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
  userId: z.string().optional().default("anonymous"),
});

const createConnectionSchema = z.object({
  userId: z.string().optional().default("anonymous"),
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
  userId: z.string().optional().default("anonymous"),
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

router.post("/bundles", readOnlyLimiter, async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("library_bundle_create");
    profiler?.markHandlerStart();

    const { bundle, userId } = await profileTime(
      "library.bundle.parse",
      () => createBundleSchema.parse(req.body),
      { file: "routes/library.ts", fn: "createBundleSchema.parse" },
    );

    const bundles = await profileTime(
      "library.bundle.load",
      () => loadJsonFile<BundleRecord[]>(BUNDLES_FILE, []),
      { file: "routes/library.ts", fn: "loadJsonFile" },
    );

    const bundleHash = computeBundleHash(bundle);
    const existing = bundles.find(
      (entry) => entry.userId === userId && entry.bundleHash === bundleHash,
    );

    if (existing) {
      return res.json({ bundleId: existing.id, existing: true });
    }

    const now = new Date().toISOString();
    const nodes = Array.isArray(bundle.nodes) ? bundle.nodes : [];
    const edges = Array.isArray(bundle.edges) ? bundle.edges : [];

    const newBundle: BundleRecord = {
      id: `bundle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId,
      bundleHash,
      bundle,
      anchorRef: resolveAnchorRef(bundle),
      verseCount: nodes.length,
      edgeCount: edges.length,
      createdAt: now,
      updatedAt: now,
    };

    bundles.push(newBundle);
    await profileTime(
      "library.bundle.save",
      () => saveJsonFile(BUNDLES_FILE, bundles),
      { file: "routes/library.ts", fn: "saveJsonFile" },
    );

    return res.status(201).json({ bundleId: newBundle.id, existing: false });
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

    const userId = (req.query.userId as string) || "anonymous";

    const [connections, bundles] = await Promise.all([
      loadJsonFile<ConnectionRecord[]>(CONNECTIONS_FILE, []),
      loadJsonFile<BundleRecord[]>(BUNDLES_FILE, []),
    ]);

    const bundleLookup = new Map(bundles.map((bundle) => [bundle.id, bundle]));

    const userConnections = connections
      .filter((entry) => entry.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((entry) => {
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

    const connections = await profileTime(
      "library.connection.load",
      () => loadJsonFile<ConnectionRecord[]>(CONNECTIONS_FILE, []),
      { file: "routes/library.ts", fn: "loadJsonFile" },
    );

    const duplicate = connections.find(
      (entry) =>
        entry.userId === payload.userId &&
        entry.bundleId === payload.bundleId &&
        entry.connectionType === payload.connectionType &&
        entry.fromVerse.id === payload.fromVerse.id &&
        entry.toVerse.id === payload.toVerse.id,
    );

    if (duplicate) {
      return res.json({ connection: duplicate, existing: true });
    }

    const now = new Date().toISOString();
    const newConnection: ConnectionRecord = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      ...payload,
      mapSession: payload.mapSession ?? null,
      createdAt: now,
      updatedAt: now,
      note: "",
      tags: [],
    };

    connections.push(newConnection);
    await profileTime(
      "library.connection.save",
      () => saveJsonFile(CONNECTIONS_FILE, connections),
      { file: "routes/library.ts", fn: "saveJsonFile" },
    );

    return res.status(201).json({ connection: newConnection, existing: false });
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

    const userId = (req.query.userId as string) || "anonymous";
    const { id } = req.params;
    const updates = await updateConnectionSchema.parseAsync(req.body);

    const connections = await loadJsonFile<ConnectionRecord[]>(
      CONNECTIONS_FILE,
      [],
    );

    const index = connections.findIndex(
      (entry) => entry.id === id && entry.userId === userId,
    );

    if (index === -1) {
      return res.status(404).json({ error: "Connection not found" });
    }

    const existing = connections[index];
    const updated: ConnectionRecord = {
      ...existing,
      note: updates.note ?? existing.note,
      tags: updates.tags ?? existing.tags,
      updatedAt: new Date().toISOString(),
    };

    connections[index] = updated;
    await saveJsonFile(CONNECTIONS_FILE, connections);

    return res.json({ connection: updated });
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

    const userId = (req.query.userId as string) || "anonymous";
    const { id } = req.params;

    const connections = await loadJsonFile<ConnectionRecord[]>(
      CONNECTIONS_FILE,
      [],
    );

    const index = connections.findIndex(
      (entry) => entry.id === id && entry.userId === userId,
    );
    if (index === -1) {
      return res.status(404).json({ error: "Connection not found" });
    }

    connections.splice(index, 1);
    await saveJsonFile(CONNECTIONS_FILE, connections);

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

    const userId = (req.query.userId as string) || "anonymous";
    const [maps, bundles] = await Promise.all([
      loadJsonFile<MapRecord[]>(MAPS_FILE, []),
      loadJsonFile<BundleRecord[]>(BUNDLES_FILE, []),
    ]);

    const bundleLookup = new Map(bundles.map((bundle) => [bundle.id, bundle]));

    const userMaps = maps
      .filter((entry) => entry.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((entry) => {
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

    const maps = await loadJsonFile<MapRecord[]>(MAPS_FILE, []);
    const duplicate = maps.find(
      (entry) =>
        entry.userId === payload.userId && entry.bundleId === payload.bundleId,
    );

    if (duplicate) {
      return res.json({ map: duplicate, existing: true });
    }

    const now = new Date().toISOString();
    const newMap: MapRecord = {
      id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId: payload.userId,
      bundleId: payload.bundleId,
      title: payload.title,
      note: "",
      tags: [],
      createdAt: now,
      updatedAt: now,
    };

    maps.push(newMap);
    await saveJsonFile(MAPS_FILE, maps);

    return res.status(201).json({ map: newMap, existing: false });
  } catch (error) {
    console.error("Create map error:", error);
    return res.status(500).json({ error: "Failed to save map" });
  }
});

router.patch("/maps/:id", readOnlyLimiter, async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const { id } = req.params;
    const updates = await updateMapSchema.parseAsync(req.body);

    const maps = await loadJsonFile<MapRecord[]>(MAPS_FILE, []);
    const index = maps.findIndex(
      (entry) => entry.id === id && entry.userId === userId,
    );
    if (index === -1) {
      return res.status(404).json({ error: "Map not found" });
    }

    const existing = maps[index];
    const updated: MapRecord = {
      ...existing,
      title: updates.title ?? existing.title,
      note: updates.note ?? existing.note,
      tags: updates.tags ?? existing.tags,
      updatedAt: new Date().toISOString(),
    };

    maps[index] = updated;
    await saveJsonFile(MAPS_FILE, maps);

    return res.json({ map: updated });
  } catch (error) {
    console.error("Update map error:", error);
    return res.status(500).json({ error: "Failed to update map" });
  }
});

router.delete("/maps/:id", readOnlyLimiter, async (req, res) => {
  try {
    const userId = (req.query.userId as string) || "anonymous";
    const { id } = req.params;

    const maps = await loadJsonFile<MapRecord[]>(MAPS_FILE, []);
    const index = maps.findIndex(
      (entry) => entry.id === id && entry.userId === userId,
    );
    if (index === -1) {
      return res.status(404).json({ error: "Map not found" });
    }

    maps.splice(index, 1);
    await saveJsonFile(MAPS_FILE, maps);

    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete map error:", error);
    return res.status(500).json({ error: "Failed to delete map" });
  }
});

export default router;
