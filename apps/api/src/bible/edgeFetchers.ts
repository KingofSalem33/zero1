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
import { VisualEdge, type EdgeType } from "./types";
import {
  findGoldThreads,
  findPurpleThreads,
  findCyanThreads,
} from "./semanticThreads";

const EDGE_POLICY: {
  weights: Record<EdgeType, number>;
  caps: Record<EdgeType, number>;
} = {
  weights: {
    DEEPER: 0.88,
    ROOTS: 0.94,
    ECHOES: 0.98,
    PROPHECY: 0.96,
    GENEALOGY: 0.9,
    NARRATIVE: 0.2,
    TYPOLOGY: 0.92,
    FULFILLMENT: 0.95,
    CONTRAST: 0.85,
    PROGRESSION: 0.88,
    PATTERN: 0.9,
  },
  caps: {
    DEEPER: 80,
    ROOTS: 60,
    ECHOES: 40,
    PROPHECY: 30,
    GENEALOGY: 30,
    NARRATIVE: 40,
    TYPOLOGY: 25,
    FULFILLMENT: 25,
    CONTRAST: 20,
    PROGRESSION: 20,
    PATTERN: 20,
  },
};

const LLM_CONFIDENCE_MIN = 0.9;

const applyEdgeWeight = (edge: VisualEdge): VisualEdge => {
  const baseWeight = EDGE_POLICY.weights[edge.type] ?? edge.weight;
  const source = edge.metadata?.source;

  if (source === "llm") {
    const confidence =
      typeof edge.metadata?.confidence === "number"
        ? edge.metadata.confidence
        : 1;
    return { ...edge, weight: Math.min(baseWeight, confidence) };
  }

  if (source === "canonical") {
    return { ...edge, weight: baseWeight };
  }

  if (edge.metadata?.thread) {
    const cap = Math.max(0.05, baseWeight - 0.04);
    return { ...edge, weight: Math.min(edge.weight, cap) };
  }

  return { ...edge, weight: edge.weight ?? baseWeight };
};

const applyEdgeCaps = (edges: VisualEdge[]): VisualEdge[] => {
  const grouped = new Map<EdgeType, VisualEdge[]>();

  edges.forEach((edge) => {
    const group = grouped.get(edge.type) ?? [];
    group.push(edge);
    grouped.set(edge.type, group);
  });

  const capped: VisualEdge[] = [];
  grouped.forEach((group, type) => {
    const cap = EDGE_POLICY.caps[type] ?? group.length;
    if (group.length <= cap) {
      capped.push(...group);
      return;
    }

    const sorted = [...group].sort((a, b) => {
      const aCanonical = a.metadata?.source === "canonical" ? 1 : 0;
      const bCanonical = b.metadata?.source === "canonical" ? 1 : 0;
      if (aCanonical !== bCanonical) {
        return bCanonical - aCanonical;
      }
      return b.weight - a.weight;
    });

    capped.push(...sorted.slice(0, cap));
  });

  return capped;
};

/**
 * Fetch DEEPER edges (cross-references)
 * These are the theological/thematic connections from OpenBible.info
 */
export async function fetchDeeperEdges(
  sourceIds: number[],
  limit: number = EDGE_POLICY.caps.DEEPER,
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
    weight: EDGE_POLICY.weights.DEEPER,
    type: "DEEPER" as const,
    metadata: {
      source: "cross_reference",
    },
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
  limit: number = EDGE_POLICY.caps.ROOTS,
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
              weight: EDGE_POLICY.weights.ROOTS,
              type: "ROOTS",
              metadata: {
                strongsNumber: source.strongs_number,
                source: "canonical",
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
  limit: number = EDGE_POLICY.caps.ECHOES,
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
      weight: EDGE_POLICY.weights.ECHOES, // Citations are strong connections
      type: "ECHOES",
      metadata: {
        quoteType: row.quote_type,
        source: "canonical",
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
  limit: number = EDGE_POLICY.caps.PROPHECY,
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
      weight: EDGE_POLICY.weights.PROPHECY,
      type: "PROPHECY",
      metadata: {
        prophecyType: row.prophecy_type,
        source: "canonical",
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
  limit: number = EDGE_POLICY.caps.GENEALOGY,
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
      weight: EDGE_POLICY.weights.GENEALOGY,
      type: "GENEALOGY",
      metadata: {
        relationship: row.relationship,
        source: "canonical",
      },
    }));
  } catch (error) {
    console.error("[Edge Fetchers] Error in fetchGenealogyEdges:", error);
    return [];
  }
}

/**
 * Fetch LLM-discovered deep connections persisted in the database.
 */
export async function fetchDiscoveredEdges(
  sourceIds: number[],
  limit: number = 150,
  minConfidence: number = LLM_CONFIDENCE_MIN,
): Promise<VisualEdge[]> {
  if (sourceIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from("llm_connections")
      .select(
        "from_verse_id, to_verse_id, connection_type, explanation, confidence",
      )
      .or(
        `from_verse_id.in.(${sourceIds.join(",")}),to_verse_id.in.(${sourceIds.join(",")})`,
      )
      .gte("confidence", minConfidence)
      .limit(limit);

    if (error) {
      console.error("[Edge Fetchers] Error fetching LLM connections:", error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    return data
      .filter((row) => row.connection_type)
      .map((row) => ({
        from: row.from_verse_id,
        to: row.to_verse_id,
        weight:
          EDGE_POLICY.weights[row.connection_type as EdgeType] ??
          row.confidence ??
          0.9,
        type: row.connection_type as EdgeType,
        metadata: {
          explanation: row.explanation,
          confidence: row.confidence,
          source: "llm",
        },
      }));
  } catch (error) {
    console.error("[Edge Fetchers] Error in fetchDiscoveredEdges:", error);
    return [];
  }
}

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
    includeDISCOVERED?: boolean; // LLM-discovered edges from DB
    useSemanticThreads?: boolean; // NEW: Use embedding-based high-conviction threads
  } = {},
): Promise<VisualEdge[]> {
  const {
    includeDEEPER = true,
    includeROOTS = true,
    includeECHOES = true,
    includePROPHECY = false,
    includeGENEALOGY = false,
    includeDISCOVERED = true,
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
    includeDISCOVERED,
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
  const discoveredPromise = includeDISCOVERED
    ? fetchDiscoveredEdges(sourceIds)
    : Promise.resolve([]);

  const [
    deeperEdges,
    rootsCanonical,
    echoesCanonical,
    prophecyCanonical,
    genealogyCanonical,
    discoveredEdges,
  ] = await Promise.all([
    deeperPromise,
    rootsPromise,
    echoesPromise,
    prophecyPromise,
    genealogyPromise,
    discoveredPromise,
  ]);

  let rootsEdges = rootsCanonical;
  if (includeROOTS && useSemanticThreads && rootsCanonical.length === 0) {
    const semanticRoots = await findGoldThreads(sourceIds, 0.75);
    rootsEdges = mergeEdges(rootsCanonical, semanticRoots);
  }

  let echoesEdges = echoesCanonical;
  if (includeECHOES && useSemanticThreads && echoesCanonical.length === 0) {
    const semanticEchoes = await findPurpleThreads(sourceIds, 0.55);
    echoesEdges = mergeEdges(echoesCanonical, semanticEchoes);
  }

  let prophecyEdges = prophecyCanonical;
  if (includePROPHECY && useSemanticThreads && prophecyCanonical.length === 0) {
    const semanticProphecy = await findCyanThreads(sourceIds, 0.5);
    prophecyEdges = mergeEdges(prophecyCanonical, semanticProphecy);
  }

  const allEdges = [
    ...deeperEdges,
    ...rootsEdges,
    ...echoesEdges,
    ...prophecyEdges,
    ...genealogyCanonical,
    ...discoveredEdges,
  ];
  const weightedEdges = allEdges.map(applyEdgeWeight);
  const filteredEdges = applyEdgeCaps(weightedEdges);

  console.log(`[Edge Fetchers] Total edges fetched: ${filteredEdges.length}`);
  console.log(`[Edge Fetchers] Breakdown:`, {
    DEEPER: filteredEdges.filter((e) => e.type === "DEEPER").length,
    ROOTS: filteredEdges.filter((e) => e.type === "ROOTS").length,
    ECHOES: filteredEdges.filter((e) => e.type === "ECHOES").length,
    PROPHECY: filteredEdges.filter((e) => e.type === "PROPHECY").length,
    GENEALOGY: filteredEdges.filter((e) => e.type === "GENEALOGY").length,
    TYPOLOGY: filteredEdges.filter((e) => e.type === "TYPOLOGY").length,
    FULFILLMENT: filteredEdges.filter((e) => e.type === "FULFILLMENT").length,
    CONTRAST: filteredEdges.filter((e) => e.type === "CONTRAST").length,
    PROGRESSION: filteredEdges.filter((e) => e.type === "PROGRESSION").length,
    PATTERN: filteredEdges.filter((e) => e.type === "PATTERN").length,
  });

  console.log(`[Edge Fetchers] High-conviction threads:`, {
    goldThreads: filteredEdges.filter((e) => e.metadata?.thread === "lexical")
      .length,
    purpleThreads: filteredEdges.filter(
      (e) => e.metadata?.thread === "theological",
    ).length,
    cyanThreads: filteredEdges.filter((e) => e.metadata?.thread === "prophetic")
      .length,
    llmEdges: filteredEdges.filter((e) => e.metadata?.source === "llm").length,
  });

  return filteredEdges;
}
