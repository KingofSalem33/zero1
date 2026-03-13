import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
} from "d3-force";
import type {
  EdgeType,
  ThreadNode,
  VisualContextBundle,
  VisualEdge,
} from "../contracts/visualizationContracts";

export type NarrativeMapConnectionFamily =
  | "GREY"
  | "CROSS_REFERENCE"
  | "LEXICON"
  | "ECHO"
  | "FULFILLMENT"
  | "PATTERN";

export interface NarrativeMapGraphNode extends ThreadNode {
  x: number;
  y: number;
  width: number;
  height: number;
  isAnchor: boolean;
  collapsedChildCount: number;
  semanticConnectionType?: NarrativeMapConnectionFamily;
}

export interface NarrativeMapGraphEdge extends VisualEdge {
  id: string;
  styleType: NarrativeMapConnectionFamily;
  isSynthetic: boolean;
  isLLMDiscovered: boolean;
  isStructural: boolean;
  isAnchorRay: boolean;
}

type ForceNode = {
  id: string;
  x: number;
  y: number;
  similarity: number;
  depth: number;
  mass: number;
  centrality: number;
  isAnchor: boolean;
};

type ForceLink = {
  source: string;
  target: string;
  distance: number;
  weight?: number;
  isStructural?: boolean;
};

const FORCE_CONFIG = {
  CENTER_STRENGTH: 0.18,
  LINK_STRENGTH: 1.0,
  ANCHOR_REPULSION: -5200,
  BASE_REPULSION: -950,
  RADIAL_STRENGTH: 0.55,
  RADIAL_BASE_RADIUS: 240,
  RADIAL_OFFSET: 120,
  ANCHOR_RADIUS: 120,
  NODE_BASE_RADIUS: 70,
  SIMULATION_TICKS: 300,
} as const;

const EDGE_DISTANCE_MAP: Record<NarrativeMapConnectionFamily, number> = {
  CROSS_REFERENCE: 165,
  LEXICON: 125,
  ECHO: 145,
  FULFILLMENT: 135,
  PATTERN: 150,
  GREY: 210,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function getNarrativeMapNodeDimensions(
  node: ThreadNode,
  isAnchor: boolean,
) {
  const depth = node.depth || 0;
  if (isAnchor) return { width: 180, height: 90 };
  if (depth === 1) return { width: 120, height: 50 };
  if (depth === 2) return { width: 105, height: 52 };
  return { width: 100, height: 52 };
}

export function buildInitialExpandedNodeIds(bundle: VisualContextBundle) {
  const expanded = new Set<number>();
  if (bundle.rootId) {
    expanded.add(bundle.rootId);
    bundle.nodes.forEach((node) => {
      if (typeof node.depth === "number" && node.depth <= 1) {
        expanded.add(node.id);
      }
    });
  }
  return expanded;
}

export function getVisibleNarrativeMapNodes(
  bundle: VisualContextBundle,
  expandedIds = buildInitialExpandedNodeIds(bundle),
) {
  return bundle.nodes.filter((node) => {
    if (node.isVisible) return true;
    if (expandedIds.has(node.id)) return true;
    if (node.parentId && expandedIds.has(node.parentId)) return true;
    return false;
  });
}

function buildEdgeLookup(bundle: VisualContextBundle) {
  const lookup = new Map<string, VisualEdge>();
  bundle.edges.forEach((edge) => {
    lookup.set(`${edge.from}:${edge.to}`, edge);
    lookup.set(`${edge.to}:${edge.from}`, edge);
  });
  return lookup;
}

export function resolveNarrativeConnectionFamily(
  edgeType: EdgeType,
  metadata?: Record<string, unknown>,
): NarrativeMapConnectionFamily {
  const source = metadata?.source;

  if (edgeType === "DEEPER" || edgeType === "NARRATIVE") {
    return "CROSS_REFERENCE";
  }
  if (edgeType === "ROOTS") {
    return source === "semantic_thread" ? "ECHO" : "LEXICON";
  }
  if (edgeType === "ECHOES" || edgeType === "ALLUSION") {
    return "ECHO";
  }
  if (edgeType === "PROPHECY" || edgeType === "FULFILLMENT") {
    return "FULFILLMENT";
  }
  if (
    edgeType === "TYPOLOGY" ||
    edgeType === "CONTRAST" ||
    edgeType === "PROGRESSION" ||
    edgeType === "PATTERN" ||
    edgeType === "GENEALOGY"
  ) {
    return "PATTERN";
  }
  return "CROSS_REFERENCE";
}

export function buildRenderableNarrativeMapEdges(
  bundle: VisualContextBundle,
  visibleNodes = getVisibleNarrativeMapNodes(bundle),
) {
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const renderable: NarrativeMapGraphEdge[] = [];
  const edgeSet = new Set<string>();

  bundle.edges
    .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
    .forEach((edge) => {
      const edgeKey = `${edge.from}->${edge.to}`;
      if (edgeSet.has(edgeKey)) return;

      const metadata = edge.metadata as Record<string, unknown> | undefined;
      renderable.push({
        ...edge,
        id: `e${edge.from}-${edge.to}`,
        styleType: resolveNarrativeConnectionFamily(edge.type, metadata),
        isSynthetic: false,
        isLLMDiscovered: metadata?.source === "llm",
        isStructural: metadata?.source === "structure",
        isAnchorRay: edge.from === bundle.rootId || edge.to === bundle.rootId,
      });
      edgeSet.add(edgeKey);
    });

  visibleNodes.forEach((node) => {
    if (!node.parentId || !visibleIds.has(node.parentId)) return;
    const edgeKey = `${node.parentId}->${node.id}`;
    if (edgeSet.has(edgeKey)) return;

    renderable.push({
      id: `e${node.parentId}-${node.id}-synthetic`,
      from: node.parentId,
      to: node.id,
      type: "NARRATIVE",
      weight: 0.4,
      metadata: { source: "structure" },
      styleType: "GREY",
      isSynthetic: true,
      isLLMDiscovered: false,
      isStructural: true,
      isAnchorRay: node.parentId === bundle.rootId || node.id === bundle.rootId,
    });
    edgeSet.add(edgeKey);
  });

  return renderable;
}

function getLinkDistance(edge: NarrativeMapGraphEdge): number {
  const base = EDGE_DISTANCE_MAP[edge.styleType] || 150;
  const weight = typeof edge.weight === "number" ? edge.weight : 0.7;
  const structuralFactor = edge.isStructural ? 0.7 : 1;
  const weighted = base * (1.15 - weight * 0.5) * structuralFactor;
  return clamp(weighted, 80, 260);
}

function getLinkStrength(edge: ForceLink): number {
  const weight = typeof edge.weight === "number" ? edge.weight : 0.7;
  const structuralBonus = edge.isStructural ? 0.35 : 0;
  const strength =
    FORCE_CONFIG.LINK_STRENGTH * (0.45 + weight + structuralBonus);
  return clamp(strength, 0.3, 2.4);
}

function getNodeRadius(node: {
  isAnchor?: boolean;
  depth?: number;
  mass?: number;
}) {
  if (node.isAnchor) return FORCE_CONFIG.ANCHOR_RADIUS;
  const depth = node.depth || 1;
  const mass = node.mass || 1;
  const base = FORCE_CONFIG.NODE_BASE_RADIUS / (depth * 0.5 + 0.5);
  return base * (0.8 + mass * 0.25);
}

function getRepulsionStrength(node: {
  isAnchor?: boolean;
  similarity?: number;
  mass?: number;
}) {
  if (node.isAnchor) return FORCE_CONFIG.ANCHOR_REPULSION;
  const similarity = node.similarity || 0;
  const mass = node.mass || 1;
  const base = FORCE_CONFIG.BASE_REPULSION * (1 - similarity * 0.8);
  return base * (0.7 + mass * 0.3);
}

export function calculateNarrativeMapForcePositions(
  nodes: Array<{
    id: string;
    depth: number;
    similarity?: number;
    mass?: number;
    centrality?: number;
    isAnchor: boolean;
  }>,
  edges: NarrativeMapGraphEdge[],
  anchorId?: number,
) {
  const anchorNode = nodes.find(
    (node) => node.isAnchor || node.id === anchorId?.toString(),
  );
  const d3Nodes: ForceNode[] = nodes.map((node) => {
    const seed = hashString(`${anchorId ?? "anchor"}:${node.id}`);
    const rand = mulberry32(seed);
    return {
      id: node.id,
      x: anchorNode?.id === node.id ? 0 : rand() * 400 - 200,
      y: anchorNode?.id === node.id ? 0 : rand() * 400 - 200,
      similarity: node.similarity || 0,
      depth: node.depth || 1,
      mass: node.mass || 1,
      centrality: node.centrality || 0,
      isAnchor: node.isAnchor,
    };
  });

  const d3Links: ForceLink[] = edges.map((edge) => ({
    source: edge.from.toString(),
    target: edge.to.toString(),
    distance: getLinkDistance(edge),
    weight: edge.weight,
    isStructural: edge.isStructural,
  }));

  const simulation = forceSimulation<ForceNode>(d3Nodes)
    .force("center", forceCenter(0, 0).strength(FORCE_CONFIG.CENTER_STRENGTH))
    .force(
      "link",
      forceLink<ForceNode, ForceLink>(d3Links)
        .id((node) => node.id)
        .distance((link) => link.distance)
        .strength((link) => getLinkStrength(link)),
    )
    .force(
      "charge",
      forceManyBody<ForceNode>().strength((node) => getRepulsionStrength(node)),
    )
    .force(
      "collide",
      forceCollide<ForceNode>().radius((node) => getNodeRadius(node)),
    )
    .force(
      "radial",
      forceRadial(
        (node: ForceNode) => {
          if (node.isAnchor) return 0;
          const base =
            FORCE_CONFIG.RADIAL_BASE_RADIUS * node.depth +
            FORCE_CONFIG.RADIAL_OFFSET;
          return Math.max(80, base - ((node.mass || 1) - 1) * 12);
        },
        0,
        0,
      ).strength(FORCE_CONFIG.RADIAL_STRENGTH),
    )
    .on("tick", () => {
      const anchor = d3Nodes.find((node) => node.isAnchor);
      if (anchor) {
        anchor.x = 0;
        anchor.y = 0;
      }
    });

  simulation.tick(FORCE_CONFIG.SIMULATION_TICKS);
  simulation.stop();

  return new Map(d3Nodes.map((node) => [node.id, { x: node.x, y: node.y }]));
}

export function deriveNarrativeMapGraph(
  bundle: VisualContextBundle,
  options?: { expandedIds?: Set<number> },
) {
  const expandedIds =
    options?.expandedIds || buildInitialExpandedNodeIds(bundle);
  const visibleNodes = getVisibleNarrativeMapNodes(bundle, expandedIds);
  const edgeLookup = buildEdgeLookup(bundle);
  const edges = buildRenderableNarrativeMapEdges(bundle, visibleNodes);
  const positions = calculateNarrativeMapForcePositions(
    visibleNodes.map((node) => ({
      id: node.id.toString(),
      depth: node.depth || 0,
      similarity: (node as ThreadNode & { similarity?: number }).similarity,
      mass: node.mass,
      centrality: node.centrality,
      isAnchor: node.id === bundle.rootId,
    })),
    edges,
    bundle.rootId,
  );

  const nodes: NarrativeMapGraphNode[] = visibleNodes.map((node) => {
    const isAnchor = node.id === bundle.rootId;
    const dimensions = getNarrativeMapNodeDimensions(node, isAnchor);
    const position = positions.get(node.id.toString()) || { x: 0, y: 0 };
    const allChildren = bundle.nodes.filter(
      (candidate) => candidate.parentId === node.id,
    );
    const visibleChildren = allChildren.filter(
      (child) =>
        child.isVisible || (child.parentId && expandedIds.has(child.parentId)),
    );
    let semanticConnectionType: NarrativeMapConnectionFamily | undefined;
    if (!isAnchor) {
      const inferredParentId =
        node.parentId ?? (node.depth === 1 ? bundle.rootId : undefined);
      if (inferredParentId) {
        const edge = edgeLookup.get(`${inferredParentId}:${node.id}`);
        if (edge) {
          semanticConnectionType = resolveNarrativeConnectionFamily(
            edge.type,
            edge.metadata as Record<string, unknown> | undefined,
          );
        }
      }
    }

    return {
      ...node,
      isAnchor,
      width: dimensions.width,
      height: dimensions.height,
      x: position.x,
      y: position.y,
      collapsedChildCount: allChildren.length - visibleChildren.length,
      semanticConnectionType,
    };
  });

  return {
    expandedIds,
    nodes,
    edges,
    maxDepth: nodes.reduce(
      (maxDepth, node) => Math.max(maxDepth, node.depth || 0),
      0,
    ),
  };
}
