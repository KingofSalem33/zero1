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
  getPericopesByIds,
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
  NARRATIVE_PARALLEL: "NARRATIVE",
  THEMATIC_ECHO: "PATTERN",
  TYPE_ANTITYPE: "TYPOLOGY",
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

type PericopeTarget = {
  id: number;
  source: number;
  connection: PericopeConnection;
};

const resolvePericopeExpansion = async (
  pericopeId: number,
  ringConfig: PericopeRingConfig = {},
): Promise<{
  ring1Targets: PericopeTarget[];
  ring2Targets: PericopeTarget[];
  scopeIds: number[];
}> => {
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

  const visited = new Set<number>([pericopeId]);
  const ring1Connections = await getPericopeConnections(pericopeId, ring1Limit);
  const ring1Targets: PericopeTarget[] = [];

  for (const connection of ring1Connections) {
    if (visited.has(connection.target_pericope_id)) continue;
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

  const ring2Targets: PericopeTarget[] = [];
  if (ring2Limit > 0 && ring1Targets.length > 0) {
    const perSourceLimit = Math.ceil(
      ring2Limit / Math.max(ring1Targets.length, 1),
    );
    const ring2ConnectionGroups = await Promise.all(
      ring1Targets.map((ring1Target) =>
        getPericopeConnections(ring1Target.id, perSourceLimit),
      ),
    );

    for (const connection of ring2ConnectionGroups
      .flat()
      .slice(0, ring2Limit)) {
      if (visited.has(connection.target_pericope_id)) continue;
      visited.add(connection.target_pericope_id);
      ring2Targets.push({
        id: connection.target_pericope_id,
        source: connection.source_pericope_id,
        connection,
      });
    }
  }

  return {
    ring1Targets,
    ring2Targets,
    scopeIds: [
      pericopeId,
      ...ring1Targets.map((target) => target.id),
      ...ring2Targets.map((target) => target.id),
    ],
  };
};

export async function resolvePericopeScopeForVerse(
  verseId: number,
  existingContext?: PericopeDetail | null,
): Promise<{
  pericopeContext: PericopeDetail | null;
  pericopeIds: number[] | null;
}> {
  const pericopeContext =
    existingContext ||
    (await getPericopeForVerse(verseId, ENV.PERICOPE_SOURCE || "SIL_AI"));

  if (!pericopeContext) {
    return { pericopeContext: null, pericopeIds: null };
  }

  const expansion = await resolvePericopeExpansion(pericopeContext.id);
  return {
    pericopeContext,
    pericopeIds: expansion.scopeIds,
  };
}

export async function buildPericopeScopeForVerse(
  verseId: number,
  existingContext?: PericopeDetail | null,
): Promise<{
  pericopeContext: PericopeDetail | null;
  pericopeBundle: VisualContextBundle | null;
  pericopeIds: number[] | null;
}> {
  const scope = await resolvePericopeScopeForVerse(verseId, existingContext);

  if (!scope.pericopeContext) {
    return { pericopeContext: null, pericopeBundle: null, pericopeIds: null };
  }

  let pericopeBundle: VisualContextBundle | null = null;
  try {
    pericopeBundle = await buildPericopeBundle(scope.pericopeContext.id);
  } catch (error) {
    console.warn(
      "[Pericope Scope] Failed to build pericope bundle:",
      error instanceof Error ? error.message : error,
    );
  }

  return {
    pericopeContext: scope.pericopeContext,
    pericopeBundle,
    pericopeIds: scope.pericopeIds,
  };
}

export async function buildPericopeBundle(
  pericopeId: number,
  ringConfig: PericopeRingConfig = {},
): Promise<VisualContextBundle | null> {
  const [anchor, expansion] = await Promise.all([
    getPericopeById(pericopeId),
    resolvePericopeExpansion(pericopeId, ringConfig),
  ]);
  if (!anchor) return null;

  const [ring1Pericopes, ring2Pericopes] = await Promise.all([
    getPericopesByIds(expansion.ring1Targets.map((target) => target.id)),
    getPericopesByIds(expansion.ring2Targets.map((target) => target.id)),
  ]);
  const ring1PericopeById = new Map(
    ring1Pericopes.map((pericope) => [pericope.id, pericope]),
  );
  const ring2PericopeById = new Map(
    ring2Pericopes.map((pericope) => [pericope.id, pericope]),
  );

  const nodes: ThreadNode[] = [buildPericopeNode(anchor, 0)];
  const edges: VisualEdge[] = [];

  for (const ring1Target of expansion.ring1Targets) {
    const pericope = ring1PericopeById.get(ring1Target.id);
    if (!pericope) continue;
    nodes.push(buildPericopeNode(pericope, 1, anchor.id));
    edges.push({
      from: ring1Target.connection.source_pericope_id,
      to: ring1Target.connection.target_pericope_id,
      weight: ring1Target.connection.similarity_score,
      type: EDGE_TYPE_MAP[ring1Target.connection.connection_type] || "DEEPER",
      metadata: {
        connection_type: ring1Target.connection.connection_type,
        shared_themes: ring1Target.connection.shared_themes || [],
      },
    });
  }

  for (const ring2Target of expansion.ring2Targets) {
    const pericope = ring2PericopeById.get(ring2Target.id);
    if (!pericope) continue;
    nodes.push(
      buildPericopeNode(pericope, 2, ring2Target.connection.source_pericope_id),
    );
    edges.push({
      from: ring2Target.connection.source_pericope_id,
      to: ring2Target.connection.target_pericope_id,
      weight: ring2Target.connection.similarity_score,
      type: EDGE_TYPE_MAP[ring2Target.connection.connection_type] || "DEEPER",
      metadata: {
        connection_type: ring2Target.connection.connection_type,
        shared_themes: ring2Target.connection.shared_themes || [],
      },
    });
  }

  return {
    nodes,
    edges,
    rootId: anchor.id,
    lens: "NARRATIVE",
  };
}
