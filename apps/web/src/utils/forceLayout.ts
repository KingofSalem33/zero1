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

/**
 * Force simulation configuration
 * These values control the "physics" of the layout
 */
const FORCE_CONFIG = {
  // Center force: Pull all nodes toward anchor (gravity)
  CENTER_STRENGTH: 0.25, // ⬇️ Reduced from 0.3 - weaker gravity = more spread

  // Link force: How strongly connected nodes pull together
  LINK_STRENGTH: 1.2, // ⬇️ Reduced from 1.5 - less pull = more space between clusters

  // Charge force: Repulsion strength
  ANCHOR_REPULSION: -4000, // Kept at -4000 - strong "sun" effect is good
  BASE_REPULSION: -600, // ⬆️ Increased from -400 - MORE repulsion = more space between nodes

  // Radial force: Organizes nodes into depth-based rings
  RADIAL_STRENGTH: 0.5, // ⬇️ Reduced from 0.6 - softer depth rings
  RADIAL_BASE_RADIUS: 180, // ⬆️ Increased from 140 - spread depth rings farther apart
  RADIAL_OFFSET: 80, // ⬆️ Increased from 50 - push first ring farther from center

  // Collision: Prevent node overlap
  ANCHOR_RADIUS: 120, // Kept at 120 - good anchor prominence
  NODE_BASE_RADIUS: 55, // ⬆️ Increased from 45 - more personal space per node

  // Simulation: How many iterations to run
  SIMULATION_TICKS: 300, // 300 ticks = stable layout
};

/**
 * Edge type to visual distance mapping
 * Stronger connections = shorter distance = nodes pulled closer
 */
const EDGE_DISTANCE_MAP: Record<string, number> = {
  GOLD: 90, // ⬆️ Lexical connections - some breathing room while staying connected
  PURPLE: 130, // ⬆️ Theological connections - moderate distance
  CYAN: 110, // ⬆️ Prophetic connections - moderate distance
  GREY: 180, // ⬆️ Weak/synthetic connections - push farther for contrast
};

/**
 * Calculate link distance based on edge type
 * Stronger semantic connections result in shorter distances
 */
function getLinkDistance(edge: Edge): number {
  const edgeData = edge.data as { styleType?: string };
  const styleType = edgeData?.styleType || "GREY";
  return EDGE_DISTANCE_MAP[styleType] || 150;
}

/**
 * Calculate collision radius based on node properties
 * Anchor is largest, depth affects size
 */
function getNodeRadius(node: { isAnchor?: boolean; depth?: number }): number {
  if (node.isAnchor) return FORCE_CONFIG.ANCHOR_RADIUS;

  // Smaller radius for deeper nodes (depth 1 > depth 2 > depth 3)
  const depth = node.depth || 1;
  return FORCE_CONFIG.NODE_BASE_RADIUS / (depth * 0.5 + 0.5);
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
}): number {
  if (node.isAnchor) return FORCE_CONFIG.ANCHOR_REPULSION;

  // Use similarity to modulate repulsion
  // High similarity (0.8+) = -80 (very weak repulsion, tight clustering)
  // Low similarity (0.2) = -400 (strong repulsion, spreads out)
  const similarity = node.similarity || 0;
  return FORCE_CONFIG.BASE_REPULSION * (1 - similarity * 0.8); // ⬆️ Increased from 0.6 - stronger clustering effect
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
  const d3Nodes = nodes.map((n) => {
    const nodeData = n.data as any; // Type assertion for custom node data
    return {
      id: n.id,
      // Initialize positions (anchor at center, others random nearby)
      x: anchorNode?.id === n.id ? centerX : Math.random() * 400 - 200,
      y: anchorNode?.id === n.id ? centerY : Math.random() * 400 - 200,
      // Node properties for force calculations
      similarity: nodeData?.verse?.similarity || 0,
      depth: nodeData?.verse?.depth || 1,
      isAnchor: nodeData?.isAnchor || false,
    };
  });

  // Prepare D3 links with distance based on edge type
  const d3Links = edges.map((e) => ({
    source: e.source,
    target: e.target,
    distance: getLinkDistance(e),
  }));

  console.log(
    `[Force Layout] Created ${d3Nodes.length} simulation nodes, ${d3Links.length} links`,
  );

  // Create force simulation
  const simulation = forceSimulation(d3Nodes as any)
    // CENTER: Pull all nodes toward anchor (weak gravity)
    .force(
      "center",
      forceCenter(centerX, centerY).strength(FORCE_CONFIG.CENTER_STRENGTH),
    )

    // LINK: Connect related verses (shorter distance = pull closer)
    .force(
      "link",
      forceLink(d3Links as any)
        .id((d: any) => d.id)
        .distance((d: any) => d.distance)
        .strength(FORCE_CONFIG.LINK_STRENGTH),
    )

    // CHARGE: Repulsion between nodes (prevents overlap, allows clustering)
    .force(
      "charge",
      forceManyBody().strength((d: any) => getRepulsionStrength(d)),
    )

    // COLLISION: Prevent nodes from overlapping
    .force(
      "collide",
      forceCollide().radius((d: any) => getNodeRadius(d)),
    )

    // RADIAL: Organize by depth (creates organic ring structure)
    .force(
      "radial",
      forceRadial(
        (d: any) => {
          if (d.isAnchor) return 0; // Anchor stays at center
          // Depth 1 ~200px, Depth 2 ~350px, Depth 3 ~500px
          return (
            FORCE_CONFIG.RADIAL_BASE_RADIUS * d.depth +
            FORCE_CONFIG.RADIAL_OFFSET
          );
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
