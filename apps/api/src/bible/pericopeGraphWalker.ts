/**
 * Pericope Graph Walker
 *
 * Builds narrative-level bundles using cached pericope connections.
 */

import { supabase } from "../db";
import { ENV } from "../env";
import type { ThreadNode, VisualContextBundle, VisualEdge } from "./types";
import {
  getPericopeById,
  getPericopeForVerse,
  type PericopeDetail,
} from "./pericopeSearch";

type PericopeConnection = {
  source_pericope_id: number;
  target_pericope_id: number;
  connection_type: string;
  similarity_score: number;
  ring_depth: number | null;
  shared_themes: string[] | null;
};

type AdaptiveConfig = {
  enabled?: boolean;
  startLimit?: number;
  minLimit?: number;
  multiplier?: number;
  signalThreshold?: number;
};

type PericopeRingConfig = {
  ring1Limit?: number;
  ring2Limit?: number;
  adaptive?: AdaptiveConfig;
};

const DEFAULT_RING_CONFIG: Required<
  Pick<PericopeRingConfig, "ring1Limit" | "ring2Limit">
> & { adaptive: Required<AdaptiveConfig> } = {
  ring1Limit: 12,
  ring2Limit: 18,
  adaptive: {
    enabled: true,
    startLimit: 3,
    minLimit: 2,
    multiplier: 2,
    signalThreshold: 0.8,
  },
};

const EDGE_TYPE_MAP: Record<string, VisualEdge["type"]> = {
  NARRATIVE_PARALLEL: "TYPOLOGY",
  THEMATIC_ECHO: "PATTERN",
  TYPE_ANTITYPE: "FULFILLMENT",
};

const buildPericopeNode = (
  pericope: PericopeDetail,
  depth: number,
  parentId?: number,
): ThreadNode => ({
  id: pericope.id,
  book_abbrev: pericope.startVerse.book_abbrev,
  book_name: pericope.startVerse.book_name,
  chapter: pericope.startVerse.chapter,
  verse: pericope.startVerse.verse,
  text: pericope.summary || pericope.title_generated || pericope.title,
  depth,
  parentId,
  isSpine: depth === 0,
  isVisible: true,
  collapsedChildCount: 0,
  ringSource: depth === 0 ? "ring0" : depth === 1 ? "ring1" : "ring2",
  displayLabel: pericope.title_generated || pericope.title,
  displaySubLabel: pericope.rangeRef,
});

const getPericopeConnections = async (
  sourceId: number,
  limit: number,
): Promise<PericopeConnection[]> => {
  const { data, error } = await supabase
    .from("pericope_connections")
    .select("*")
    .eq("source_pericope_id", sourceId)
    .order("similarity_score", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as PericopeConnection[];
};

export async function buildPericopeScopeForVerse(
  verseId: number,
  existingContext?: PericopeDetail | null,
): Promise<{
  pericopeContext: PericopeDetail | null;
  pericopeBundle: VisualContextBundle | null;
  pericopeIds: number[] | null;
}> {
  const pericopeContext =
    existingContext ||
    (await getPericopeForVerse(verseId, ENV.PERICOPE_SOURCE || "SIL_AI"));

  if (!pericopeContext) {
    return { pericopeContext: null, pericopeBundle: null, pericopeIds: null };
  }

  let pericopeBundle: VisualContextBundle | null = null;
  try {
    pericopeBundle = await buildPericopeBundle(pericopeContext.id);
  } catch (error) {
    console.warn(
      "[Pericope Scope] Failed to build pericope bundle:",
      error instanceof Error ? error.message : error,
    );
  }

  const pericopeIds = pericopeBundle?.nodes.map((node) => node.id) ?? [
    pericopeContext.id,
  ];

  return { pericopeContext, pericopeBundle, pericopeIds };
}

export async function buildPericopeBundle(
  pericopeId: number,
  ringConfig: PericopeRingConfig = {},
): Promise<VisualContextBundle | null> {
  const cfg: PericopeRingConfig = {
    ...DEFAULT_RING_CONFIG,
    ...ringConfig,
    adaptive: {
      ...DEFAULT_RING_CONFIG.adaptive,
      ...(ringConfig.adaptive ?? {}),
    },
  };
  const clampLimit = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  let ring1Limit = cfg.ring1Limit ?? DEFAULT_RING_CONFIG.ring1Limit;
  let ring2Limit = cfg.ring2Limit ?? DEFAULT_RING_CONFIG.ring2Limit;

  if (cfg.adaptive?.enabled) {
    const adaptiveStart = cfg.adaptive?.startLimit ?? 3;
    const adaptiveMin = cfg.adaptive?.minLimit ?? 2;
    ring1Limit = clampLimit(adaptiveStart, adaptiveMin, ring1Limit);
  }

  const anchor = await getPericopeById(pericopeId);
  if (!anchor) return null;

  const nodes: ThreadNode[] = [buildPericopeNode(anchor, 0)];
  const edges: VisualEdge[] = [];
  const visited = new Set<number>([anchor.id]);

  const ring1Connections = await getPericopeConnections(anchor.id, ring1Limit);
  const ring1Targets: Array<{
    id: number;
    source: number;
    connection: PericopeConnection;
  }> = [];

  for (const connection of ring1Connections) {
    if (visited.has(connection.target_pericope_id)) continue;
    const pericope = await getPericopeById(connection.target_pericope_id);
    if (!pericope) continue;
    nodes.push(buildPericopeNode(pericope, 1, anchor.id));
    edges.push({
      from: connection.source_pericope_id,
      to: connection.target_pericope_id,
      weight: connection.similarity_score,
      type: EDGE_TYPE_MAP[connection.connection_type] || "DEEPER",
      metadata: {
        connection_type: connection.connection_type,
        shared_themes: connection.shared_themes || [],
      },
    });
    visited.add(connection.target_pericope_id);
    ring1Targets.push({
      id: connection.target_pericope_id,
      source: connection.source_pericope_id,
      connection,
    });
  }

  if (cfg.adaptive?.enabled) {
    const threshold = cfg.adaptive?.signalThreshold ?? 0.8;
    const maxScore = ring1Targets.reduce(
      (max, target) => Math.max(max, target.connection.similarity_score ?? 0),
      0,
    );
    const strongTargets =
      maxScore > 0
        ? ring1Targets.filter(
            (target) =>
              target.connection.similarity_score >= maxScore * threshold,
          )
        : [];
    const strongSignalMass = strongTargets.reduce(
      (sum, target) => sum + (target.connection.similarity_score ?? 0),
      0,
    );

    if (strongSignalMass <= 0) {
      ring2Limit = 0;
    } else {
      const adaptiveMin = cfg.adaptive?.minLimit ?? 2;
      const adaptiveMultiplier = cfg.adaptive?.multiplier ?? 2;
      ring2Limit = clampLimit(
        Math.round(strongSignalMass * adaptiveMultiplier),
        adaptiveMin,
        ring2Limit,
      );
    }
  }

  if (ring2Limit > 0) {
    const ring2Connections: PericopeConnection[] = [];
    for (const ring1 of ring1Targets) {
      const nextConnections = await getPericopeConnections(
        ring1.id,
        Math.ceil(ring2Limit / Math.max(ring1Targets.length, 1)),
      );
      ring2Connections.push(...nextConnections);
    }

    for (const connection of ring2Connections.slice(0, ring2Limit)) {
      if (visited.has(connection.target_pericope_id)) continue;
      const pericope = await getPericopeById(connection.target_pericope_id);
      if (!pericope) continue;
      nodes.push(buildPericopeNode(pericope, 2, connection.source_pericope_id));
      edges.push({
        from: connection.source_pericope_id,
        to: connection.target_pericope_id,
        weight: connection.similarity_score,
        type: EDGE_TYPE_MAP[connection.connection_type] || "DEEPER",
        metadata: {
          connection_type: connection.connection_type,
          shared_themes: connection.shared_themes || [],
        },
      });
      visited.add(connection.target_pericope_id);
    }
  }

  return {
    nodes,
    edges,
    rootId: anchor.id,
    lens: "NARRATIVE",
  };
}
