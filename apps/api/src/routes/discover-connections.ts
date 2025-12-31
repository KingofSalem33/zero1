import { Router } from "express";
import { supabase } from "../db";
import { discoverConnections } from "../bible/connectionDiscovery";
import crypto from "crypto";

const router = Router();

/**
 * Simple in-memory cache for discovered connections
 * In production, use Redis or database
 */
const cache = new Map<string, { connections: any[]; timestamp: number }>();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Hash verse IDs to create cache key
 */
function hashVerseIds(verseIds: number[]): string {
  const sorted = [...verseIds].sort((a, b) => a - b);
  return crypto.createHash("md5").update(sorted.join(",")).digest("hex");
}

/**
 * POST /api/discover-connections
 * Discover theological connections between verses using LLM
 */
router.post("/", async (req, res) => {
  try {
    const { verseIds } = req.body;

    if (!Array.isArray(verseIds) || verseIds.length === 0) {
      return res.status(400).json({ error: "verseIds array is required" });
    }

    console.log(`[Discover Connections] Request for ${verseIds.length} verses`);

    // Check cache first
    const cacheKey = hashVerseIds(verseIds);
    const cached = cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(
        `[Discover Connections] Cache hit for ${verseIds.length} verses`,
      );
      return res.json({
        connections: cached.connections,
        fromCache: true,
      });
    }

    // Fetch verse data
    const { data: verses, error } = await supabase
      .from("verses")
      .select("id, book_name, chapter, verse, text")
      .in("id", verseIds);

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
    const connections = await discoverConnections(formattedVerses);

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
