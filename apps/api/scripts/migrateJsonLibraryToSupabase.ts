import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const envPaths = [
  path.resolve(__dirname, "..", ".env"),
  path.resolve(__dirname, "..", "..", ".env"),
  path.resolve(__dirname, "..", "..", "..", ".env"),
];
for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "Missing Supabase credentials. Set SUPABASE_URL + SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY).",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

interface LegacyBookmark {
  id?: string;
  userId?: string;
  text?: string;
  createdAt?: string;
}

interface LegacyBundle {
  id?: string;
  userId?: string;
  bundleHash?: string;
  bundle?: JsonObject;
  anchorRef?: string;
  verseCount?: number;
  edgeCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface LegacyConnection {
  id?: string;
  userId?: string;
  bundleId?: string;
  fromVerse?: JsonObject;
  toVerse?: JsonObject;
  connectionType?: string;
  similarity?: number;
  synopsis?: string;
  explanation?: string;
  connectedVerseIds?: number[];
  connectedVerses?: JsonObject[];
  goDeeperPrompt?: string;
  mapSession?: JsonValue;
  note?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface LegacyMap {
  id?: string;
  userId?: string;
  bundleId?: string;
  title?: string;
  note?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

interface MigrationStats {
  sourceRows: number;
  validRows: number;
  skippedRows: number;
  upsertedRows: number;
}

type BookmarkInsertRow = {
  id: string;
  user_id: string;
  text: string;
  created_at: string;
};

type BundleInsertRow = {
  id: string;
  user_id: string;
  bundle_hash: string;
  bundle: JsonObject;
  anchor_ref: string | null;
  verse_count?: number;
  edge_count?: number;
  created_at: string;
  updated_at: string;
};

type ConnectionInsertRow = {
  id: string;
  user_id: string;
  bundle_id: string;
  from_verse: JsonObject;
  to_verse: JsonObject;
  connection_type: string;
  similarity: number;
  synopsis: string;
  explanation: string | null;
  connected_verse_ids: number[] | null;
  connected_verses: JsonObject[] | null;
  go_deeper_prompt: string;
  map_session: JsonValue;
  note: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

type MapInsertRow = {
  id: string;
  user_id: string;
  bundle_id: string;
  title: string | null;
  note: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
};

const APPLY = process.argv.includes("--apply");
const fallbackUserArg = process.argv.find((arg) =>
  arg.startsWith("--fallback-user-id="),
);
const FALLBACK_USER_ID = fallbackUserArg
  ? fallbackUserArg.split("=")[1]?.trim() || ""
  : "";
const CHUNK_SIZE = 500;

function isUuid(value: string | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

if (FALLBACK_USER_ID && !isUuid(FALLBACK_USER_ID)) {
  console.error("Invalid --fallback-user-id. Expected UUID format.");
  process.exit(1);
}

function resolveUserId(userId: string | undefined): string | null {
  if (isUuid(userId)) return userId;
  if (FALLBACK_USER_ID) return FALLBACK_USER_ID;
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function hashBundle(bundle: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(bundle))
    .digest("hex");
}

async function findDataFile(fileName: string): Promise<string | null> {
  const rootData = path.resolve(__dirname, "..", "..", "..", "data", fileName);
  const apiData = path.resolve(__dirname, "..", "data", fileName);
  const cwdData = path.resolve(process.cwd(), "data", fileName);

  const candidates = [cwdData, rootData, apiData];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // continue
    }
  }
  return null;
}

async function loadLegacyArray<T>(fileName: string): Promise<T[]> {
  const filePath = await findDataFile(fileName);
  if (!filePath) return [];
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

async function upsertRows<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
): Promise<number> {
  let upserted = 0;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const { error } = await supabase.from(table).upsert(batch, {
      onConflict: "id",
    });
    if (error) {
      throw new Error(`Upsert failed for ${table}: ${error.message}`);
    }
    upserted += batch.length;
  }
  return upserted;
}

async function getTableCount(table: string): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { head: true, count: "exact" });
  if (error) return null;
  return count ?? 0;
}

async function main() {
  console.log(`Library JSON migration mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
  if (FALLBACK_USER_ID) {
    console.log(`Fallback user ID enabled: ${FALLBACK_USER_ID}`);
  }

  const [legacyBookmarks, legacyBundles, legacyConnections, legacyMaps] =
    await Promise.all([
      loadLegacyArray<LegacyBookmark>("bookmarks.json"),
      loadLegacyArray<LegacyBundle>("library_bundles.json"),
      loadLegacyArray<LegacyConnection>("library_connections.json"),
      loadLegacyArray<LegacyMap>("library_maps.json"),
    ]);

  const bookmarkStats: MigrationStats = {
    sourceRows: legacyBookmarks.length,
    validRows: 0,
    skippedRows: 0,
    upsertedRows: 0,
  };
  const bundleStats: MigrationStats = {
    sourceRows: legacyBundles.length,
    validRows: 0,
    skippedRows: 0,
    upsertedRows: 0,
  };
  const connectionStats: MigrationStats = {
    sourceRows: legacyConnections.length,
    validRows: 0,
    skippedRows: 0,
    upsertedRows: 0,
  };
  const mapStats: MigrationStats = {
    sourceRows: legacyMaps.length,
    validRows: 0,
    skippedRows: 0,
    upsertedRows: 0,
  };

  const bookmarks: BookmarkInsertRow[] = [];
  legacyBookmarks.forEach((row, index) => {
    const userId = resolveUserId(row.userId);
    if (!userId || !row.text?.trim()) {
      return;
    }
    bookmarkStats.validRows += 1;
    bookmarks.push({
      id:
        row.id && row.id.trim().length > 0
          ? row.id
          : `bm_migrated_${Date.now()}_${index}`,
      user_id: userId,
      text: row.text.trim(),
      created_at: row.createdAt || new Date().toISOString(),
    });
  });
  bookmarkStats.skippedRows =
    bookmarkStats.sourceRows - bookmarkStats.validRows;

  const validBundleIds = new Set<string>();
  const bundles: BundleInsertRow[] = [];
  legacyBundles.forEach((row, index) => {
    const userId = resolveUserId(row.userId);
    if (!userId || !row.bundle) {
      return;
    }
    const id =
      row.id && row.id.trim().length > 0
        ? row.id
        : `bundle_migrated_${Date.now()}_${index}`;
    validBundleIds.add(id);
    bundleStats.validRows += 1;
    bundles.push({
      id,
      user_id: userId,
      bundle_hash: row.bundleHash || hashBundle(row.bundle),
      bundle: row.bundle,
      anchor_ref: row.anchorRef || null,
      verse_count:
        typeof row.verseCount === "number" ? row.verseCount : undefined,
      edge_count: typeof row.edgeCount === "number" ? row.edgeCount : undefined,
      created_at: row.createdAt || new Date().toISOString(),
      updated_at: row.updatedAt || row.createdAt || new Date().toISOString(),
    });
  });
  bundleStats.skippedRows = bundleStats.sourceRows - bundleStats.validRows;

  const connections: ConnectionInsertRow[] = [];
  legacyConnections.forEach((row, index) => {
    const userId = resolveUserId(row.userId);
    if (
      !userId ||
      !row.bundleId ||
      !validBundleIds.has(row.bundleId) ||
      !row.fromVerse ||
      !row.toVerse ||
      !row.connectionType ||
      typeof row.similarity !== "number" ||
      !row.synopsis ||
      !row.goDeeperPrompt
    ) {
      return;
    }
    connectionStats.validRows += 1;
    connections.push({
      id:
        row.id && row.id.trim().length > 0
          ? row.id
          : `conn_migrated_${Date.now()}_${index}`,
      user_id: userId,
      bundle_id: row.bundleId,
      from_verse: row.fromVerse,
      to_verse: row.toVerse,
      connection_type: row.connectionType,
      similarity: row.similarity,
      synopsis: row.synopsis,
      explanation: row.explanation || null,
      connected_verse_ids: Array.isArray(row.connectedVerseIds)
        ? row.connectedVerseIds
        : null,
      connected_verses: Array.isArray(row.connectedVerses)
        ? row.connectedVerses
        : null,
      go_deeper_prompt: row.goDeeperPrompt,
      map_session: row.mapSession || null,
      note: row.note || null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      created_at: row.createdAt || new Date().toISOString(),
      updated_at: row.updatedAt || row.createdAt || new Date().toISOString(),
    });
  });
  connectionStats.skippedRows =
    connectionStats.sourceRows - connectionStats.validRows;

  const maps: MapInsertRow[] = [];
  legacyMaps.forEach((row, index) => {
    const userId = resolveUserId(row.userId);
    if (!userId || !row.bundleId || !validBundleIds.has(row.bundleId)) {
      return;
    }
    mapStats.validRows += 1;
    maps.push({
      id:
        row.id && row.id.trim().length > 0
          ? row.id
          : `map_migrated_${Date.now()}_${index}`,
      user_id: userId,
      bundle_id: row.bundleId,
      title: row.title || null,
      note: row.note || null,
      tags: Array.isArray(row.tags) ? row.tags : [],
      created_at: row.createdAt || new Date().toISOString(),
      updated_at: row.updatedAt || row.createdAt || new Date().toISOString(),
    });
  });
  mapStats.skippedRows = mapStats.sourceRows - mapStats.validRows;

  console.log("Prepared rows:");
  console.log("  bookmarks   ", bookmarkStats);
  console.log("  bundles     ", bundleStats);
  console.log("  connections ", connectionStats);
  console.log("  maps        ", mapStats);

  if (APPLY) {
    bookmarkStats.upsertedRows = await upsertRows("bookmarks", bookmarks);
    bundleStats.upsertedRows = await upsertRows("library_bundles", bundles);
    connectionStats.upsertedRows = await upsertRows(
      "library_connections",
      connections,
    );
    mapStats.upsertedRows = await upsertRows("library_maps", maps);
  }

  const [bookmarkCount, bundleCount, connectionCount, mapCount] =
    await Promise.all([
      getTableCount("bookmarks"),
      getTableCount("library_bundles"),
      getTableCount("library_connections"),
      getTableCount("library_maps"),
    ]);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "apply" : "dry-run",
    source: {
      bookmarks: bookmarkStats,
      bundles: bundleStats,
      connections: connectionStats,
      maps: mapStats,
    },
    tableCounts: {
      bookmarks: bookmarkCount,
      library_bundles: bundleCount,
      library_connections: connectionCount,
      library_maps: mapCount,
    },
  };

  const reportDir = path.resolve(__dirname, "reports");
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "libraryMigrationReport.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`Report written: ${reportPath}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
