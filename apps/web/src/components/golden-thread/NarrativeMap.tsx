import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre";
import "@xyflow/react/dist/style.css";
import { VerseNode } from "./VerseNode";
import { SemanticConnectionModal } from "./SemanticConnectionModal";
import type {
  VisualContextBundle,
  EdgeType,
  ThreadNode,
} from "../../types/goldenThread";

// 3-Color Edge System (WCAG AA+ accessible)
const EDGE_STYLES = {
  GREY: {
    color: "#6B7280", // Neutral grey
    glowColor: "#9CA3AF",
    width: 1.5,
    label: "Reference",
    description: "Cross-references",
  },
  GOLD: {
    color: "#F59E0B",
    glowColor: "#FCD34D",
    width: 3,
    label: "Source Material",
    description: "Original languages & quotations",
  },
  PURPLE: {
    color: "#8B5CF6",
    glowColor: "#C4B5FD",
    width: 3,
    label: "Truth Thread",
    description: "Theological connections",
  },
  CYAN: {
    color: "#06B6D4",
    glowColor: "#67E8F9",
    width: 3,
    label: "Prophetic Flow",
    description: "Prophecy & lineage",
  },
  // LLM-Discovered Connection Types
  TYPOLOGY: {
    color: "#F97316", // Orange
    glowColor: "#FDBA74",
    width: 3,
    label: "Typology",
    description: "Shadow → substance patterns",
  },
  FULFILLMENT: {
    color: "#14B8A6", // Teal
    glowColor: "#5EEAD4",
    width: 3,
    label: "Fulfillment",
    description: "Prophecy → event",
  },
  CONTRAST: {
    color: "#EF4444", // Red
    glowColor: "#FCA5A5",
    width: 3,
    label: "Contrast",
    description: "Inversion or opposition",
  },
  PROGRESSION: {
    color: "#22C55E", // Green
    glowColor: "#86EFAC",
    width: 3,
    label: "Progression",
    description: "Covenant development",
  },
  PATTERN: {
    color: "#3B82F6", // Blue
    glowColor: "#93C5FD",
    width: 3,
    label: "Pattern",
    description: "Structural patterns",
  },
} as const;

// Map edge types to visual categories
const TYPE_TO_STYLE_MAP: Record<string, keyof typeof EDGE_STYLES> = {
  DEEPER: "GREY", // Regular cross-references = subtle grey
  ROOTS: "GOLD", // Semantic lexical threads = gold highlight
  ECHOES: "PURPLE", // Semantic theological threads = purple highlight
  PROPHECY: "CYAN", // Semantic prophetic threads = cyan highlight
  GENEALOGY: "CYAN",
  // LLM-discovered types
  TYPOLOGY: "TYPOLOGY",
  FULFILLMENT: "FULFILLMENT",
  CONTRAST: "CONTRAST",
  PROGRESSION: "PROGRESSION",
  PATTERN: "PATTERN",
};

interface BranchCluster {
  edgeIds: Set<string>;
  nodeIds: Set<number>;
  styleType: keyof typeof EDGE_STYLES;
  edgeType: EdgeType;
  pathPreview: string;
}

const nodeTypes = {
  verseNode: VerseNode,
};

interface NarrativeMapProps {
  bundle: VisualContextBundle | null;
  highlightedRefs: string[]; // ["John 3:16", "Romans 5:8"]
  onTrace?: (prompt: string) => void;
}

export const NarrativeMap: React.FC<NarrativeMapProps> = ({
  bundle,
  highlightedRefs,
  onTrace,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [discovering, setDiscovering] = useState(false);

  // Semantic connection modal state
  const [clickedConnection, setClickedConnection] = useState<{
    fromVerse: { id: number; reference: string; text: string };
    toVerse: { id: number; reference: string; text: string };
    connectionType:
      | "GOLD"
      | "PURPLE"
      | "CYAN"
      | "TYPOLOGY"
      | "FULFILLMENT"
      | "CONTRAST"
      | "PROGRESSION"
      | "PATTERN";
    similarity: number;
    position: { x: number; y: number };
    explanation?: string;
    confidence?: number;
    isLLMDiscovered?: boolean;
  } | null>(null);

  // Branch highlighting state
  const [hoveredBranch, setHoveredBranch] = useState<BranchCluster | null>(
    null,
  );
  const [tooltipState, setTooltipState] = useState<{
    visible: boolean;
    expanded: boolean;
    position: { x: number; y: number };
  }>({ visible: false, expanded: false, position: { x: 0, y: 0 } });

  // Pre-computed branch clusters (computed once per bundle)
  const [branchClusters, setBranchClusters] = useState<
    Map<string, BranchCluster>
  >(new Map());

  // Tooltip timers
  const tooltipTimerRef = useRef<number | null>(null);
  const expandTooltipTimerRef = useRef<number | null>(null);

  // Mouse velocity tracking (for tooltip spam prevention)
  const mousePositionsRef = useRef<
    Array<{ x: number; y: number; time: number }>
  >([]);

  // Handler for expanding collapsed branches
  const handleExpandNode = useCallback((nodeId: number) => {
    console.log(`[NarrativeMap] Expanding node ${nodeId}`);
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  }, []);

  // Pre-compute branch clusters when bundle or edges change
  const computeBranchClusters = useCallback(
    (
      allEdges: Edge[],
      visibleNodes: ThreadNode[],
    ): Map<string, BranchCluster> => {
      const clusters = new Map<string, BranchCluster>();
      const nodeMap = new Map(visibleNodes.map((n) => [n.id.toString(), n]));

      // BFS to find connected components of same type
      const findBranch = (
        startEdgeId: string,
        styleType: keyof typeof EDGE_STYLES,
      ): BranchCluster => {
        const branchEdgeIds = new Set<string>();
        const branchNodeIds = new Set<number>();
        const visited = new Set<string>();
        const queue = [startEdgeId];
        const pathNodes: ThreadNode[] = [];

        while (queue.length > 0 && branchEdgeIds.size < 15) {
          // Cap at 15 edges
          const currentEdgeId = queue.shift()!;
          if (visited.has(currentEdgeId)) continue;
          visited.add(currentEdgeId);

          const currentEdge = allEdges.find((e) => e.id === currentEdgeId);
          if (!currentEdge) continue;

          const edgeStyleType = (currentEdge.data as any)?.styleType;
          if (edgeStyleType !== styleType) continue;

          branchEdgeIds.add(currentEdgeId);
          branchNodeIds.add(Number(currentEdge.source));
          branchNodeIds.add(Number(currentEdge.target));

          // Track nodes for path preview
          const sourceNode = nodeMap.get(currentEdge.source);
          const targetNode = nodeMap.get(currentEdge.target);
          if (sourceNode && pathNodes.length < 3) pathNodes.push(sourceNode);
          if (targetNode && pathNodes.length < 3) pathNodes.push(targetNode);

          // Find connected edges
          const connectedEdges = allEdges.filter(
            (e) =>
              (e.source === currentEdge.source ||
                e.source === currentEdge.target ||
                e.target === currentEdge.source ||
                e.target === currentEdge.target) &&
              e.id !== currentEdgeId,
          );

          connectedEdges.forEach((e) => {
            if (!visited.has(e.id)) queue.push(e.id);
          });
        }

        // Generate path preview
        const pathPreview = pathNodes
          .slice(0, 3)
          .map((n) => `${n.book_abbrev} ${n.chapter}:${n.verse}`)
          .join(" → ");

        const edgeType =
          (allEdges.find((e) => e.id === startEdgeId)?.data as any)?.edgeType ||
          "DEEPER";

        return {
          edgeIds: branchEdgeIds,
          nodeIds: branchNodeIds,
          styleType,
          edgeType,
          pathPreview: pathPreview || "Branch",
        };
      };

      // Compute cluster for each edge
      allEdges.forEach((edge) => {
        const styleType = (edge.data as any)
          ?.styleType as keyof typeof EDGE_STYLES;
        if (!styleType) return;

        if (!clusters.has(edge.id)) {
          const cluster = findBranch(edge.id, styleType);
          // Store this cluster for all edges in the branch
          cluster.edgeIds.forEach((edgeId) => {
            clusters.set(edgeId, cluster);
          });
        }
      });

      return clusters;
    },
    [],
  );

  // Layout algorithm using dagre
  const getLayoutedElements = (
    bundle: VisualContextBundle,
    expandedIds: Set<number>,
    onExpand: (nodeId: number) => void,
  ) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    // Compact layout: tight spacing for at-a-glance tree view
    dagreGraph.setGraph({
      rankdir: "TB", // Top to Bottom
      ranksep: 40, // Vertical spacing between levels (was 80, now tighter)
      nodesep: 30, // Horizontal spacing between nodes (was 50, now tighter)
      marginx: 20,
      marginy: 20,
    });

    // Filter to visible nodes: (1) spine by default OR (2) child of an expanded node
    const visibleNodes = bundle.nodes.filter((node) => {
      // Always show spine nodes
      if (node.isVisible) return true;

      // Show if parent is expanded
      if (node.parentId && expandedIds.has(node.parentId)) return true;

      return false;
    });
    console.log(
      `[NarrativeMap] Rendering ${visibleNodes.length} visible nodes out of ${bundle.nodes.length} total`,
    );

    // Create nodes (only visible ones)
    const reactFlowNodes: Node[] = visibleNodes.map((verse) => {
      const nodeId = verse.id.toString();
      const isAnchor = verse.id === bundle.rootId;
      const isHighlighted = highlightedRefs.some((ref) => {
        const refLower = ref.toLowerCase();
        return (
          refLower.includes(
            `${verse.book_name.toLowerCase()} ${verse.chapter}:${verse.verse}`,
          ) ||
          refLower.includes(
            `${verse.book_abbrev.toLowerCase()} ${verse.chapter}:${verse.verse}`,
          )
        );
      });

      // Compact node size for at-a-glance view
      dagreGraph.setNode(nodeId, { width: 120, height: 50 });

      // Recalculate collapsed count based on what's already expanded
      const allChildren = bundle.nodes.filter((n) => n.parentId === verse.id);
      const visibleChildren = allChildren.filter(
        (child) =>
          child.isVisible ||
          (child.parentId && expandedIds.has(child.parentId)),
      );
      const actualCollapsedCount = allChildren.length - visibleChildren.length;

      return {
        id: nodeId,
        type: "verseNode",
        data: {
          verse,
          isHighlighted,
          isAnchor,
          collapsedChildCount: actualCollapsedCount,
          onExpand: () => onExpand(verse.id),
        },
        position: { x: 0, y: 0 }, // Will be set by dagre
      };
    });

    // Create edges (only between visible nodes) with 3-color system
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const reactFlowEdges: Edge[] = [];
    const edgeSet = new Set<string>(); // Track edges to avoid duplicates

    // PHASE 1: Add explicit theological edges from bundle
    bundle.edges
      .filter(
        (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to),
      )
      .forEach((edge) => {
        const fromId = edge.from.toString();
        const toId = edge.to.toString();
        const edgeKey = `${fromId}->${toId}`;

        if (edgeSet.has(edgeKey)) return; // Skip duplicates

        dagreGraph.setEdge(fromId, toId);

        // Determine edge style based on type
        const edgeType = edge.type;
        const styleType = TYPE_TO_STYLE_MAP[edgeType as EdgeType];
        const finalStyleType = styleType || "PURPLE";
        const edgeStyle = EDGE_STYLES[finalStyleType];

        reactFlowEdges.push({
          id: `e${fromId}-${toId}`,
          source: fromId,
          target: toId,
          type: "smoothstep",
          data: {
            styleType: finalStyleType,
            edgeType,
            isSynthetic: false,
          },
          style: {
            stroke: edgeStyle.color,
            strokeWidth: edgeStyle.width,
            strokeLinecap: "round",
            opacity: finalStyleType === "GREY" ? 0.3 : 0.7, // Grey edges are subtle
            transition: "all 150ms ease-out",
            cursor: finalStyleType !== "GREY" ? "pointer" : "default", // Colored edges clickable
          },
          interactionWidth: finalStyleType !== "GREY" ? 20 : 10, // Wider click area for colored edges
        });

        edgeSet.add(edgeKey);
      });

    // PHASE 2: Add synthetic hierarchy edges (parent → child via parentId)
    // These ensure all visible nodes stay connected in the tree layout
    visibleNodes.forEach((node) => {
      if (node.parentId && visibleNodeIds.has(node.parentId)) {
        const fromId = node.parentId.toString();
        const toId = node.id.toString();
        const edgeKey = `${fromId}->${toId}`;

        // Only add if there's not already an explicit edge
        if (!edgeSet.has(edgeKey)) {
          dagreGraph.setEdge(fromId, toId);

          // Synthetic edges use GENEALOGY color (cyan) with dashed style
          const edgeStyle = EDGE_STYLES["CYAN"];

          reactFlowEdges.push({
            id: `e${fromId}-${toId}-synthetic`,
            source: fromId,
            target: toId,
            type: "smoothstep",
            data: {
              styleType: "CYAN",
              edgeType: "GENEALOGY",
              isSynthetic: true,
            },
            style: {
              stroke: edgeStyle.color,
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeDasharray: "5,5", // Dashed to indicate hierarchy-only
              opacity: 0.4, // More subtle than theological edges
              transition: "all 150ms ease-out",
            },
          });

          edgeSet.add(edgeKey);
        }
      }
    });

    // Run layout
    dagre.layout(dagreGraph);

    // Apply positions (center nodes based on new compact size: 120x50)
    reactFlowNodes.forEach((node) => {
      const dagreNode = dagreGraph.node(node.id);
      node.position = {
        x: dagreNode.x - 60, // width / 2 = 120 / 2 = 60
        y: dagreNode.y - 25, // height / 2 = 50 / 2 = 25
      };
    });

    // Debug: Log edge color distribution
    const edgeColorCounts = reactFlowEdges.reduce(
      (acc, edge) => {
        const color = edge.style?.stroke || "unknown";
        acc[color] = (acc[color] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    console.log(`[NarrativeMap] Edge colors:`, edgeColorCounts);
    console.log(`[NarrativeMap] Edge types:`, {
      GOLD: reactFlowEdges.filter((e) => e.data?.styleType === "GOLD").length,
      PURPLE: reactFlowEdges.filter((e) => e.data?.styleType === "PURPLE")
        .length,
      CYAN: reactFlowEdges.filter((e) => e.data?.styleType === "CYAN").length,
    });

    return { nodes: reactFlowNodes, edges: reactFlowEdges };
  };

  // Update layout when bundle, highlights, or expanded nodes change
  useEffect(() => {
    console.log("[NarrativeMap] useEffect triggered, bundle:", bundle);
    if (!bundle) {
      console.log("[NarrativeMap] No bundle, returning");
      return;
    }

    console.log(
      "[NarrativeMap] Processing bundle with",
      bundle.nodes?.length,
      "nodes",
    );
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      bundle,
      expandedNodes,
      handleExpandNode,
    );
    console.log(
      "[NarrativeMap] Layout complete, setting",
      layoutedNodes.length,
      "nodes and",
      layoutedEdges.length,
      "edges",
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [bundle, highlightedRefs, expandedNodes, handleExpandNode]);

  // Discover additional LLM connections automatically
  useEffect(() => {
    if (!bundle || discovering) return;

    const discoverAdditionalConnections = async () => {
      try {
        setDiscovering(true);
        console.log("[LLM Discovery] Starting automatic discovery...");

        // Select core verses (top 12 or all if <12)
        const allNodes = bundle.nodes || [];
        let coreVerses = allNodes;

        if (allNodes.length > 12) {
          // Priority: anchor + spine + centrality
          const selected = new Set<number>();

          // 1. Anchor (depth 0)
          const anchor = allNodes.find((n) => n.depth === 0);
          if (anchor) selected.add(anchor.id);

          // 2. Spine nodes
          const spineNodes = allNodes.filter((n) => n.isSpine);
          spineNodes.forEach((n) => selected.add(n.id));

          // 3. Fill with highest centrality
          const centrality = new Map<number, number>();
          allNodes.forEach((n) => {
            const connections = (bundle.edges || []).filter(
              (e) => e.from === n.id || e.to === n.id,
            ).length;
            centrality.set(n.id, connections);
          });

          const remaining = allNodes
            .filter((n) => !selected.has(n.id))
            .sort((a, b) => {
              const aCentrality = centrality.get(a.id) || 0;
              const bCentrality = centrality.get(b.id) || 0;
              return bCentrality - aCentrality;
            })
            .slice(0, 12 - selected.size);

          remaining.forEach((n) => selected.add(n.id));
          coreVerses = allNodes.filter((n) => selected.has(n.id));
        }

        console.log(
          `[LLM Discovery] Analyzing ${coreVerses.length} core verses`,
        );

        const API_URL =
          import.meta.env?.VITE_API_URL || "http://localhost:3001";
        const response = await fetch(`${API_URL}/api/discover-connections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            verseIds: coreVerses.map((v) => v.id),
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to discover connections");
        }

        const { connections, fromCache } = await response.json();
        console.log(
          `[LLM Discovery] Found ${connections.length} connections (${fromCache ? "cached" : "new"})`,
        );

        if (connections.length === 0) {
          console.log("[LLM Discovery] No new connections discovered");
          return;
        }

        // Add discovered edges to the map
        const newEdges = connections.map((conn: any) => {
          const styleType =
            TYPE_TO_STYLE_MAP[conn.type] || TYPE_TO_STYLE_MAP.DEEPER;
          const edgeStyle = EDGE_STYLES[styleType];

          return {
            id: `llm-${conn.from}-${conn.to}`,
            source: conn.from.toString(),
            target: conn.to.toString(),
            type: "smoothstep",
            data: {
              styleType,
              edgeType: conn.type,
              explanation: conn.explanation,
              confidence: conn.confidence,
              isLLMDiscovered: true,
            },
            style: {
              stroke: edgeStyle.color,
              strokeWidth: edgeStyle.width,
              strokeDasharray:
                conn.type === "TYPOLOGY"
                  ? "5,5"
                  : conn.type === "FULFILLMENT"
                    ? "10,5"
                    : conn.type === "CONTRAST"
                      ? "8,4"
                      : conn.type === "PATTERN"
                        ? "3,3"
                        : "0",
              opacity: 0.7,
            },
            animated: true,
          };
        });

        console.log(
          `[LLM Discovery] Adding ${newEdges.length} new edges to map`,
        );
        setEdges((prev) => [...prev, ...newEdges]);
      } catch (error) {
        console.error("[LLM Discovery] Error:", error);
        // Silent fail - user still gets algorithmic connections
      } finally {
        setDiscovering(false);
      }
    };

    discoverAdditionalConnections();
  }, [bundle, discovering]);

  // Pre-compute branch clusters when edges change
  useEffect(() => {
    if (!bundle || edges.length === 0) return;

    const visibleNodes = bundle.nodes.filter((node) => {
      if (node.isVisible) return true;
      if (node.parentId && expandedNodes.has(node.parentId)) return true;
      return false;
    });

    const clusters = computeBranchClusters(edges, visibleNodes);
    setBranchClusters(clusters);
    console.log(`[NarrativeMap] Computed ${clusters.size} branch clusters`);
  }, [edges, bundle, expandedNodes, computeBranchClusters]);

  // Apply highlighting when hoveredBranch changes
  useEffect(() => {
    if (!hoveredBranch) {
      // Reset to neutral state
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          className: "",
        })),
      );

      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          style: {
            ...edge.style,
            opacity: 0.7,
            filter: "none",
            strokeWidth:
              EDGE_STYLES[(edge.data as any)?.styleType || "PURPLE"].width,
          },
        })),
      );
      return;
    }

    const branchColor = EDGE_STYLES[hoveredBranch.styleType].color;
    const branchGlow = EDGE_STYLES[hoveredBranch.styleType].glowColor;
    const isColoredBranch = hoveredBranch.styleType !== "GREY";

    // Highlight nodes with branch color (only colored branches glow)
    setNodes((nds) =>
      nds.map((node) => {
        const nodeId = Number(node.id);
        const isInBranch = hoveredBranch.nodeIds.has(nodeId);

        return {
          ...node,
          className: isInBranch ? "highlighted-node" : "dimmed-node",
          style: {
            ...node.style,
            ...(isInBranch &&
              isColoredBranch && {
                boxShadow: `0 0 20px ${branchGlow}, 0 0 10px ${branchColor}, 0 4px 15px rgba(0,0,0,0.2)`,
                borderColor: branchColor,
                borderWidth: "3px",
                borderStyle: "solid",
                zIndex: 1000,
              }),
          },
        };
      }),
    );

    // Highlight edges
    setEdges((eds) =>
      eds.map((edge) => {
        const isInBranch = hoveredBranch.edgeIds.has(edge.id);
        const styleType = (edge.data as any)?.styleType || "PURPLE";
        const edgeStyle = EDGE_STYLES[styleType];
        const isColoredBranch = styleType !== "GREY"; // Only colored branches get glow

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: isInBranch ? 1 : 0.3,
            filter:
              isInBranch && isColoredBranch
                ? `drop-shadow(0 0 8px ${edgeStyle.glowColor})`
                : "none",
            strokeWidth: isInBranch ? edgeStyle.width + 1 : edgeStyle.width,
          },
        };
      }),
    );
  }, [hoveredBranch]);

  // Mouse velocity check
  const checkMouseVelocity = useCallback((x: number, y: number): boolean => {
    const now = Date.now();
    const positions = mousePositionsRef.current;

    // Add current position
    positions.push({ x, y, time: now });

    // Keep only last 3 positions
    if (positions.length > 3) {
      positions.shift();
    }

    // Need at least 2 points to calculate velocity
    if (positions.length < 2) return false;

    // Calculate distance and time between first and last position
    const first = positions[0];
    const last = positions[positions.length - 1];
    const distance = Math.sqrt(
      Math.pow(last.x - first.x, 2) + Math.pow(last.y - first.y, 2),
    );
    const timeDiff = last.time - first.time;

    // Velocity threshold: 500 pixels per second
    const velocity = timeDiff > 0 ? (distance / timeDiff) * 1000 : 0;
    return velocity > 500;
  }, []);

  // Edge hover handlers
  // Handle edge click for colored branches
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const styleType = (edge.data as any)?.styleType;

      // Only handle colored branches (not GREY)
      if (styleType === "GREY" || !styleType) return;
      if (!bundle) return;

      // Get the from and to verse data
      const fromId = parseInt(edge.source);
      const toId = parseInt(edge.target);
      const fromVerse = bundle.nodes.find((n) => n.id === fromId);
      const toVerse = bundle.nodes.find((n) => n.id === toId);

      if (!fromVerse || !toVerse) return;

      // Get the edge metadata
      const bundleEdge = bundle.edges.find(
        (e) => e.from === fromId && e.to === toId,
      );
      const similarity =
        bundleEdge?.metadata?.similarity || bundleEdge?.weight || 0;

      // Check if this is an LLM-discovered connection
      const edgeData = edge.data as any;
      const isLLMDiscovered = edgeData?.isLLMDiscovered || false;
      const llmExplanation = edgeData?.explanation;
      const llmConfidence = edgeData?.confidence;

      // Calculate position relative to the map container (for absolute positioning)
      const mapContainer = (event.target as HTMLElement).closest(".react-flow");
      let posX = event.clientX;
      let posY = event.clientY;

      if (mapContainer) {
        const containerRect = mapContainer.getBoundingClientRect();
        posX = event.clientX - containerRect.left;
        posY = event.clientY - containerRect.top;
      }

      setClickedConnection({
        fromVerse: {
          id: fromVerse.id,
          reference: `${fromVerse.book_name} ${fromVerse.chapter}:${fromVerse.verse}`,
          text: fromVerse.text,
        },
        toVerse: {
          id: toVerse.id,
          reference: `${toVerse.book_name} ${toVerse.chapter}:${toVerse.verse}`,
          text: toVerse.text,
        },
        connectionType: styleType as any,
        similarity: isLLMDiscovered ? llmConfidence || 0 : similarity,
        position: { x: posX, y: posY },
        explanation: llmExplanation,
        confidence: llmConfidence,
        isLLMDiscovered,
      });
    },
    [bundle],
  );

  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const isFastMoving = checkMouseVelocity(event.clientX, event.clientY);

      // Look up pre-computed branch cluster
      const cluster = branchClusters.get(edge.id);
      if (!cluster) return;

      // Set hovered branch (instant highlighting)
      setHoveredBranch(cluster);

      // Clear any existing timers
      if (tooltipTimerRef.current) {
        clearTimeout(tooltipTimerRef.current);
      }
      if (expandTooltipTimerRef.current) {
        clearTimeout(expandTooltipTimerRef.current);
      }

      // Don't show tooltip if moving fast
      if (isFastMoving) {
        setTooltipState({
          visible: false,
          expanded: false,
          position: { x: 0, y: 0 },
        });
        return;
      }

      // Show basic tooltip after 300ms
      tooltipTimerRef.current = window.setTimeout(() => {
        setTooltipState({
          visible: true,
          expanded: false,
          position: { x: event.clientX, y: event.clientY },
        });

        // Expand tooltip after another 500ms (800ms total)
        expandTooltipTimerRef.current = window.setTimeout(() => {
          setTooltipState((prev) => ({
            ...prev,
            expanded: true,
          }));
        }, 500);
      }, 300);
    },
    [branchClusters, checkMouseVelocity],
  );

  const handleEdgeMouseLeave = useCallback(() => {
    setHoveredBranch(null);
    setTooltipState({
      visible: false,
      expanded: false,
      position: { x: 0, y: 0 },
    });

    // Clear timers
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    if (expandTooltipTimerRef.current) {
      clearTimeout(expandTooltipTimerRef.current);
      expandTooltipTimerRef.current = null;
    }

    // Clear velocity tracking
    mousePositionsRef.current = [];
  }, []);

  if (!bundle) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">📖</div>
          <div className="text-lg font-semibold">
            Golden Thread Visualization
          </div>
          <div className="text-sm mt-2">
            Ask a biblical question to see the map
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {/* Tooltip */}
      {tooltipState.visible && hoveredBranch && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltipState.position.x + 10,
            top: tooltipState.position.y + 10,
            transition: "all 150ms ease-out",
          }}
        >
          <div
            className="bg-gray-900/95 text-white rounded-lg shadow-2xl border border-gray-700"
            style={{
              width: tooltipState.expanded ? "220px" : "180px",
              transition: "width 150ms ease-out",
            }}
          >
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: EDGE_STYLES[hoveredBranch.styleType].color,
                  }}
                />
                <span className="font-semibold text-sm">
                  {EDGE_STYLES[hoveredBranch.styleType].label}
                </span>
              </div>
              <div className="text-xs text-gray-300">
                {hoveredBranch.edgeIds.size}{" "}
                {hoveredBranch.edgeIds.size === 1 ? "verse" : "verses"} in
                branch
              </div>

              {tooltipState.expanded && (
                <>
                  <div className="border-t border-gray-700 my-2" />
                  <div className="text-xs text-gray-400 leading-relaxed">
                    {hoveredBranch.pathPreview}
                  </div>
                  <div className="text-xs text-cyan-400 mt-2">
                    Click to explore →
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2.0}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        <Background color="#f0f0f0" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            if (node.data.isAnchor) return "#FFD700";
            if (node.data.isHighlighted) return "#FFF8DC";
            return "#F0F0F0";
          }}
        />
      </ReactFlow>

      {/* Semantic Connection Modal */}
      {clickedConnection && onTrace && (
        <SemanticConnectionModal
          fromVerse={clickedConnection.fromVerse}
          toVerse={clickedConnection.toVerse}
          connectionType={clickedConnection.connectionType}
          similarity={clickedConnection.similarity}
          position={clickedConnection.position}
          onClose={() => setClickedConnection(null)}
          onTrace={onTrace}
          explanation={clickedConnection.explanation}
          isLLMDiscovered={clickedConnection.isLLMDiscovered}
        />
      )}
    </div>
  );
};
