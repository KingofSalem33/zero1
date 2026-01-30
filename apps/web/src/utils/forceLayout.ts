/**
 * Force-Directed "Neural Network" Layout for Biblical Graph Visualization
 *
 * Replaces rigid circular ring layout with organic physics-based positioning:
 * - Anchor verse = "Sun" at center (large, glowing, fixed)
 * - Related verses = "Galaxy" floating around anchor
 * - Semantic similarity → clustering (similar verses gravitate together)
 * - Connection strength → link distance (stronger = closer)
 * - Depth → radial proximity (deeper verses farther from center)
 *
 * Uses D3-force simulation for natural, graph-aware positioning.
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceRadial,
} from "d3-force";
import type { Node, Edge } from "@xyflow/react";

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

type VerseNodeData = {
  verse?: {
    similarity?: number;
    depth?: number;
    mass?: number;
    centrality?: number;
  };
  isAnchor?: boolean;
};

type EdgeData = {
  styleType?: string;
  weight?: number;
  isStructural?: boolean;
};

/**
 * Force simulation configuration
 * These values control the "physics" of the layout
 */
const FORCE_CONFIG = {
  // Center force: Pull all nodes toward anchor (gravity)
  CENTER_STRENGTH: 0.18, // ⬇️ Reduced from 0.3 - weaker gravity = more spread

  // Link force: How strongly connected nodes pull together
  LINK_STRENGTH: 1.0, // ⬇️ Reduced from 1.5 - less pull = more space between clusters

  // Charge force: Repulsion strength
  ANCHOR_REPULSION: -5200, // Kept at -4000 - strong "sun" effect is good
  BASE_REPULSION: -950, // ⬆️ Increased from -400 - MORE repulsion = more space between nodes

  // Radial force: Organizes nodes into depth-based rings
  RADIAL_STRENGTH: 0.55, // ⬇️ Reduced from 0.6 - softer depth rings
  RADIAL_BASE_RADIUS: 240, // ⬆️ Increased from 140 - spread depth rings farther apart
  RADIAL_OFFSET: 120, // ⬆️ Increased from 50 - push first ring farther from center

  // Collision: Prevent node overlap
  ANCHOR_RADIUS: 120, // Kept at 120 - good anchor prominence
  NODE_BASE_RADIUS: 70, // ⬆️ Increased from 45 - more personal space per node

  // Simulation: How many iterations to run
  SIMULATION_TICKS: 300, // 300 ticks = stable layout
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const hashString = (value: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let result = t;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Edge family to visual distance mapping
 * Stronger connections = shorter distance = nodes pulled closer
 */
const EDGE_DISTANCE_MAP: Record<string, number> = {
  CROSS_REFERENCE: 165,
  LEXICON: 125,
  ECHO: 145,
  FULFILLMENT: 135,
  PATTERN: 150,
  // Legacy aliases (kept for backwards compatibility)
  GOLD: 125,
  PURPLE: 145,
  CYAN: 135,
  GENEALOGY: 150,
  TYPOLOGY: 150,
  CONTRAST: 165,
  PROGRESSION: 150,
  GREY: 210,
};

/**
 * Calculate link distance based on edge type
 * Stronger semantic connections result in shorter distances
 */
function getLinkDistance(edge: Edge): number {
  const edgeData = edge.data as EdgeData;
  const styleType = edgeData?.styleType || "GREY";
  const base = EDGE_DISTANCE_MAP[styleType] || 150;
  const weight = typeof edgeData?.weight === "number" ? edgeData.weight : 0.7;
  const structuralFactor = edgeData?.isStructural ? 0.7 : 1;
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

/**
 * Calculate collision radius based on node properties
 * Anchor is largest, depth affects size
 */
function getNodeRadius(node: {
  isAnchor?: boolean;
  depth?: number;
  mass?: number;
}): number {
  if (node.isAnchor) return FORCE_CONFIG.ANCHOR_RADIUS;

  // Smaller radius for deeper nodes (depth 1 > depth 2 > depth 3)
  const depth = node.depth || 1;
  const mass = node.mass || 1;
  const base = FORCE_CONFIG.NODE_BASE_RADIUS / (depth * 0.5 + 0.5);
  return base * (0.8 + mass * 0.25);
}

/**
 * Calculate repulsion strength based on node properties
 * - Anchor has strong repulsion (pushes others away like a sun)
 * - High similarity = weaker repulsion (allows clustering)
 * - Low similarity = stronger repulsion (spreads apart)
 */
function getRepulsionStrength(node: {
  isAnchor?: boolean;
  similarity?: number;
  mass?: number;
}): number {
  if (node.isAnchor) return FORCE_CONFIG.ANCHOR_REPULSION;

  // Use similarity to modulate repulsion
  // High similarity (0.8+) = -80 (very weak repulsion, tight clustering)
  // Low similarity (0.2) = -400 (strong repulsion, spreads out)
  const similarity = node.similarity || 0;
  const mass = node.mass || 1;
  const base = FORCE_CONFIG.BASE_REPULSION * (1 - similarity * 0.8);
  return base * (0.7 + mass * 0.3);
}

/**
 * Main force-directed layout calculation
 *
 * Takes React Flow nodes/edges and returns positioned coordinates using D3-force simulation.
 * Anchor node is fixed at center, other nodes float organically based on:
 * - Connections (linked nodes pull together)
 * - Similarity (similar verses cluster)
 * - Depth (deeper nodes farther from center)
 * - Repulsion (prevent overlap)
 *
 * @param nodes - React Flow nodes to position
 * @param edges - React Flow edges (connections)
 * @param anchorId - Optional anchor node ID to fix at center
 * @returns Map of node IDs to {x, y} positions
 */
export function calculateForceLayout(
  nodes: Node[],
  edges: Edge[],
  anchorId?: number,
): Map<string, { x: number; y: number }> {
  console.log(
    `[Force Layout] Calculating positions for ${nodes.length} nodes, ${edges.length} edges`,
  );

  // Find anchor node
  const anchorNode = nodes.find(
    (n) => n.data?.isAnchor || n.id === anchorId?.toString(),
  );

  if (anchorNode) {
    console.log(`[Force Layout] Anchor node: ${anchorNode.id}`);
  }

  // Center point (anchor will be fixed here)
  const centerX = 0;
  const centerY = 0;

  // Prepare D3 simulation nodes with relevant properties
  const d3Nodes: ForceNode[] = nodes.map((n) => {
    const nodeData = n.data as VerseNodeData;
    const isAnchor = nodeData?.isAnchor || false;
    const seed = hashString(`${anchorId ?? "anchor"}:${n.id}`);
    const rand = mulberry32(seed);
    const jitterX = rand() * 400 - 200;
    const jitterY = rand() * 400 - 200;
    return {
      id: n.id,
      // Initialize positions (anchor at center, others random nearby)
      x: anchorNode?.id === n.id ? centerX : jitterX,
      y: anchorNode?.id === n.id ? centerY : jitterY,
      // Node properties for force calculations
      similarity: nodeData?.verse?.similarity || 0,
      depth: nodeData?.verse?.depth || 1,
      mass: nodeData?.verse?.mass || 1,
      centrality: nodeData?.verse?.centrality || 0,
      isAnchor,
    };
  });

  // Prepare D3 links with distance based on edge type
  const d3Links: ForceLink[] = edges.map((e) => {
    const edgeData = e.data as EdgeData;
    return {
      source: e.source,
      target: e.target,
      distance: getLinkDistance(e),
      weight: edgeData?.weight,
      isStructural: edgeData?.isStructural,
    };
  });

  console.log(
    `[Force Layout] Created ${d3Nodes.length} simulation nodes, ${d3Links.length} links`,
  );

  // Create force simulation
  const simulation = forceSimulation<ForceNode>(d3Nodes)
    // CENTER: Pull all nodes toward anchor (weak gravity)
    .force(
      "center",
      forceCenter(centerX, centerY).strength(FORCE_CONFIG.CENTER_STRENGTH),
    )

    // LINK: Connect related verses (shorter distance = pull closer)
    .force(
      "link",
      forceLink<ForceNode, ForceLink>(d3Links)
        .id((d) => d.id)
        .distance((d) => d.distance)
        .strength((d) => getLinkStrength(d)),
    )

    // CHARGE: Repulsion between nodes (prevents overlap, allows clustering)
    .force(
      "charge",
      forceManyBody<ForceNode>().strength((d) => getRepulsionStrength(d)),
    )

    // COLLISION: Prevent nodes from overlapping
    .force(
      "collide",
      forceCollide<ForceNode>().radius((d) => getNodeRadius(d)),
    )

    // RADIAL: Organize by depth (creates organic ring structure)
    .force(
      "radial",
      forceRadial(
        (d: ForceNode) => {
          if (d.isAnchor) return 0; // Anchor stays at center
          // Depth 1 ~200px, Depth 2 ~350px, Depth 3 ~500px
          const mass = d.mass || 1;
          const base =
            FORCE_CONFIG.RADIAL_BASE_RADIUS * d.depth +
            FORCE_CONFIG.RADIAL_OFFSET;
          return Math.max(80, base - (mass - 1) * 12);
        },
        centerX,
        centerY,
      ).strength(FORCE_CONFIG.RADIAL_STRENGTH),
    )

    // Fix anchor position every tick
    .on("tick", () => {
      const anchor = d3Nodes.find((n) => n.isAnchor);
      if (anchor) {
        anchor.x = centerX;
        anchor.y = centerY;
      }
    });

  // Run simulation for fixed number of ticks (synchronous)
  console.log(
    `[Force Layout] Running simulation for ${FORCE_CONFIG.SIMULATION_TICKS} ticks...`,
  );
  const startTime = Date.now();

  simulation.tick(FORCE_CONFIG.SIMULATION_TICKS);
  simulation.stop();

  const duration = Date.now() - startTime;
  console.log(`[Force Layout] ✅ Simulation complete in ${duration}ms`);

  // Convert D3 node positions to React Flow position map
  const positionMap = new Map<string, { x: number; y: number }>();

  d3Nodes.forEach((n) => {
    positionMap.set(n.id, { x: n.x, y: n.y });
  });

  // Debug: Log position distribution
  const distances = d3Nodes
    .filter((n) => !n.isAnchor)
    .map((n) => Math.sqrt(n.x * n.x + n.y * n.y));

  if (distances.length > 0) {
    const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
    const maxDist = Math.max(...distances);
    console.log(
      `[Force Layout] Position stats - Avg distance: ${avgDist.toFixed(0)}px, Max: ${maxDist.toFixed(0)}px`,
    );
  }

  return positionMap;
}
