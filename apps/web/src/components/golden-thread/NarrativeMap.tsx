import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre"; // LEGACY: Will be replaced by force-directed layout
import "@xyflow/react/dist/style.css";
import { calculateForceLayout } from "../../utils/forceLayout";
import { VerseNode } from "./VerseNode";
import { SemanticConnectionModal } from "./SemanticConnectionModal";
import { MapSkeleton } from "./MapSkeleton";
import { DiscoveryProgress } from "./DiscoveryProgress";
import type {
  VisualContextBundle,
  EdgeType,
  ThreadNode,
} from "../../types/goldenThread";

// Refined Color System with Intentional Color Psychology
const EDGE_STYLES = {
  GREY: {
    color: "#6B7280", // Neutral grey
    glowColor: "#9CA3AF",
    width: 1.5,
    label: "Reference",
    description: "Cross-references",
  },
  GOLD: {
    color: "#D97706", // Richer, warmer gold - same roots, shared DNA
    glowColor: "#FBBF24",
    width: 3,
    label: "Source Material",
    description: "Original languages & quotations",
  },
  PURPLE: {
    color: "#7C3AED", // Deeper, more royal purple - theological echo across time
    glowColor: "#A78BFA",
    width: 3,
    label: "Truth Thread",
    description: "Theological connections",
  },
  CYAN: {
    color: "#0891B2", // Sharper, more electric cyan - prophetic arrow (past → future)
    glowColor: "#22D3EE",
    width: 3,
    label: "Prophetic Flow",
    description: "Prophecy & lineage",
  },
  // LLM-Discovered Connection Types
  TYPOLOGY: {
    color: "#EA580C", // Earthy orange - shadow foreshadowing substance
    glowColor: "#F59E0B", // Divine gold glow
    width: 3,
    label: "Typology",
    description: "Shadow foreshadowing substance",
  },
  FULFILLMENT: {
    color: "#14B8A6", // Teal
    glowColor: "#5EEAD4",
    width: 3,
    label: "Fulfillment",
    description: "Prophecy → event",
  },
  CONTRAST: {
    color: "#DC2626", // Softer but still bold red - spiritual opposition
    glowColor: "#F87171",
    width: 3,
    label: "Contrast",
    description: "Spiritual opposition",
  },
  PROGRESSION: {
    color: "#16A34A", // More verdant, life-giving green - covenant unfolding
    glowColor: "#4ADE80",
    width: 3,
    label: "Progression",
    description: "Covenant unfolding",
  },
  PATTERN: {
    color: "#3B82F6", // Blue
    glowColor: "#93C5FD",
    width: 3,
    label: "Pattern",
    description: "Structural patterns",
  },
} as const;

// Testament boundaries for line pattern system
const OLD_TESTAMENT_BOOKS = [
  "Gen",
  "Exo",
  "Lev",
  "Num",
  "Deu",
  "Jos",
  "Jdg",
  "Rth",
  "1Sa",
  "2Sa",
  "1Ki",
  "2Ki",
  "1Ch",
  "2Ch",
  "Ezr",
  "Neh",
  "Est",
  "Job",
  "Psa",
  "Pro",
  "Ecc",
  "Sng",
  "Isa",
  "Jer",
  "Lam",
  "Eze",
  "Dan",
  "Hos",
  "Joe",
  "Amo",
  "Oba",
  "Jon",
  "Mic",
  "Nah",
  "Hab",
  "Zep",
  "Hag",
  "Zec",
  "Mal",
];

const NEW_TESTAMENT_BOOKS = [
  "Mat",
  "Mar",
  "Luk",
  "Jhn",
  "Act",
  "Rom",
  "1Co",
  "2Co",
  "Gal",
  "Eph",
  "Phl",
  "Col",
  "1Th",
  "2Th",
  "1Ti",
  "2Ti",
  "Tit",
  "Phm",
  "Heb",
  "Jas",
  "1Pe",
  "2Pe",
  "1Jo",
  "2Jo",
  "3Jo",
  "Jde",
  "Rev",
];

// Helper: Check if two books are in the same testament
const isSameTestament = (bookAbbrev1: string, bookAbbrev2: string): boolean => {
  const book1InOT = OLD_TESTAMENT_BOOKS.includes(bookAbbrev1);
  const book2InOT = OLD_TESTAMENT_BOOKS.includes(bookAbbrev2);
  const book1InNT = NEW_TESTAMENT_BOOKS.includes(bookAbbrev1);
  const book2InNT = NEW_TESTAMENT_BOOKS.includes(bookAbbrev2);

  return (book1InOT && book2InOT) || (book1InNT && book2InNT);
};

// Helper: Get stroke dash pattern based on connection type
const getStrokeDashArray = (
  fromBookAbbrev: string,
  toBookAbbrev: string,
  isLLMDiscovered: boolean,
): string => {
  // Dotted: LLM-discovered patterns
  if (isLLMDiscovered) return "2,3";

  // Dashed: Cross-testament
  if (!isSameTestament(fromBookAbbrev, toBookAbbrev)) return "5,5";

  // Solid: Same-testament
  return "0";
};

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

interface EdgeData {
  styleType?: keyof typeof EDGE_STYLES;
  edgeType?: EdgeType;
  explanation?: string;
  confidence?: number;
  isLLMDiscovered?: boolean;
  strokeDashArray?: string; // Line pattern: "0" (solid), "5,5" (dashed), "2,3" (dotted)
  isSynthetic?: boolean; // For synthetic hierarchy edges
  baseWidth?: number; // Calculated width based on similarity strength
}

interface DiscoveredConnection {
  from: number;
  to: number;
  type: string;
  explanation: string;
  confidence: number;
}

const nodeTypes = {
  verseNode: VerseNode,
};

interface NarrativeMapProps {
  bundle: VisualContextBundle | null;
  highlightedRefs: string[]; // ["John 3:16", "Romans 5:8"]
  onTrace?: (prompt: string) => void;
  onGoDeeper?: (prompt: string) => void;
}

const NarrativeMapComponent: React.FC<NarrativeMapProps> = ({
  bundle,
  highlightedRefs,
  onTrace,
  onGoDeeper,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  const [discovering, setDiscovering] = useState(false);
  const [initialExpansionDone, setInitialExpansionDone] = useState(false);
  // 🌟 GOLDEN THREAD: Track hovered anchor ray for semantic color reveal
  const [hoveredAnchorRay, setHoveredAnchorRay] = useState<string | null>(null);
  const [discoveryProgress, setDiscoveryProgress] = useState<{
    phase: "selecting" | "analyzing" | "connecting" | "complete";
    progress: number;
    message: string;
  }>({
    phase: "selecting",
    progress: 0,
    message: "Initializing...",
  });
  const [edgesAnimated, setEdgesAnimated] = useState(false);

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
    connectedVerseIds?: number[];
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

  // Focus Mode state
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const lastAppliedFocusRef = useRef<string | null>(null);

  // Legend collapsed state
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  // Pre-computed branch clusters (computed once per bundle)
  const [branchClusters, setBranchClusters] = useState<
    Map<string, BranchCluster>
  >(new Map());

  // Tooltip timers
  const tooltipTimerRef = useRef<number | null>(null);
  const expandTooltipTimerRef = useRef<number | null>(null);

  // ESC key listener for Focus Mode
  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && focusedNodeId) {
        setFocusedNodeId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedNodeId]);

  // Mouse velocity tracking (for tooltip spam prevention)
  const mousePositionsRef = useRef<
    Array<{ x: number; y: number; time: number }>
  >([]);

  // Handler for expanding collapsed branches
  const handleExpandNode = useCallback((nodeId: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
  }, []);

  // Handler for node click (Focus Mode)
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      try {
        console.log(`[Click DEBUG] Node clicked:`, {
          id: node.id,
          verse: node.data?.verse
            ? `${node.data.verse.book_abbrev} ${node.data.verse.chapter}:${node.data.verse.verse}`
            : "unknown",
          isAnchor: node.data?.isAnchor,
          position: node.position,
        });

        // Toggle focus: if already focused, unfocus; otherwise focus
        setFocusedNodeId((prev) => {
          const newFocusId = prev === node.id ? null : node.id;
          console.log(
            `[Click DEBUG] Focus mode ${newFocusId ? "ENABLED" : "DISABLED"} for node ${node.id}`,
          );
          return newFocusId;
        });
      } catch (error) {
        console.error(`[Click DEBUG] ❌ Error handling node click:`, error);
        // Reset focus mode on error
        setFocusedNodeId(null);
      }
    },
    [],
  );

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

          const edgeStyleType = (currentEdge.data as EdgeData)?.styleType;
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
          (allEdges.find((e) => e.id === startEdgeId)?.data as EdgeData)
            ?.edgeType || "DEEPER";

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
        const styleType = (edge.data as EdgeData)
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

  // Radial layout algorithm with anchor at center
  const getLayoutedElements = (
    bundle: VisualContextBundle,
    expandedIds: Set<number>,
    onExpand: (nodeId: number) => void,
  ) => {
    // === FEATURE FLAG: Force-Directed Layout ===
    // Set to true to use new neural network layout, false for legacy radial layout
    const USE_FORCE_LAYOUT = true;

    // For dagre edge routing, we still create the graph (legacy - only used if USE_FORCE_LAYOUT = false)
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
      rankdir: "TB",
      ranksep: 40,
      nodesep: 30,
      marginx: 20,
      marginy: 20,
    });

    // Filter to visible nodes: (1) marked as visible OR (2) in expanded set OR (3) child of expanded node
    const visibleNodes = bundle.nodes.filter((node) => {
      // Always show nodes marked as visible
      if (node.isVisible) return true;

      // Show if this node itself is in the expanded set
      if (expandedIds.has(node.id)) return true;

      // Show if parent is expanded
      if (node.parentId && expandedIds.has(node.parentId)) return true;

      return false;
    });

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

      // Node size varies by depth: anchor (180x90), depth 1 (120x50), depth 2 (100x42), depth 3+ (85x35)
      const nodeDepth = verse.depth || 0;
      let nodeWidth: number, nodeHeight: number;

      if (isAnchor) {
        nodeWidth = 180;
        nodeHeight = 90;
      } else if (nodeDepth === 1) {
        nodeWidth = 120;
        nodeHeight = 50;
      } else if (nodeDepth === 2) {
        nodeWidth = 100;
        nodeHeight = 42;
      } else {
        nodeWidth = 85;
        nodeHeight = 35;
      }

      dagreGraph.setNode(nodeId, { width: nodeWidth, height: nodeHeight });

      // Recalculate collapsed count based on what's already expanded
      const allChildren = bundle.nodes.filter((n) => n.parentId === verse.id);
      const visibleChildren = allChildren.filter(
        (child) =>
          child.isVisible ||
          (child.parentId && expandedIds.has(child.parentId)),
      );
      const actualCollapsedCount = allChildren.length - visibleChildren.length;

      // 🌟 GOLDEN THREAD: Determine semantic connection type for first-degree nodes
      // This will be shown as a colored border/halo around the node
      let semanticConnectionType: string | undefined;
      if (nodeDepth === 1 && !isAnchor && bundle.rootId) {
        // Find the edge from anchor to this node
        const connectionEdge = bundle.edges.find(
          (e) => e.from === bundle.rootId && e.to === verse.id,
        );
        if (connectionEdge) {
          const edgeType = connectionEdge.type;
          semanticConnectionType =
            TYPE_TO_STYLE_MAP[edgeType as EdgeType] || "PURPLE";
        }
      }

      return {
        id: nodeId,
        type: "verseNode",
        data: {
          verse,
          isHighlighted,
          isAnchor,
          collapsedChildCount: actualCollapsedCount,
          onExpand: () => onExpand(verse.id),
          depth: verse.depth, // Pass depth for size scaling
          semanticConnectionType, // 🌟 GOLDEN THREAD: Type of connection from anchor
        },
        position: { x: 0, y: 0 }, // Will be set by radial layout
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

        // 🌟 GOLDEN THREAD: Check if this is a primary ray from the anchor
        const isAnchorRay = edge.from === bundle.rootId;
        const edgeId = `e${fromId}-${toId}`;

        // 🌟 GOLDEN THREAD: Reveal true semantic color on hover, otherwise show GOLD for anchor rays
        const isHovered = hoveredAnchorRay === edgeId;
        let visualStyleType: keyof typeof EDGE_STYLES;

        if (isAnchorRay && !isHovered) {
          // Anchor rays are GOLD (unless hovered)
          visualStyleType = "GOLD";
        } else if (isAnchorRay && isHovered) {
          // Hovered anchor rays show true color
          visualStyleType = finalStyleType;
        } else {
          // 🌟 GOLDEN THREAD: Secondary edges (non-anchor) are GREY to emphasize GOLD threads
          visualStyleType = "GREY";
        }

        const edgeStyle = EDGE_STYLES[visualStyleType];

        // Get source and target verses for line pattern
        const fromVerse = visibleNodes.find((n) => n.id === edge.from);
        const toVerse = visibleNodes.find((n) => n.id === edge.to);
        const strokeDashArray =
          fromVerse && toVerse
            ? getStrokeDashArray(
                fromVerse.book_abbrev,
                toVerse.book_abbrev,
                false, // Not LLM-discovered
              )
            : "0"; // Default to solid if verses not found

        // Calculate width based on similarity strength
        // Similarity range: 0-1, Width multiplier: 0.7-1.3
        const edgeMetadata = edge as unknown as {
          metadata?: { similarity?: number };
          weight?: number;
        };
        const similarity =
          edgeMetadata.metadata?.similarity || edgeMetadata.weight || 0.8; // Default to 0.8
        const widthMultiplier = 0.7 + similarity * 0.6; // Maps 0→0.7, 1→1.3

        // 🌟 GOLDEN THREAD: Anchor rays are thicker (aggressive contrast)
        const baseWidth = isAnchorRay ? 4 : edgeStyle.width * widthMultiplier;
        const finalWidth = isAnchorRay ? baseWidth : baseWidth;

        reactFlowEdges.push({
          id: `e${fromId}-${toId}`,
          source: fromId,
          target: toId,
          type: "smoothstep",
          // 🌟 GOLDEN THREAD: Animate anchor rays (outward flow)
          animated: isAnchorRay,
          data: {
            styleType: finalStyleType, // 🌟 Preserve original type for hover reveal
            visualStyleType, // Current visual style (GOLD for anchor rays)
            edgeType,
            isSynthetic: false,
            isAnchorRay, // 🌟 Flag for hover interaction
            strokeDashArray, // Store final pattern for animation restoration
            baseWidth: finalWidth, // Store calculated width for hover effects
          },
          style: {
            stroke: `url(#edge-gradient-${visualStyleType})`, // 🌟 Use GOLD for anchor rays
            strokeWidth: finalWidth, // 🌟 Thicker for anchor rays
            strokeLinecap: "round",
            opacity: 0, // Start invisible for entrance animation
            strokeDasharray: "10", // Temporary for entrance animation
            strokeDashoffset: "10",
            // 🌟 GOLDEN THREAD: Stronger glow for anchor rays
            filter: isAnchorRay
              ? `drop-shadow(0 0 6px ${EDGE_STYLES.GOLD.glowColor}80)` // Stronger glow for anchor rays
              : visualStyleType !== "GREY"
                ? `drop-shadow(0 0 3px ${edgeStyle.glowColor}40)` // 40 = 25% opacity in hex
                : "none",
            transition:
              "opacity 150ms ease-in-out, stroke-width 150ms ease-in-out, filter 150ms ease-in-out",
            cursor: visualStyleType !== "GREY" ? "pointer" : "default",
          },
          interactionWidth: isAnchorRay
            ? 25
            : finalStyleType !== "GREY"
              ? 20
              : 10, // 🌟 Wider interaction for anchor rays
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

          // Synthetic edges use GENEALOGY color (cyan)
          const edgeStyle = EDGE_STYLES["CYAN"];

          // Get source and target verses for line pattern
          const parentVerse = visibleNodes.find((n) => n.id === node.parentId);
          const strokeDashArray = parentVerse
            ? getStrokeDashArray(
                parentVerse.book_abbrev,
                node.book_abbrev,
                false, // Not LLM-discovered
              )
            : "5,5"; // Default to dashed if parent not found

          reactFlowEdges.push({
            id: `e${fromId}-${toId}-synthetic`,
            source: fromId,
            target: toId,
            type: "smoothstep",
            data: {
              styleType: "CYAN",
              edgeType: "GENEALOGY",
              isSynthetic: true,
              strokeDashArray, // Store final pattern for animation restoration
              baseWidth: 2, // Store base width for hover effects
            },
            style: {
              stroke: `url(#edge-gradient-CYAN)`, // Use directional gradient
              strokeWidth: 2,
              strokeLinecap: "round",
              opacity: 0, // Start invisible for entrance animation
              strokeDasharray: "10", // Temporary for entrance animation
              strokeDashoffset: "10",
              // Subtle glow for synthetic edges
              filter: `drop-shadow(0 0 3px ${edgeStyle.glowColor}40)`, // 40 = 25% opacity
              transition: "all 150ms ease-in-out",
            },
          });

          edgeSet.add(edgeKey);
        }
      }
    });

    // === LAYOUT CALCULATION ===
    if (USE_FORCE_LAYOUT) {
      // NEW: Force-directed "neural network" layout
      console.log("[Layout] Using force-directed layout");

      const positionMap = calculateForceLayout(
        reactFlowNodes,
        reactFlowEdges,
        bundle.rootId,
      );

      // Apply calculated positions to nodes
      reactFlowNodes.forEach((node) => {
        const pos = positionMap.get(node.id);
        if (pos) {
          // Adjust for node size (center the node on its position)
          const isAnchor = node.data.isAnchor;
          const offsetX = isAnchor ? 90 : 60; // Half of node width
          const offsetY = isAnchor ? 45 : 25; // Half of node height
          node.position = { x: pos.x - offsetX, y: pos.y - offsetY };
        } else {
          // Fallback: random position if not in map (shouldn't happen)
          console.warn(
            `[Layout] Node ${node.id} missing from position map, using fallback`,
          );
          node.position = {
            x: Math.random() * 200 - 100,
            y: Math.random() * 200 - 100,
          };
        }
      });

      console.log(
        `[Layout] ✅ Force-directed layout complete: ${reactFlowNodes.length} nodes positioned`,
      );
    } else {
      // LEGACY: Dagre + Radial layout
      console.log("[Layout] Using legacy radial layout");

      // Run dagre layout (still used for edge routing calculations)
      dagre.layout(dagreGraph);

      // Apply radial layout positions (anchor at center, connections radiate outward)
      const anchor = reactFlowNodes.find((n) => n.data.isAnchor);

      console.log(
        `[Layout DEBUG] Total nodes to position: ${reactFlowNodes.length}`,
      );
      console.log(`[Layout DEBUG] Bundle rootId: ${bundle.rootId}`);
      console.log(
        `[Layout DEBUG] Found anchor node:`,
        anchor?.id,
        anchor?.data?.verse,
      );

      // Check for duplicate nodes at anchor position
      const anchorCandidates = reactFlowNodes.filter((n) => n.data.isAnchor);
      if (anchorCandidates.length > 1) {
        console.error(
          `[Layout DEBUG] ⚠️ MULTIPLE ANCHORS DETECTED:`,
          anchorCandidates.map((n) => ({
            id: n.id,
            verse: `${n.data.verse.book_abbrev} ${n.data.verse.chapter}:${n.data.verse.verse}`,
          })),
        );
      }

      if (anchor) {
        // Anchor at center (0, 0) - anchor is 180x90, so offset is 90x45
        anchor.position = { x: -90, y: -45 };
        console.log(
          `[Layout DEBUG] Positioned anchor ${anchor.id} at center:`,
          anchor.position,
        );

        // Build depth map: distance from anchor node
        const depthMap = new Map<string, number>();
        const visited = new Set<string>();
        const queue: Array<{ nodeId: string; depth: number }> = [
          { nodeId: anchor.id, depth: 0 },
        ];

        while (queue.length > 0) {
          const { nodeId, depth } = queue.shift()!;
          if (visited.has(nodeId)) continue;
          visited.add(nodeId);
          depthMap.set(nodeId, depth);

          // Find connected nodes
          const connectedEdges = reactFlowEdges.filter(
            (e) => e.source === nodeId || e.target === nodeId,
          );
          connectedEdges.forEach((edge) => {
            const nextNodeId =
              edge.source === nodeId ? edge.target : edge.source;
            if (!visited.has(nextNodeId)) {
              queue.push({ nodeId: nextNodeId, depth: depth + 1 });
            }
          });
        }

        // Group nodes by depth
        const nodesByDepth = new Map<number, typeof reactFlowNodes>();
        reactFlowNodes.forEach((node) => {
          const depth = depthMap.get(node.id) || 0;
          if (!nodesByDepth.has(depth)) {
            nodesByDepth.set(depth, []);
          }
          nodesByDepth.get(depth)!.push(node);
        });

        // Position nodes in concentric circles
        const radiusStep = 200; // Distance between depth levels (increased for better spacing)
        const positionedNodes = new Set<string>();

        nodesByDepth.forEach((nodesAtDepth, depth) => {
          if (depth === 0) {
            positionedNodes.add(anchor.id); // Mark anchor as positioned
            return; // Skip anchor (already positioned)
          }

          const radius = depth * radiusStep;
          const angleStep = (2 * Math.PI) / nodesAtDepth.length;

          nodesAtDepth.forEach((node, index) => {
            const angle = index * angleStep - Math.PI / 2; // Start at top (-90 degrees)

            // Calculate center offsets based on node depth
            const nodeDepth = node.data.depth || node.data.verse.depth || 1;
            let offsetX: number, offsetY: number;

            if (nodeDepth === 1) {
              offsetX = 60; // 120 / 2
              offsetY = 25; // 50 / 2
            } else if (nodeDepth === 2) {
              offsetX = 50; // 100 / 2
              offsetY = 21; // 42 / 2
            } else {
              offsetX = 42.5; // 85 / 2
              offsetY = 17.5; // 35 / 2
            }

            node.position = {
              x: radius * Math.cos(angle) - offsetX,
              y: radius * Math.sin(angle) - offsetY,
            };

            positionedNodes.add(node.id); // Mark as positioned
          });
        });

        // Fallback: Use dagre positions for any nodes that weren't reached by BFS
        reactFlowNodes.forEach((node) => {
          if (!positionedNodes.has(node.id)) {
            const dagreNode = dagreGraph.node(node.id);
            const isNodeAnchor = node.data.isAnchor;
            const offsetX = isNodeAnchor ? 90 : 60;
            const offsetY = isNodeAnchor ? 45 : 25;
            node.position = {
              x: dagreNode.x - offsetX,
              y: dagreNode.y - offsetY,
            };
            console.log(
              `[Layout DEBUG] Using dagre fallback for unconnected node: ${node.id}`,
            );
          }
        });
      } else {
        // Fallback to dagre positions if no anchor found
        reactFlowNodes.forEach((node) => {
          const dagreNode = dagreGraph.node(node.id);
          const isNodeAnchor = node.data.isAnchor;
          const offsetX = isNodeAnchor ? 90 : 60;
          const offsetY = isNodeAnchor ? 45 : 25;
          node.position = {
            x: dagreNode.x - offsetX,
            y: dagreNode.y - offsetY,
          };
        });
      }
    } // End of USE_FORCE_LAYOUT conditional

    // Debug: Check for position conflicts
    const positionMap = new Map<string, string[]>();
    reactFlowNodes.forEach((node) => {
      const posKey = `${Math.round(node.position.x)},${Math.round(node.position.y)}`;
      if (!positionMap.has(posKey)) {
        positionMap.set(posKey, []);
      }
      positionMap
        .get(posKey)!
        .push(
          `${node.id} (${node.data.verse.book_abbrev} ${node.data.verse.chapter}:${node.data.verse.verse})`,
        );
    });

    // Log any position conflicts
    positionMap.forEach((nodeIds, position) => {
      if (nodeIds.length > 1) {
        console.error(
          `[Layout DEBUG] ⚠️ POSITION CONFLICT at ${position}:`,
          nodeIds,
        );
      }
    });

    console.log(
      `[Layout DEBUG] Final layout: ${reactFlowNodes.length} nodes, ${reactFlowEdges.length} edges`,
    );

    return { nodes: reactFlowNodes, edges: reactFlowEdges };
  };

  // Auto-expand anchor and depth 1 nodes on initial load
  useEffect(() => {
    if (!bundle) {
      setInitialExpansionDone(false);
      return;
    }

    if (initialExpansionDone) return;

    // Only expand the anchor node - its direct children (depth 1) will become visible
    const nodesToExpand = new Set<number>();

    if (bundle.rootId) {
      nodesToExpand.add(bundle.rootId);

      // Also find and expand any nodes at depth 0 or 1 to show the first circle
      bundle.nodes.forEach((node) => {
        if (node.depth !== undefined && node.depth <= 1) {
          nodesToExpand.add(node.id);
        }
      });

      console.log(
        `[NarrativeMap] Auto-expanding anchor + depth 0-1 nodes: ${nodesToExpand.size} nodes`,
        Array.from(nodesToExpand).slice(0, 10),
      );
    }

    setExpandedNodes(nodesToExpand);
    setInitialExpansionDone(true);
  }, [bundle, initialExpansionDone]);

  // Update layout when bundle, highlights, or expanded nodes change
  useEffect(() => {
    if (!bundle) {
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      bundle,
      expandedNodes,
      handleExpandNode,
    );
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    // Reset edge animation state and trigger after node entrance
    setEdgesAnimated(false);
    const maxNodeDepth = Math.max(
      ...layoutedNodes.map((n) => (n.data.verse.depth as number) || 0),
      0,
    );
    const nodeEntranceTime = Math.min(maxNodeDepth * 80 + 400, 1200); // Wait for nodes to enter

    const timer = setTimeout(() => {
      setEdgesAnimated(true);
    }, nodeEntranceTime);

    return () => clearTimeout(timer);
  }, [bundle, highlightedRefs, expandedNodes, handleExpandNode]);

  // Discover additional LLM connections automatically
  useEffect(() => {
    if (!bundle || discovering) return;

    const discoverAdditionalConnections = async () => {
      try {
        setDiscovering(true);
        setDiscoveryProgress({
          phase: "selecting",
          progress: 10,
          message: "Selecting key verses...",
        });
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

        setDiscoveryProgress({
          phase: "analyzing",
          progress: 30,
          message: `Analyzing ${coreVerses.length} verses with AI...`,
        });
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

        setDiscoveryProgress({
          phase: "analyzing",
          progress: 60,
          message: "Processing AI insights...",
        });

        const data = await response.json();

        // Check if this is an error response
        if (data.error) {
          console.warn("[LLM Discovery] API error:", data.error, data.message);
          console.warn("[LLM Discovery] Rate limited - try again later");
          return;
        }

        const { connections, fromCache } = data;
        console.log(
          `[LLM Discovery] Found ${connections.length} connections (${fromCache ? "cached" : "new"})`,
        );

        if (connections.length === 0) {
          console.log("[LLM Discovery] No new connections discovered");
          setDiscoveryProgress({
            phase: "complete",
            progress: 100,
            message: "Discovery complete",
          });
          return;
        }

        setDiscoveryProgress({
          phase: "connecting",
          progress: 75,
          message: `Mapping ${connections.length} connections...`,
        });

        // Add discovered edges to the map
        const newEdges = (connections as DiscoveredConnection[]).map((conn) => {
          const styleType =
            TYPE_TO_STYLE_MAP[conn.type] || TYPE_TO_STYLE_MAP.DEEPER;
          const edgeStyle = EDGE_STYLES[styleType];

          // LLM-discovered edges always use dotted pattern
          const strokeDashArray = "2,3"; // Dotted for LLM-discovered

          return {
            id: `llm-${conn.type}-${conn.from}-${conn.to}`,
            source: conn.from.toString(),
            target: conn.to.toString(),
            type: "smoothstep",
            data: {
              styleType,
              edgeType: conn.type,
              explanation: conn.explanation,
              confidence: conn.confidence,
              isLLMDiscovered: true,
              strokeDashArray, // Store pattern for consistency
              baseWidth: edgeStyle.width, // Store base width for hover effects
            },
            style: {
              stroke: `url(#edge-gradient-${styleType})`, // Use directional gradient
              strokeWidth: edgeStyle.width,
              strokeDasharray: strokeDashArray, // Dotted for LLM-discovered
              opacity: 0.7,
              // Subtle glow for LLM-discovered edges
              filter: `drop-shadow(0 0 3px ${edgeStyle.glowColor}40)`, // 40 = 25% opacity
            },
            animated: true,
          };
        });

        console.log(
          `[LLM Discovery] Adding ${newEdges.length} new edges to map`,
        );

        // Deduplicate edges by ID when adding
        setEdges((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const uniqueNewEdges = newEdges.filter((e) => !existingIds.has(e.id));

          if (uniqueNewEdges.length === 0) {
            console.log("[LLM Discovery] All edges already exist, skipping");
            return prev;
          }

          console.log(
            `[LLM Discovery] Adding ${uniqueNewEdges.length} unique edges (${newEdges.length - uniqueNewEdges.length} duplicates filtered)`,
          );
          return [...prev, ...uniqueNewEdges];
        });

        setDiscoveryProgress({
          phase: "complete",
          progress: 100,
          message: `Added ${connections.length} connections`,
        });

        // Hide progress bar after a brief moment
        setTimeout(() => {
          setDiscovering(false);
        }, 1500);
      } catch (error) {
        console.error("[LLM Discovery] Error:", error);
        // Silent fail - user still gets algorithmic connections
        setDiscovering(false);
      }
    };

    discoverAdditionalConnections();
  }, [bundle]);

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
  }, [edges, bundle, expandedNodes, computeBranchClusters]);

  // Apply edge drawing animation
  useEffect(() => {
    if (!edgesAnimated) return;

    // Animate edges with a drawing effect
    setEdges((eds) =>
      eds.map((edge, idx) => {
        const edgeData = edge.data as EdgeData;
        const styleType = edgeData?.styleType || "PURPLE";
        const isSynthetic = edgeData?.isSynthetic;
        const finalOpacity =
          styleType === "GREY" ? 0.3 : isSynthetic ? 0.4 : 0.7;

        // Restore the proper line pattern (solid, dashed, or dotted)
        const storedPattern = edgeData?.strokeDashArray;
        const finalStrokeDasharray = storedPattern || "0"; // Default to solid

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: finalOpacity,
            strokeDasharray: finalStrokeDasharray, // Restore stored pattern
            strokeDashoffset: "0",
            transition:
              "stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1), opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)",
            transitionDelay: `${idx * 50}ms`, // Stagger each edge by 50ms
          },
        };
      }),
    );
  }, [edgesAnimated]);

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
        eds.map((edge) => {
          const edgeData = edge.data as EdgeData;
          const styleType = edgeData?.styleType || "PURPLE";
          const edgeStyle = EDGE_STYLES[styleType];
          const baseWidth = edgeData?.baseWidth || edgeStyle.width;

          // Restore subtle glow for colored edges
          const baseFilter =
            styleType !== "GREY"
              ? `drop-shadow(0 0 3px ${edgeStyle.glowColor}40)`
              : "none";

          return {
            ...edge,
            style: {
              ...edge.style,
              opacity: 0.7,
              filter: baseFilter,
              strokeWidth: baseWidth,
            },
          };
        }),
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
        const edgeData = edge.data as EdgeData;
        const styleType = edgeData?.styleType || "PURPLE";
        const edgeStyle = EDGE_STYLES[styleType];
        const isColoredBranch = styleType !== "GREY"; // Only colored branches get glow

        // Use stored baseWidth if available, otherwise fall back to style width
        const baseWidth = edgeData?.baseWidth || edgeStyle.width;

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: isInBranch ? 1 : 0.3,
            filter:
              isInBranch && isColoredBranch
                ? `drop-shadow(0 0 8px ${edgeStyle.glowColor})`
                : "none",
            strokeWidth: isInBranch ? baseWidth + 1 : baseWidth,
          },
        };
      }),
    );
  }, [hoveredBranch]);

  // 🌟 GOLDEN THREAD: Reveal semantic color on anchor ray hover
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const edgeData = edge.data as EdgeData & {
          isAnchorRay?: boolean;
          styleType?: string;
        };

        // Only update anchor rays
        if (!edgeData?.isAnchorRay) return edge;

        // Determine if this edge is currently hovered
        const isHovered = hoveredAnchorRay === edge.id;

        // Reveal true semantic color on hover, otherwise show GOLD
        const visualStyleType = isHovered
          ? edgeData.styleType || "PURPLE"
          : "GOLD";
        const edgeStyle = EDGE_STYLES[visualStyleType];

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: `url(#edge-gradient-${visualStyleType})`,
            filter: `drop-shadow(0 0 6px ${edgeStyle.glowColor}80)`,
          },
        };
      }),
    );
  }, [hoveredAnchorRay]);

  // Apply Focus Mode dimming when focused node changes
  useEffect(() => {
    if (!focusedNodeId) {
      lastAppliedFocusRef.current = null;
      return; // No focus mode active
    }

    // Skip if we already applied focus for this node (prevent infinite loop)
    if (lastAppliedFocusRef.current === focusedNodeId) {
      return;
    }

    try {
      // Find connected edges for the focused node
      const connectedEdgeIds = new Set(
        edges
          .filter(
            (e) => e.source === focusedNodeId || e.target === focusedNodeId,
          )
          .map((e) => e.id),
      );

      // Find connected node IDs
      const connectedNodeIds = new Set<string>([focusedNodeId]);
      edges.forEach((edge) => {
        if (edge.source === focusedNodeId) connectedNodeIds.add(edge.target);
        if (edge.target === focusedNodeId) connectedNodeIds.add(edge.source);
      });

      // 🌟 GOLDEN THREAD: Check if focused node is anchor
      const isAnchorFocused = focusedNodeId === bundle.rootId?.toString();

      // Dim non-focused nodes to 20% opacity, add GOLD glow to anchor connections
      setNodes((nds) =>
        nds.map((node) => {
          const isConnected = connectedNodeIds.has(node.id);
          const isFocusedNode = node.id === focusedNodeId;

          // 🌟 GOLDEN THREAD: If anchor is focused and this node is connected, add GOLD glow
          const shouldGlowGold =
            isAnchorFocused && isConnected && !isFocusedNode;

          return {
            ...node,
            style: {
              ...node.style,
              opacity: isConnected ? 1 : 0.2,
              // 🌟 GOLDEN THREAD: Add GOLD glow for anchor connections
              ...(shouldGlowGold && {
                boxShadow: "0 0 20px #FBBF24, 0 0 40px #F59E0B",
                borderColor: "#D97706",
                borderWidth: "3px",
                borderStyle: "solid",
              }),
              transitionProperty: "opacity, box-shadow, border-color",
              transitionDuration: "300ms",
              transitionTimingFunction: "ease-in-out",
            },
          };
        }),
      );

      // Dim non-connected edges to 10% opacity
      setEdges((eds) =>
        eds.map((edge) => ({
          ...edge,
          style: {
            ...edge.style,
            opacity: connectedEdgeIds.has(edge.id) ? 0.7 : 0.1,
            transitionProperty: "opacity",
            transitionDuration: "300ms",
            transitionTimingFunction: "ease-in-out",
          },
        })),
      );

      // Mark this focus as applied to prevent re-triggering
      lastAppliedFocusRef.current = focusedNodeId;
    } catch (error) {
      console.error(`[Focus DEBUG] ❌ Error applying focus mode:`, error);
      // Reset focus mode on error
      setFocusedNodeId(null);
      lastAppliedFocusRef.current = null;
    }
  }, [focusedNodeId, edges, nodes, setNodes, setEdges]);

  // Reset styling when exiting Focus Mode
  useEffect(() => {
    if (focusedNodeId !== null) return; // Still in focus mode

    // Reset node opacity and remove GOLD glow
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        style: {
          ...node.style,
          opacity: 1,
          // 🌟 GOLDEN THREAD: Remove GOLD glow when exiting focus
          boxShadow: undefined,
          borderColor: undefined,
          borderWidth: undefined,
          borderStyle: undefined,
        },
      })),
    );

    // Reset edge opacity
    setEdges((eds) =>
      eds.map((edge) => {
        const edgeData = edge.data as EdgeData;
        const styleType = edgeData?.styleType || "PURPLE";
        const isSynthetic = edgeData?.isSynthetic;
        const defaultOpacity =
          styleType === "GREY" ? 0.3 : isSynthetic ? 0.4 : 0.7;

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: defaultOpacity,
          },
        };
      }),
    );
  }, [focusedNodeId]);

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
      const edgeData = edge.data as EdgeData;
      const styleType = edgeData?.styleType;

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
      const isLLMDiscovered = edgeData?.isLLMDiscovered || false;
      const llmExplanation = edgeData?.explanation;
      const llmConfidence = edgeData?.confidence;

      // Get the cluster for this edge (contains all connected verses)
      const cluster = branchClusters.get(edge.id);
      const connectedVerseIds = cluster
        ? Array.from(cluster.nodeIds)
        : [fromId, toId];

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
        connectionType: styleType,
        similarity: isLLMDiscovered ? llmConfidence || 0 : similarity,
        position: { x: posX, y: posY },
        explanation: llmExplanation,
        confidence: llmConfidence,
        isLLMDiscovered,
        connectedVerseIds, // All verses in this cluster
      });
    },
    [bundle, branchClusters],
  );

  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const isFastMoving = checkMouseVelocity(event.clientX, event.clientY);

      // 🌟 GOLDEN THREAD: Reveal semantic color for anchor rays on hover
      const edgeData = edge.data as {
        isAnchorRay?: boolean;
        styleType?: string;
      };
      if (edgeData?.isAnchorRay) {
        setHoveredAnchorRay(edge.id);
      }

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
    // 🌟 GOLDEN THREAD: Return anchor ray to GOLD when mouse leaves
    setHoveredAnchorRay(null);

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
    return <MapSkeleton />;
  }

  return (
    <div className="h-full w-full relative">
      {/* Discovery Progress Bar */}
      {discovering && (
        <DiscoveryProgress
          phase={discoveryProgress.phase}
          progress={discoveryProgress.progress}
          message={discoveryProgress.message}
        />
      )}

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
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onEdgeMouseEnter={handleEdgeMouseEnter}
        onEdgeMouseLeave={handleEdgeMouseLeave}
        nodeTypes={nodeTypes}
        minZoom={0.2}
        maxZoom={2.0}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      >
        {/* SVG gradient definitions for directional edge colors */}
        <svg style={{ position: "absolute", width: 0, height: 0 }}>
          <defs>
            {/* Grey gradient */}
            <linearGradient
              id="edge-gradient-GREY"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#9CA3AF" stopOpacity="1" />
              <stop offset="100%" stopColor="#6B7280" stopOpacity="1" />
            </linearGradient>
            {/* Gold gradient */}
            <linearGradient
              id="edge-gradient-GOLD"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#FBBF24" stopOpacity="1" />
              <stop offset="100%" stopColor="#D97706" stopOpacity="1" />
            </linearGradient>
            {/* Purple gradient */}
            <linearGradient
              id="edge-gradient-PURPLE"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#A78BFA" stopOpacity="1" />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity="1" />
            </linearGradient>
            {/* Cyan gradient */}
            <linearGradient
              id="edge-gradient-CYAN"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="1" />
              <stop offset="100%" stopColor="#0891B2" stopOpacity="1" />
            </linearGradient>
            {/* Typology gradient (orange to gold) */}
            <linearGradient
              id="edge-gradient-TYPOLOGY"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#F59E0B" stopOpacity="1" />
              <stop offset="100%" stopColor="#EA580C" stopOpacity="1" />
            </linearGradient>
            {/* Fulfillment gradient */}
            <linearGradient
              id="edge-gradient-FULFILLMENT"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#5EEAD4" stopOpacity="1" />
              <stop offset="100%" stopColor="#14B8A6" stopOpacity="1" />
            </linearGradient>
            {/* Contrast gradient */}
            <linearGradient
              id="edge-gradient-CONTRAST"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#F87171" stopOpacity="1" />
              <stop offset="100%" stopColor="#DC2626" stopOpacity="1" />
            </linearGradient>
            {/* Progression gradient */}
            <linearGradient
              id="edge-gradient-PROGRESSION"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#4ADE80" stopOpacity="1" />
              <stop offset="100%" stopColor="#16A34A" stopOpacity="1" />
            </linearGradient>
            {/* Pattern gradient */}
            <linearGradient
              id="edge-gradient-PATTERN"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#93C5FD" stopOpacity="1" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="1" />
            </linearGradient>
          </defs>
        </svg>
        <Background color="#f0f0f0" gap={16} />
        <Controls />
      </ReactFlow>

      {/* Floating Legend */}
      <div className="absolute bottom-4 right-4 z-50">
        <div
          className="bg-gray-900/95 rounded-lg shadow-2xl border border-gray-700 overflow-hidden"
          style={{
            width: legendCollapsed ? "48px" : "280px",
            transition: "width 250ms ease-in-out",
          }}
        >
          {/* Legend Header */}
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
            onClick={() => setLegendCollapsed(!legendCollapsed)}
          >
            <span className="text-white font-semibold text-sm">
              {legendCollapsed ? "" : "Legend"}
            </span>
            <button
              className="text-gray-400 hover:text-white transition-colors"
              title={legendCollapsed ? "Expand legend" : "Collapse legend"}
            >
              <svg
                className="w-5 h-5 transform transition-transform"
                style={{
                  transform: legendCollapsed
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>

          {/* Legend Content */}
          {!legendCollapsed && (
            <div className="px-3 pb-3 space-y-4">
              {/* Edge Colors */}
              <div>
                <div className="text-gray-400 text-xs font-semibold uppercase mb-2">
                  Connection Types
                </div>
                <div className="space-y-1.5">
                  {Object.entries(EDGE_STYLES)
                    .filter(([key]) => key !== "GREY")
                    .map(([key, style]) => (
                      <div key={key} className="flex items-center gap-2">
                        <div
                          className="w-6 h-0.5 rounded-full"
                          style={{
                            background: `linear-gradient(to right, ${style.glowColor}, ${style.color})`,
                          }}
                        />
                        <span className="text-white text-xs">
                          {style.label}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Line Patterns */}
              <div>
                <div className="text-gray-400 text-xs font-semibold uppercase mb-2">
                  Line Patterns
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <svg width="24" height="2" className="flex-shrink-0">
                      <line
                        x1="0"
                        y1="1"
                        x2="24"
                        y2="1"
                        stroke="white"
                        strokeWidth="2"
                      />
                    </svg>
                    <span className="text-white text-xs">Same Testament</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="2" className="flex-shrink-0">
                      <line
                        x1="0"
                        y1="1"
                        x2="24"
                        y2="1"
                        stroke="white"
                        strokeWidth="2"
                        strokeDasharray="5,3"
                      />
                    </svg>
                    <span className="text-white text-xs">Cross Testament</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg width="24" height="2" className="flex-shrink-0">
                      <line
                        x1="0"
                        y1="1"
                        x2="24"
                        y2="1"
                        stroke="white"
                        strokeWidth="2"
                        strokeDasharray="2,2"
                      />
                    </svg>
                    <span className="text-white text-xs">AI Discovered</span>
                  </div>
                </div>
              </div>

              {/* Interactions */}
              <div>
                <div className="text-gray-400 text-xs font-semibold uppercase mb-2">
                  Interactions
                </div>
                <div className="space-y-1">
                  <div className="text-white text-xs">
                    Click node → Focus Mode
                  </div>
                  <div className="text-white text-xs">ESC → Exit Focus</div>
                  <div className="text-white text-xs">Click edge → Details</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Semantic Connection Modal */}
      {clickedConnection && (onTrace || onGoDeeper) && (
        <SemanticConnectionModal
          fromVerse={clickedConnection.fromVerse}
          toVerse={clickedConnection.toVerse}
          connectionType={clickedConnection.connectionType}
          similarity={clickedConnection.similarity}
          position={clickedConnection.position}
          onClose={() => setClickedConnection(null)}
          onTrace={onTrace || (() => {})}
          onGoDeeper={onGoDeeper || (() => {})}
          explanation={clickedConnection.explanation}
          isLLMDiscovered={clickedConnection.isLLMDiscovered}
          connectedVerseIds={clickedConnection.connectedVerseIds}
        />
      )}
    </div>
  );
};

// Memoize component to prevent re-renders when props haven't changed
export const NarrativeMap = React.memo(
  NarrativeMapComponent,
  (prevProps, nextProps) => {
    // Custom comparison: only re-render if bundle, highlightedRefs, onTrace, or onGoDeeper actually changed
    return (
      prevProps.bundle === nextProps.bundle &&
      prevProps.highlightedRefs.length === nextProps.highlightedRefs.length &&
      prevProps.highlightedRefs.every(
        (ref, i) => ref === nextProps.highlightedRefs[i],
      ) &&
      prevProps.onTrace === nextProps.onTrace &&
      prevProps.onGoDeeper === nextProps.onGoDeeper
    );
  },
);
