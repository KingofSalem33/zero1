/**
 * Pericope Graph Walker
 *
 * Builds narrative-level bundles using cached pericope connections.
 */

import { supabase } from "../db";
import type { ThreadNode, VisualContextBundle, VisualEdge } from "./types";
import { getPericopeById, type PericopeDetail } from "./pericopeSearch";

type PericopeConnection = {
  source_pericope_id: number;
  target_pericope_id: number;
  connection_type: string;
  similarity_score: number;
  ring_depth: number | null;
  shared_themes: string[] | null;
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

export async function buildPericopeBundle(
  pericopeId: number,
  ringConfig: { ring1Limit?: number; ring2Limit?: number } = {},
): Promise<VisualContextBundle | null> {
  const ring1Limit = ringConfig.ring1Limit ?? 12;
  const ring2Limit = ringConfig.ring2Limit ?? 18;

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

  return {
    nodes,
    edges,
    rootId: anchor.id,
    lens: "NARRATIVE",
  };
}
