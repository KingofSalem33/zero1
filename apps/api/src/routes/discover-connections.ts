import { Router } from "express";
import { supabase, supabaseAdmin } from "../db";
import {
  discoverConnections,
  type DiscoveredConnection,
} from "../bible/connectionDiscovery";
import crypto from "crypto";
import {
  getProfiler,
  profileSpan,
  profileTime,
} from "../profiling/requestProfiler";

const router = Router();

/**
 * Simple in-memory cache for discovered connections
 * In production, use Redis or database
 */
const cache = new Map<string, { connections: any[]; timestamp: number }>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const PERSIST_CONFIDENCE_MIN = 0.9;
const PERSIST_TYPES = new Set<DiscoveredConnection["type"]>([
  "TYPOLOGY",
  "FULFILLMENT",
  "CONTRAST",
  "PROGRESSION",
  "PATTERN",
]);

/**
 * Hash verse IDs to create cache key
 */
function hashVerseIds(verseIds: number[]): string {
  const sorted = [...verseIds].sort((a, b) => a - b);
  return crypto.createHash("md5").update(sorted.join(",")).digest("hex");
}

async function persistConnections(connections: DiscoveredConnection[]) {
  const toPersist = connections.filter(
    (conn) =>
      PERSIST_TYPES.has(conn.type) && conn.confidence >= PERSIST_CONFIDENCE_MIN,
  );

  if (toPersist.length === 0) {
    return;
  }

  const rows = toPersist.map((conn) => ({
    from_verse_id: conn.from,
    to_verse_id: conn.to,
    connection_type: conn.type,
    explanation: conn.explanation,
    confidence: conn.confidence,
  }));

  const { error } = await supabaseAdmin.from("llm_connections").upsert(rows, {
    onConflict: "from_verse_id,to_verse_id,connection_type",
  });

  if (error) {
    console.error(
      "[Discover Connections] Failed to persist connections:",
      error,
    );
  } else {
    console.log(
      `[Discover Connections] Persisted ${rows.length} high-confidence LLM connections`,
    );
  }
}

/**
 * POST /api/discover-connections
 * Discover theological connections between verses using LLM
 */
router.post("/", async (req, res) => {
  try {
    const profiler = getProfiler();
    profiler?.setPipeline("discover_connections");
    profiler?.markHandlerStart();

    const { verseIds } = req.body;

    if (!Array.isArray(verseIds) || verseIds.length === 0) {
      return res.status(400).json({ error: "verseIds array is required" });
    }

    console.log(`[Discover Connections] Request for ${verseIds.length} verses`);

    // Check cache first
    const cacheKey = hashVerseIds(verseIds);
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      const cacheStart = process.hrtime.bigint();
      profileSpan("discover_connections.cache_hit", cacheStart, cacheStart, {
        cached: true,
      });
      console.log(
        `[Discover Connections] Cache hit for ${verseIds.length} verses`,
      );
      void persistConnections(cached.connections);
      return res.json({
        connections: cached.connections,
        fromCache: true,
      });
    }

    // Fetch verse data
    const { data: verses, error } = await profileTime(
      "discover_connections.fetch_verses",
      () =>
        supabase
          .from("verses")
          .select("id, book_name, chapter, verse, text")
          .in("id", verseIds),
      {
        file: "routes/discover-connections.ts",
        fn: "fetch_verses",
        await: "supabase.verses.select",
      },
    );

    if (error || !verses) {
      console.error("[Discover Connections] Error fetching verses:", error);
      return res.status(500).json({ error: "Failed to fetch verses" });
    }

    // Format for LLM
    const formattedVerses = verses.map((v) => ({
      id: v.id,
      reference: `${v.book_name} ${v.chapter}:${v.verse}`,
      text: v.text,
      book: v.book_name,
    }));

    // Discover connections using LLM
    const connections = await profileTime(
      "discover_connections.llm_discover",
      () => discoverConnections(formattedVerses),
      {
        file: "bible/connectionDiscovery.ts",
        fn: "discoverConnections",
        await: "discoverConnections",
      },
    );

    await profileTime(
      "discover_connections.persist",
      () => persistConnections(connections),
      {
        file: "routes/discover-connections.ts",
        fn: "persistConnections",
        await: "supabase.llm_connections.upsert",
      },
    );

    // Cache result
    cache.set(cacheKey, {
      connections,
      timestamp: Date.now(),
    });

    console.log(
      `[Discover Connections] Found ${connections.length} connections, cached for future use`,
    );

    return res.json({
      connections,
      fromCache: false,
    });
  } catch (error) {
    console.error("[Discover Connections] Error:", error);
    return res.status(500).json({ error: "Failed to discover connections" });
  }
});

/**
 * GET /api/discover-connections/stats
 * Get cache statistics
 */
router.get("/stats", (_req, res) => {
  return res.json({
    cacheSize: cache.size,
    cacheTTL: CACHE_TTL / (24 * 60 * 60 * 1000) + " days",
  });
});

export default router;
