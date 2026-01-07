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
      .select("prophecy_verse_id, fulfillment_verse_id, prophecy_type")
      .or(
        `prophecy_verse_id.in.(${sourceIds.join(",")}),fulfillment_verse_id.in.(${sourceIds.join(",")})`,
      )
      .limit(limit);

    if (error || !data || data.length === 0) {
      console.log("[Edge Fetchers] No prophecy data available yet");
      return [];
    }

    return data.map((row) => ({
      from: row.prophecy_verse_id,
      to: row.fulfillment_verse_id,
      weight: 0.85,
      type: "PROPHECY",
      metadata: {
        prophecyType: row.prophecy_type,
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
      .select("ancestor_verse_id, descendant_verse_id, relationship")
      .or(
        `ancestor_verse_id.in.(${sourceIds.join(",")}),descendant_verse_id.in.(${sourceIds.join(",")})`,
      )
      .limit(limit);

    if (error || !data || data.length === 0) {
      console.log("[Edge Fetchers] No genealogy data available yet");
      return [];
    }

    return data.map((row) => ({
      from: row.ancestor_verse_id,
      to: row.descendant_verse_id,
      weight: 0.75,
      type: "GENEALOGY",
      metadata: {
        relationship: row.relationship,
      },
    }));
  } catch (error) {
    console.error("[Edge Fetchers] Error in fetchGenealogyEdges:", error);
    return [];
  }
}

const FALLBACK_THRESHOLDS = {
  roots: 3,
  echoes: 2,
  prophecy: 2,
};

const mergeEdges = (primary: VisualEdge[], secondary: VisualEdge[]) => {
  if (secondary.length === 0) return primary;
  const seen = new Set(
    primary.map((edge) => `${edge.from}|${edge.to}|${edge.type}`),
  );
  const merged = [...primary];
  secondary.forEach((edge) => {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (!seen.has(key)) {
      merged.push(edge);
      seen.add(key);
    }
  });
  return merged;
};

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

  const deeperPromise = includeDEEPER
    ? fetchDeeperEdges(sourceIds)
    : Promise.resolve([]);
  const rootsPromise = includeROOTS
    ? fetchRootsEdges(sourceIds)
    : Promise.resolve([]);
  const echoesPromise = includeECHOES
    ? fetchEchoesEdges(sourceIds)
    : Promise.resolve([]);
  const prophecyPromise = includePROPHECY
    ? fetchProphecyEdges(sourceIds)
    : Promise.resolve([]);
  const genealogyPromise = includeGENEALOGY
    ? fetchGenealogyEdges(sourceIds)
    : Promise.resolve([]);

  const [
    deeperEdges,
    rootsCanonical,
    echoesCanonical,
    prophecyCanonical,
    genealogyCanonical,
  ] = await Promise.all([
    deeperPromise,
    rootsPromise,
    echoesPromise,
    prophecyPromise,
    genealogyPromise,
  ]);

  let rootsEdges = rootsCanonical;
  if (
    includeROOTS &&
    useSemanticThreads &&
    rootsCanonical.length < FALLBACK_THRESHOLDS.roots
  ) {
    const semanticRoots = await findGoldThreads(sourceIds, 0.75);
    rootsEdges = mergeEdges(rootsCanonical, semanticRoots);
  }

  let echoesEdges = echoesCanonical;
  if (
    includeECHOES &&
    useSemanticThreads &&
    echoesCanonical.length < FALLBACK_THRESHOLDS.echoes
  ) {
    const semanticEchoes = await findPurpleThreads(sourceIds, 0.55);
    echoesEdges = mergeEdges(echoesCanonical, semanticEchoes);
  }

  let prophecyEdges = prophecyCanonical;
  if (
    includePROPHECY &&
    useSemanticThreads &&
    prophecyCanonical.length < FALLBACK_THRESHOLDS.prophecy
  ) {
    const semanticProphecy = await findCyanThreads(sourceIds, 0.5);
    prophecyEdges = mergeEdges(prophecyCanonical, semanticProphecy);
  }

  const allEdges = [
    ...deeperEdges,
    ...rootsEdges,
    ...echoesEdges,
    ...prophecyEdges,
    ...genealogyCanonical,
  ];

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
