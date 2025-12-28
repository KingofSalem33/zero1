/**
 * Multi-Strand Edge Fetchers
 *
 * Fetches different types of connections between verses:
 * - DEEPER: Theological/thematic (cross-references)
 * - ROOTS: Lexical (shared Hebrew/Greek words via Strong's)
 * - ECHOES: Citations (NT quoting OT)
 * - PROPHECY: Prophetic fulfillment
 * - GENEALOGY: Family lineage
 */

import { supabase } from "../db";
import { VisualEdge } from "./types";
import {
  findGoldThreads,
  findPurpleThreads,
  findCyanThreads,
} from "./semanticThreads";

/**
 * Fetch DEEPER edges (cross-references)
 * These are the theological/thematic connections from OpenBible.info
 */
export async function fetchDeeperEdges(
  sourceIds: number[],
  limit: number = 100,
): Promise<VisualEdge[]> {
  if (sourceIds.length === 0) return [];

  const { data, error } = await supabase
    .from("cross_references")
    .select("from_verse_id, to_verse_id")
    .in("from_verse_id", sourceIds)
    .limit(limit);

  if (error) {
    console.error("[Edge Fetchers] Error fetching DEEPER edges:", error);
    return [];
  }

  return (data || []).map((row) => ({
    from: row.from_verse_id,
    to: row.to_verse_id,
    weight: 0.8,
    type: "DEEPER" as const,
  }));
}

/**
 * Fetch ROOTS edges (lexical connections via Strong's numbers)
 *
 * Strategy:
 * 1. Get Strong's numbers for source verses
 * 2. Find other verses with the same Strong's numbers
 * 3. Return edges between them
 *
 * Note: This requires verse_strongs table to be populated.
 * For MVP, we'll return empty array and populate lazily.
 */
export async function fetchRootsEdges(
  sourceIds: number[],
  limit: number = 50,
): Promise<VisualEdge[]> {
  if (sourceIds.length === 0) return [];

  try {
    // Check if verse_strongs table exists and has data
    const { data: strongsData, error: strongsError } = await supabase
      .from("verse_strongs")
      .select("verse_id, strongs_number")
      .in("verse_id", sourceIds)
      .limit(200); // Get up to 200 Strong's numbers from source verses

    if (strongsError || !strongsData || strongsData.length === 0) {
      console.log(
        "[Edge Fetchers] No Strong's data available yet for ROOTS edges",
      );
      return [];
    }

    // Extract unique Strong's numbers
    const strongsNumbers = [
      ...new Set(strongsData.map((row) => row.strongs_number)),
    ];

    // Find other verses with these Strong's numbers
    const { data: connectedVerses, error: connectedError } = await supabase
      .from("verse_strongs")
      .select("verse_id, strongs_number")
      .in("strongs_number", strongsNumbers)
      .not("verse_id", "in", `(${sourceIds.join(",")})`) // Exclude source verses
      .limit(limit);

    if (connectedError || !connectedVerses) {
      console.error(
        "[Edge Fetchers] Error fetching connected verses:",
        connectedError,
      );
      return [];
    }

    // Create edges with metadata about which Strong's number connects them
    const edges: VisualEdge[] = [];
    const seenPairs = new Set<string>();

    for (const source of strongsData) {
      for (const target of connectedVerses) {
        if (source.strongs_number === target.strongs_number) {
          const pairKey = `${source.verse_id}-${target.verse_id}`;

          // Avoid duplicate edges
          if (!seenPairs.has(pairKey)) {
            edges.push({
              from: source.verse_id,
              to: target.verse_id,
              weight: 0.6,
              type: "ROOTS",
              metadata: {
                strongsNumber: source.strongs_number,
              },
            });
            seenPairs.add(pairKey);
          }
        }
      }
    }

    console.log(`[Edge Fetchers] Found ${edges.length} ROOTS edges`);
    return edges.slice(0, limit);
  } catch (error) {
    console.error("[Edge Fetchers] Error in fetchRootsEdges:", error);
    return [];
  }
}

/**
 * Fetch ECHOES edges (NT citations of OT)
 *
 * Strategy:
 * 1. Check if source verses are OT or NT
 * 2. If OT: Find NT verses that quote them
 * 3. If NT: Find OT verses they quote
 *
 * Note: Requires citations table to be populated.
 * For MVP, we'll return empty array.
 */
export async function fetchEchoesEdges(
  sourceIds: number[],
  limit: number = 30,
): Promise<VisualEdge[]> {
  if (sourceIds.length === 0) return [];

  try {
    // Check if citations table exists
    const { data: citationsData, error: citationsError } = await supabase
      .from("citations")
      .select("nt_verse_id, ot_verse_id, quote_type")
      .or(
        `nt_verse_id.in.(${sourceIds.join(",")}),ot_verse_id.in.(${sourceIds.join(",")})`,
      )
      .limit(limit);

    if (citationsError || !citationsData || citationsData.length === 0) {
      console.log(
        "[Edge Fetchers] No citations data available yet for ECHOES edges",
      );
      return [];
    }

    // Create bidirectional edges (OT ← → NT)
    const edges: VisualEdge[] = citationsData.map((row) => ({
      from: row.ot_verse_id,
      to: row.nt_verse_id,
      weight: 0.9, // Citations are strong connections
      type: "ECHOES",
      metadata: {
        quoteType: row.quote_type,
      },
    }));

    console.log(`[Edge Fetchers] Found ${edges.length} ECHOES edges`);
    return edges;
  } catch (error) {
    console.error("[Edge Fetchers] Error in fetchEchoesEdges:", error);
    return [];
  }
}

/**
 * Fetch PROPHECY edges (prophetic fulfillment)
 *
 * Note: Requires prophecies table to be populated.
 * For MVP, we'll return empty array.
 */
export async function fetchProphecyEdges(
  sourceIds: number[],
  limit: number = 20,
): Promise<VisualEdge[]> {
  if (sourceIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("prophecies")
      .select("source_verse_id, fulfillment_verse_id, confidence")
      .or(
        `source_verse_id.in.(${sourceIds.join(",")}),fulfillment_verse_id.in.(${sourceIds.join(",")})`,
      )
      .limit(limit);

    if (error || !data || data.length === 0) {
      console.log("[Edge Fetchers] No prophecy data available yet");
      return [];
    }

    return data.map((row) => ({
      from: row.source_verse_id,
      to: row.fulfillment_verse_id,
      weight: row.confidence || 0.7,
      type: "PROPHECY",
      metadata: {
        confidence: row.confidence,
      },
    }));
  } catch (error) {
    console.error("[Edge Fetchers] Error in fetchProphecyEdges:", error);
    return [];
  }
}

/**
 * Fetch GENEALOGY edges (family relationships)
 *
 * Note: Requires genealogies table to be populated.
 * For MVP, we'll return empty array.
 */
export async function fetchGenealogyEdges(
  sourceIds: number[],
  limit: number = 20,
): Promise<VisualEdge[]> {
  if (sourceIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("genealogies")
      .select("verse_id, person_name, parent_name")
      .in("verse_id", sourceIds)
      .limit(limit);

    if (error || !data || data.length === 0) {
      console.log("[Edge Fetchers] No genealogy data available yet");
      return [];
    }

    // This is simplified - real implementation would need to:
    // 1. Find verses mentioning the same people
    // 2. Create edges based on family relationships
    return [];
  } catch (error) {
    console.error("[Edge Fetchers] Error in fetchGenealogyEdges:", error);
    return [];
  }
}

/**
 * Fetch all edge types for a set of verses
 * Returns combined edges from all available data sources
 */
export async function fetchAllEdges(
  sourceIds: number[],
  options: {
    includeDEEPER?: boolean;
    includeROOTS?: boolean;
    includeECHOES?: boolean;
    includePROPHECY?: boolean;
    includeGENEALOGY?: boolean;
    useSemanticThreads?: boolean; // NEW: Use embedding-based high-conviction threads
  } = {},
): Promise<VisualEdge[]> {
  const {
    includeDEEPER = true,
    includeROOTS = true,
    includeECHOES = true,
    includePROPHECY = false,
    includeGENEALOGY = false,
    useSemanticThreads = true, // Default to true - better than empty tables
  } = options;

  console.log(
    "[Edge Fetchers] Fetching edges for",
    sourceIds.length,
    "source verses",
  );
  console.log("[Edge Fetchers] Options:", {
    includeDEEPER,
    includeROOTS,
    includeECHOES,
    includePROPHECY,
    includeGENEALOGY,
    useSemanticThreads,
  });

  const fetchers: Promise<VisualEdge[]>[] = [];

  // Always include DEEPER (cross-references)
  if (includeDEEPER) fetchers.push(fetchDeeperEdges(sourceIds));

  // Use semantic threads if enabled, otherwise try table-based fetchers
  if (useSemanticThreads) {
    if (includeROOTS) fetchers.push(findGoldThreads(sourceIds, 0.75)); // High same-testament similarity
    if (includeECHOES) fetchers.push(findPurpleThreads(sourceIds, 0.7)); // High cross-testament similarity
    if (includePROPHECY) fetchers.push(findCyanThreads(sourceIds, 0.65)); // Prophetic patterns
  } else {
    // Fallback to table-based fetchers (will be empty until populated)
    if (includeROOTS) fetchers.push(fetchRootsEdges(sourceIds));
    if (includeECHOES) fetchers.push(fetchEchoesEdges(sourceIds));
    if (includePROPHECY) fetchers.push(fetchProphecyEdges(sourceIds));
    if (includeGENEALOGY) fetchers.push(fetchGenealogyEdges(sourceIds));
  }

  const results = await Promise.all(fetchers);
  const allEdges = results.flat();

  console.log(`[Edge Fetchers] Total edges fetched: ${allEdges.length}`);
  console.log(`[Edge Fetchers] Breakdown:`, {
    DEEPER: allEdges.filter((e) => e.type === "DEEPER").length,
    ROOTS: allEdges.filter((e) => e.type === "ROOTS").length,
    ECHOES: allEdges.filter((e) => e.type === "ECHOES").length,
    PROPHECY: allEdges.filter((e) => e.type === "PROPHECY").length,
    GENEALOGY: allEdges.filter((e) => e.type === "GENEALOGY").length,
  });

  console.log(`[Edge Fetchers] High-conviction threads:`, {
    goldThreads: allEdges.filter((e) => e.metadata?.thread === "lexical")
      .length,
    purpleThreads: allEdges.filter((e) => e.metadata?.thread === "theological")
      .length,
    cyanThreads: allEdges.filter((e) => e.metadata?.thread === "prophetic")
      .length,
  });

  return allEdges;
}
