import React, {
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  useMemo,
} from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import dagre from "dagre"; // LEGACY: Will be replaced by force-directed layout
import "@xyflow/react/dist/style.css";
import { calculateForceLayout } from "../../utils/forceLayout";
import { VerseNode } from "./VerseNode";
import { SemanticConnectionModal } from "./SemanticConnectionModal";
import { ParallelPassagesModal } from "./ParallelPassagesModal";
import { DiscoveryOverlay } from "./DiscoveryOverlay";
import type {
  VisualContextBundle,
  EdgeType,
  ThreadNode,
} from "../../types/goldenThread";
import type { GoDeeperPayload } from "../../types/chat";

// Refined Color System with Intentional Color Psychology
const EDGE_STYLES = {
  GREY: {
    color: "#6B7280", // Neutral grey
    glowColor: "#9CA3AF",
    width: 1,
    label: "Reference",
    description: "Cross-references",
  },
  GOLD: {
    color: "#D97706", // Richer, warmer gold - same roots, shared DNA
    glowColor: "#FBBF24",
    width: 2,
    label: "Same Words",
    description: "Key words or phrases appear in both verses",
  },
  PURPLE: {
    color: "#7C3AED", // Deeper, more royal purple - theological echo across time
    glowColor: "#A78BFA",
    width: 2,
    label: "Same Teaching",
    description: "Verses share the same theological truth",
  },
  CYAN: {
    color: "#0891B2", // Sharper, more electric cyan - prophetic arrow (past -> future)
    glowColor: "#22D3EE",
    width: 2,
    label: "Prophecy Fulfilled",
    description: "Old Testament prophecy -> New Testament event",
  },
  GENEALOGY: {
    color: "#10B981",
    glowColor: "#34D399",
    width: 2,
    label: "Lineage",
    description: "Family line connections across Scripture",
  },
  // LLM-Discovered Connection Types
  TYPOLOGY: {
    color: "#EA580C", // Earthy orange - shadow foreshadowing substance
    glowColor: "#F59E0B", // Divine gold glow
    width: 2,
    label: "Similar Story",
    description: "Events or people mirror each other",
  },
  FULFILLMENT: {
    color: "#14B8A6", // Teal
    glowColor: "#5EEAD4",
    width: 2,
    label: "Prophecy Fulfilled",
    description: "Prophecy fulfilled here (inferred)",
  },
  CONTRAST: {
    color: "#DC2626", // Softer but still bold red - spiritual opposition
    glowColor: "#F87171",
    width: 2,
    label: "Opposite Ideas",
    description: "Verses show contrasting teachings",
  },
  PROGRESSION: {
    color: "#16A34A", // More verdant, life-giving green - covenant unfolding
    glowColor: "#4ADE80",
    width: 2,
    label: "Progression",
    description: "Later verse builds on the earlier idea",
  },
  PATTERN: {
    color: "#3B82F6", // Blue
    glowColor: "#93C5FD",
    width: 2,
    label: "Pattern",
    description: "Same literary or structural pattern",
  },
} as const;

type ConnectionStyleType = Exclude<keyof typeof EDGE_STYLES, "GREY">;

// Map edge types to visual categories
const TYPE_TO_STYLE_MAP: Record<string, keyof typeof EDGE_STYLES> = {
  DEEPER: "GREY", // Regular cross-references = subtle grey
  ROOTS: "GOLD", // Semantic lexical threads = gold highlight
  ECHOES: "PURPLE", // Semantic theological threads = purple highlight
  PROPHECY: "CYAN", // Semantic prophetic threads = cyan highlight
  GENEALOGY: "GENEALOGY",
  NARRATIVE: "GREY",
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
  isStructural?: boolean;
  isSynthetic?: boolean; // For synthetic hierarchy edges
  baseWidth?: number; // Calculated width based on similarity strength
  weight?: number;
  selectionScore?: number;
}

interface DiscoveredConnection {
  from: number;
  to: number;
  type: string;
  explanation: string;
  confidence: number;
}

interface ConnectionTopicGroup {
  styleType: ConnectionStyleType;
  label: string;
  color: string;
  count: number;
  verses: ThreadNode[];
  verseIds: number[];
  edgeIds: string[];
}

const nodeTypes = {
  verseNode: VerseNode,
};

const DISCOVERY_BATCH_SIZE = 12;

interface NarrativeMapProps {
  bundle: VisualContextBundle | null;
  highlightedRefs: string[]; // ["John 3:16", "Romans 5:8"]
  onTrace?: (prompt: string) => void;
  onGoDeeper?: (prompt: GoDeeperPayload) => void;
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
  const [analyzedVerseIds, setAnalyzedVerseIds] = useState<Set<number>>(
    new Set(),
  );
  const [initialExpansionDone, setInitialExpansionDone] = useState(false);
  // 🌟 GOLDEN THREAD: Track hovered anchor ray for glow emphasis
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
  const [discoveryHighlights, setDiscoveryHighlights] = useState<
    Array<{ title: string; subtitle: string }>
  >([]);
  const [discoveryHighlightIndex, setDiscoveryHighlightIndex] = useState(0);
  const [edgesAnimated, setEdgesAnimated] = useState(false);
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const autoCenteredRef = useRef(false);
  const autoDiscoveryRunRef = useRef(false);

  // Semantic connection modal state
  const [clickedConnection, setClickedConnection] = useState<{
    fromVerse: { id: number; reference: string; text: string };
    toVerse: { id: number; reference: string; text: string };
    connectionType: ConnectionStyleType;
    similarity: number;
    position: { x: number; y: number };
    explanation?: string;
    confidence?: number;
    isLLMDiscovered?: boolean;
    connectedVerseIds?: number[];
    connectedVersesPreview?: Array<{
      id: number;
      reference: string;
      text: string;
    }>;
    connectionTopics?: ConnectionTopicGroup[];
    baseVerseId?: number;
  } | null>(null);

  // Parallel passages modal state
  const [parallelPassagesModal, setParallelPassagesModal] = useState<{
    verse: ThreadNode;
    position: { x: number; y: number };
  } | null>(null);

  const formatNodeReference = useCallback(
    (node: ThreadNode) =>
      node.displaySubLabel || `${node.book_name} ${node.chapter}:${node.verse}`,
    [],
  );

  // Branch highlighting state
  const [hoveredBranch, setHoveredBranch] = useState<BranchCluster | null>(
    null,
  );
  const [selectedBranch, setSelectedBranch] = useState<BranchCluster | null>(
    null,
  );
  const [tooltipState, setTooltipState] = useState<{
    visible: boolean;
    expanded: boolean;
    position: { x: number; y: number };
    count: number;
  }>({ visible: false, expanded: false, position: { x: 0, y: 0 }, count: 0 });

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

  useEffect(() => {
    setHoveredBranch(null);
    setSelectedBranch(null);
  }, [bundle?.rootId]);

  useEffect(() => {
    autoDiscoveryRunRef.current = false;
    setAnalyzedVerseIds(new Set());
    setDiscoveryHighlights([]);
    setDiscoveryHighlightIndex(0);
  }, [bundle]);

  const connectionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    edges.forEach((edge) => {
      const edgeData = edge.data as EdgeData & { visualStyleType?: string };
      const visualStyleType =
        edgeData?.visualStyleType || edgeData?.styleType || "PURPLE";
      if (visualStyleType === "GREY") return;
      const sourceId = Number(edge.source);
      const targetId = Number(edge.target);
      if (Number.isFinite(sourceId)) {
        counts.set(sourceId, (counts.get(sourceId) ?? 0) + 1);
      }
      if (Number.isFinite(targetId)) {
        counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
      }
    });
    return counts;
  }, [edges]);

  useEffect(() => {
    if (!bundle || connectionCounts.size === 0) return;
    setNodes((nds) =>
      nds.map((node) => {
        const nodeId = Number(node.id);
        const count = connectionCounts.get(nodeId) ?? 0;
        if (node.data.connectionCount === count) return node;
        return {
          ...node,
          data: {
            ...node.data,
            connectionCount: count,
          },
        };
      }),
    );
  }, [bundle, connectionCounts]);

  useEffect(() => {
    autoCenteredRef.current = false;
  }, [bundle?.rootId, bundle?.nodes?.length, bundle?.edges?.length]);

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

  // Handler for showing parallel passages modal
  const handleShowParallels = useCallback(
    (verseId: number, event?: React.MouseEvent) => {
      const verse = bundle?.nodes.find((n) => n.id === verseId);
      if (
        !verse ||
        !verse.parallelPassages ||
        verse.parallelPassages.length === 0
      ) {
        return;
      }

      // Get click position for modal placement
      const position = event
        ? { x: event.clientX, y: event.clientY }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 };

      setParallelPassagesModal({
        verse,
        position,
      });
    },
    [bundle],
  );

  const selectPrimaryEdge = useCallback(
    (edgeIds: string[]): Edge | null => {
      const candidates = edges.filter((edge) => edgeIds.includes(edge.id));
      if (candidates.length === 0) return null;
      return candidates.reduce((best, current) => {
        const bestWeight = (best.data as EdgeData | undefined)?.weight ?? 0.7;
        const currentWeight =
          (current.data as EdgeData | undefined)?.weight ?? 0.7;
        return currentWeight > bestWeight ? current : best;
      }, candidates[0]);
    },
    [edges],
  );

  const buildPreviewVerses = useCallback(
    (ids: number[]) => {
      if (!bundle) return [];
      return ids
        .map((id) => bundle.nodes.find((n) => n.id === id))
        .filter(
          (node): node is ThreadNode =>
            node !== undefined && typeof node.id === "number",
        )
        .map((node) => ({
          id: node.id,
          reference: formatNodeReference(node),
          text: node.text,
        }));
    },
    [bundle, formatNodeReference],
  );

  const buildConnectionTopics = useCallback(
    (nodeId: number) => {
      if (!bundle) return null;

      const verse = bundle.nodes.find((n) => n.id === nodeId);
      if (!verse) return null;

      const nodeIdString = nodeId.toString();
      const incidentEdges = edges.filter(
        (edge) =>
          (edge.source === nodeIdString || edge.target === nodeIdString) &&
          !(edge.data as EdgeData | undefined)?.isSynthetic,
      );

      const groups = new Map<
        ConnectionStyleType,
        { edgeIds: Set<string>; verseIds: Set<number> }
      >();

      incidentEdges.forEach((edge) => {
        const edgeData = edge.data as
          | (EdgeData & { visualStyleType?: string })
          | undefined;
        const styleType = (edgeData?.styleType ||
          edgeData?.visualStyleType ||
          "GREY") as keyof typeof EDGE_STYLES;
        if (styleType === "GREY") {
          return;
        }
        const connectionStyle = styleType as ConnectionStyleType;
        const otherId =
          edge.source === nodeIdString
            ? Number(edge.target)
            : Number(edge.source);
        if (!Number.isFinite(otherId)) return;

        if (!groups.has(connectionStyle)) {
          groups.set(connectionStyle, {
            edgeIds: new Set<string>(),
            verseIds: new Set<number>(),
          });
        }
        const entry = groups.get(connectionStyle);
        entry?.edgeIds.add(edge.id);
        entry?.verseIds.add(otherId);
      });

      const buildGroup = (
        styleType: ConnectionStyleType,
        entry: { edgeIds: Set<string>; verseIds: Set<number> },
      ): ConnectionTopicGroup => {
        const verseIds = Array.from(entry.verseIds);
        const verses = verseIds
          .map((id) => bundle.nodes.find((n) => n.id === id))
          .filter(
            (node): node is ThreadNode =>
              node !== undefined && typeof node.id === "number",
          );
        return {
          styleType,
          label: EDGE_STYLES[styleType].label,
          color: EDGE_STYLES[styleType].color,
          count: verses.length,
          verses,
          verseIds,
          edgeIds: Array.from(entry.edgeIds),
        };
      };

      const groupList = Array.from(groups.entries()).map(([styleType, entry]) =>
        buildGroup(styleType, entry),
      );

      groupList.sort((a, b) => b.count - a.count);

      return {
        verse,
        groups: groupList,
      };
    },
    [bundle, edges],
  );

  const pickDefaultTopic = useCallback(
    (groups: ConnectionTopicGroup[], preferredStyle?: string) => {
      if (preferredStyle) {
        const preferredGroup = groups.find(
          (group) => group.styleType === preferredStyle,
        );
        if (preferredGroup) return preferredGroup;
      }

      if (groups.length === 0) return null;

      let bestGroup = groups[0];
      let bestWeight = -1;
      groups.forEach((group) => {
        const primaryEdge = selectPrimaryEdge(group.edgeIds);
        const weight = (primaryEdge?.data as EdgeData | undefined)?.weight ?? 0;
        if (weight > bestWeight) {
          bestWeight = weight;
          bestGroup = group;
        }
      });
      return bestGroup;
    },
    [selectPrimaryEdge],
  );

  const openConnectionModalForGroup = useCallback(
    (
      baseVerse: ThreadNode,
      group: ConnectionTopicGroup,
      position: { x: number; y: number },
      topicGroups: ConnectionTopicGroup[],
      primaryEdgeOverride?: Edge | null,
    ) => {
      if (!bundle) return;

      const primaryEdge =
        primaryEdgeOverride ?? selectPrimaryEdge(group.edgeIds);
      const edgeData = primaryEdge?.data as EdgeData | undefined;

      const baseId = baseVerse.id;
      const otherId = primaryEdge
        ? primaryEdge.source === baseId.toString()
          ? Number(primaryEdge.target)
          : Number(primaryEdge.source)
        : (group.verseIds[0] ?? baseId);

      const fromVerse = baseVerse;
      const toVerse = bundle.nodes.find((n) => n.id === otherId) ?? baseVerse;

      const similarity = edgeData?.weight ?? 0.8;
      const isLLMDiscovered = edgeData?.isLLMDiscovered || false;
      const llmExplanation = edgeData?.explanation;
      const llmConfidence = edgeData?.confidence;

      const highlightVerseIds = Array.from(
        new Set([baseId, ...group.verseIds]),
      );
      const connectedVerseIds =
        bundle.rootId === baseId ? group.verseIds : highlightVerseIds;

      const connectedVersesPreview = buildPreviewVerses(connectedVerseIds);

      if (group.edgeIds.length > 0 || group.verseIds.length > 0) {
        setSelectedBranch({
          edgeIds: new Set(group.edgeIds),
          nodeIds: new Set(highlightVerseIds),
          styleType: group.styleType,
          edgeType: "DEEPER",
          pathPreview: "Connection",
        });
      } else {
        setSelectedBranch(null);
      }

      setClickedConnection({
        fromVerse: {
          id: fromVerse.id,
          reference: formatNodeReference(fromVerse),
          text: fromVerse.text,
        },
        toVerse: {
          id: toVerse.id,
          reference: formatNodeReference(toVerse),
          text: toVerse.text,
        },
        connectionType: group.styleType,
        similarity: isLLMDiscovered ? llmConfidence || 0 : similarity,
        position,
        explanation: llmExplanation,
        confidence: llmConfidence,
        isLLMDiscovered,
        connectedVerseIds,
        connectedVersesPreview,
        connectionTopics: topicGroups,
        baseVerseId: baseId,
      });
    },
    [buildPreviewVerses, bundle, selectPrimaryEdge],
  );

  const handleSelectConnectionTopic = useCallback(
    (styleType: ConnectionTopicGroup["styleType"]) => {
      if (!bundle || !clickedConnection) return;
      if (clickedConnection.connectionType === styleType) return;
      if (!clickedConnection.connectionTopics) return;

      const baseVerseId =
        clickedConnection.baseVerseId ?? clickedConnection.fromVerse.id;
      const baseVerse = bundle.nodes.find((n) => n.id === baseVerseId);
      if (!baseVerse) return;

      const group = clickedConnection.connectionTopics.find(
        (topic) => topic.styleType === styleType,
      );
      if (!group) return;

      openConnectionModalForGroup(
        baseVerse,
        group,
        clickedConnection.position,
        clickedConnection.connectionTopics,
      );
    },
    [bundle, clickedConnection, openConnectionModalForGroup],
  );

  // Handler for node click (Focus Mode or Connection Card)
  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      try {
        console.log(`[Click DEBUG] Node clicked:`, {
          id: node.id,
          verse: node.data?.verse
            ? `${node.data.verse.book_abbrev} ${node.data.verse.chapter}:${node.data.verse.verse}`
            : "unknown",
          isAnchor: node.data?.isAnchor,
          position: node.position,
        });

        setSelectedBranch(null);

        if (event.shiftKey) {
          setFocusedNodeId((prev) => {
            const newFocusId = prev === node.id ? null : node.id;
            console.log(
              `[Click DEBUG] Focus mode ${newFocusId ? "ENABLED" : "DISABLED"} for node ${node.id}`,
            );
            return newFocusId;
          });
          return;
        }

        const nodeId = Number(node.id);
        const topicData = buildConnectionTopics(nodeId);

        if (topicData && topicData.groups.length > 0) {
          const preferredStyle =
            typeof node.data?.semanticConnectionType === "string"
              ? node.data.semanticConnectionType
              : undefined;
          const selectedGroup = pickDefaultTopic(
            topicData.groups,
            preferredStyle,
          );
          if (selectedGroup) {
            const parentId =
              topicData.verse.parentId ??
              (topicData.verse.depth === 1 ? bundle?.rootId : undefined);
            const parentEdge = parentId
              ? edges.find((edge) => {
                  const sourceId = Number(edge.source);
                  const targetId = Number(edge.target);
                  return (
                    (sourceId === nodeId && targetId === parentId) ||
                    (sourceId === parentId && targetId === nodeId)
                  );
                })
              : undefined;
            const parentEdgeStyle = parentEdge
              ? ((parentEdge.data as EdgeData | undefined)?.styleType as
                  | ConnectionStyleType
                  | undefined)
              : undefined;
            const edgeOverride =
              parentEdgeStyle === selectedGroup.styleType ? parentEdge : null;

            openConnectionModalForGroup(
              topicData.verse,
              selectedGroup,
              { x: event.clientX, y: event.clientY },
              topicData.groups,
              edgeOverride,
            );
            return;
          }
        }

        setFocusedNodeId((prev) => {
          const newFocusId = prev === node.id ? null : node.id;
          console.log(
            `[Click DEBUG] Focus mode ${newFocusId ? "ENABLED" : "DISABLED"} for node ${node.id}`,
          );
          return newFocusId;
        });
      } catch (error) {
        console.error(`[Click DEBUG] Error handling node click:`, error);
        setFocusedNodeId(null);
      }
    },
    [
      buildConnectionTopics,
      bundle?.rootId,
      edges,
      openConnectionModalForGroup,
      pickDefaultTopic,
    ],
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

        while (queue.length > 0) {
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
          .map((n) => n.displayLabel || formatNodeReference(n))
          .join(" -> ");

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

  const getNodeDimensions = useCallback(
    (verse: ThreadNode, isAnchor: boolean) => {
      const nodeDepth = verse.depth || 0;
      if (isAnchor) return { width: 180, height: 90 };
      if (nodeDepth === 1) return { width: 120, height: 50 };
      if (nodeDepth === 2) return { width: 100, height: 42 };
      return { width: 85, height: 35 };
    },
    [],
  );

  const getVisibleNodes = useCallback(
    (bundle: VisualContextBundle, expandedIds: Set<number>) =>
      bundle.nodes.filter((node) => {
        if (node.isVisible) return true;
        if (expandedIds.has(node.id)) return true;
        if (node.parentId && expandedIds.has(node.parentId)) return true;
        return false;
      }),
    [],
  );

  const buildEdgeTypeLookup = useCallback((bundle: VisualContextBundle) => {
    const edgeTypeLookup = new Map<string, EdgeType>();
    (bundle.edges || []).forEach((edge) => {
      edgeTypeLookup.set(`${edge.from}:${edge.to}`, edge.type);
      edgeTypeLookup.set(`${edge.to}:${edge.from}`, edge.type);
    });
    return edgeTypeLookup;
  }, []);

  const buildInitialExpandedNodes = useCallback(
    (bundle: VisualContextBundle) => {
      const nodesToExpand = new Set<number>();

      if (bundle.rootId) {
        nodesToExpand.add(bundle.rootId);
        bundle.nodes.forEach((node) => {
          if (node.depth !== undefined && node.depth <= 1) {
            nodesToExpand.add(node.id);
          }
        });
      }

      return nodesToExpand;
    },
    [],
  );

  const centerMapView = useCallback((duration: number) => {
    const instance = flowInstanceRef.current;
    if (!instance) return;
    instance.fitView({
      padding: 0.2,
      duration,
      includeHiddenNodes: true,
    });
  }, []);

  const buildVerseNode = useCallback(
    (
      verse: ThreadNode,
      bundle: VisualContextBundle,
      expandedIds: Set<number>,
      edgeTypeLookup: Map<string, EdgeType>,
    ): Node => {
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

      const allChildren = bundle.nodes.filter((n) => n.parentId === verse.id);
      const visibleChildren = allChildren.filter(
        (child) =>
          child.isVisible ||
          (child.parentId && expandedIds.has(child.parentId)),
      );
      const actualCollapsedCount = allChildren.length - visibleChildren.length;

      let semanticConnectionType: string | undefined;
      if (!isAnchor) {
        const inferredParentId =
          verse.parentId ?? (verse.depth === 1 ? bundle.rootId : undefined);
        if (inferredParentId) {
          const edgeType = edgeTypeLookup.get(
            `${inferredParentId}:${verse.id}`,
          );
          if (edgeType) {
            semanticConnectionType =
              TYPE_TO_STYLE_MAP[edgeType as EdgeType] || "PURPLE";
          }
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
          onExpand: () => handleExpandNode(verse.id),
          onShowParallels: (verseId: number) => handleShowParallels(verseId),
          depth: verse.depth,
          semanticConnectionType,
          isDimmed: false,
          branchHighlight: undefined,
          discoveryPulseKey: undefined,
          connectionCount: 0,
        },
        position: { x: 0, y: 0 },
      };
    },
    [handleExpandNode, handleShowParallels, highlightedRefs],
  );

  const applyNodeTransition = useCallback((node: Node): Node => {
    return {
      ...node,
      style: {
        ...(node.style || {}),
        transition: "transform 360ms ease, opacity 360ms ease",
      },
    };
  }, []);

  const buildPlaceholderLayout = useCallback(
    (bundle: VisualContextBundle, expandedIds: Set<number>) => {
      const visibleNodes = getVisibleNodes(bundle, expandedIds);
      const edgeTypeLookup = buildEdgeTypeLookup(bundle);
      const placeholderNodes = visibleNodes
        .map((verse) =>
          buildVerseNode(verse, bundle, expandedIds, edgeTypeLookup),
        )
        .map(applyNodeTransition);

      const nodesByDepth = new Map<number, Node[]>();
      placeholderNodes.forEach((node) => {
        const depth =
          typeof node.data.depth === "number"
            ? node.data.depth
            : node.data.verse.depth || 1;
        const bucket = depth <= 0 ? 0 : Math.min(depth, 4);
        if (!nodesByDepth.has(bucket)) nodesByDepth.set(bucket, []);
        nodesByDepth.get(bucket)!.push(node);
      });

      const anchor = placeholderNodes.find((node) => node.data.isAnchor);
      if (anchor) {
        const dimensions = getNodeDimensions(anchor.data.verse, true);
        anchor.position = {
          x: -dimensions.width / 2,
          y: -dimensions.height / 2,
        };
      }

      nodesByDepth.forEach((nodesAtDepth, depth) => {
        if (depth === 0) return;
        const radius = 180 + (depth - 1) * 140;
        const angleStep = (2 * Math.PI) / nodesAtDepth.length;
        nodesAtDepth.forEach((node, index) => {
          const angle = index * angleStep - Math.PI / 2;
          const dimensions = getNodeDimensions(
            node.data.verse,
            node.data.isAnchor,
          );
          node.position = {
            x: radius * Math.cos(angle) - dimensions.width / 2,
            y: radius * Math.sin(angle) - dimensions.height / 2,
          };
        });
      });

      return { nodes: placeholderNodes, edges: [] };
    },
    [
      applyNodeTransition,
      buildEdgeTypeLookup,
      buildVerseNode,
      getNodeDimensions,
      getVisibleNodes,
    ],
  );

  // Radial layout algorithm with anchor at center
  const getLayoutedElements = (
    bundle: VisualContextBundle,
    expandedIds: Set<number>,
    _onExpand: (nodeId: number) => void,
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

    const visibleNodes = getVisibleNodes(bundle, expandedIds);

    const edgeTypeLookup = buildEdgeTypeLookup(bundle);

    // Create nodes (only visible ones)
    const reactFlowNodes: Node[] = visibleNodes.map((verse) =>
      buildVerseNode(verse, bundle, expandedIds, edgeTypeLookup),
    );

    visibleNodes.forEach((verse) => {
      const nodeId = verse.id.toString();
      const isAnchor = verse.id === bundle.rootId;
      const { width, height } = getNodeDimensions(verse, isAnchor);
      dagreGraph.setNode(nodeId, { width, height });
    });

    // Create edges (only between visible nodes) with 3-color system
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    const layoutEdges: Edge[] = [];
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

        // 🌟 GOLDEN THREAD: Check if this is a primary ray from the anchor
        const isAnchorRay = edge.from === bundle.rootId;

        // 🌟 GOLDEN THREAD: Use semantic color for all edges (anchor rays stay thicker/animated)
        const finalStyleType = styleType || "PURPLE";
        const visualStyleType = finalStyleType;

        const edgeStyle = EDGE_STYLES[visualStyleType];

        const edgeMetadata = edge.metadata || {};
        const isLLMDiscovered = edgeMetadata.source === "llm";
        const isStructural = edgeMetadata.source === "structure";

        // Calculate width based on similarity strength
        // Similarity range: 0-1, Width multiplier: 0.7-1.3
        const similarity = edgeMetadata.similarity || edge.weight || 0.8; // Default to 0.8
        const widthMultiplier = 0.7 + similarity * 0.6; // Maps 0→0.7, 1→1.3

        // 🌟 GOLDEN THREAD: Anchor rays are thicker (aggressive contrast)
        const baseWidth = isAnchorRay ? 2.5 : edgeStyle.width * widthMultiplier;
        const finalWidth = isAnchorRay ? baseWidth : baseWidth;

        const edgePayload: Edge = {
          id: `e${fromId}-${toId}`,
          source: fromId,
          target: toId,
          type: "smoothstep",
          // 🌟 GOLDEN THREAD: Animate anchor rays (outward flow)
          animated: isAnchorRay,
          data: {
            styleType: finalStyleType, // 🌟 Preserve original type for hover reveal
            visualStyleType, // Current visual style
            edgeType,
            isSynthetic: false,
            isLLMDiscovered,
            isStructural,
            explanation: edgeMetadata.explanation,
            confidence: edgeMetadata.confidence,
            isAnchorRay, // 🌟 Flag for hover interaction
            baseWidth: finalWidth, // Store calculated width for hover effects
            weight: edge.weight,
            selectionScore: edgeMetadata.selectionScore,
          },
          style: {
            stroke: `url(#edge-gradient-${visualStyleType})`, // 🌟 Use semantic gradient
            strokeWidth: finalWidth, // 🌟 Thicker for anchor rays
            strokeLinecap: "round",
            opacity: 0, // Start invisible for entrance animation
            // 🌟 GOLDEN THREAD: Stronger glow for anchor rays
            filter: isAnchorRay
              ? `drop-shadow(0 0 3px ${edgeStyle.glowColor}35)` // Stronger glow for anchor rays
              : visualStyleType !== "GREY"
                ? `drop-shadow(0 0 2px ${edgeStyle.glowColor}30)` // 40 = 25% opacity in hex
                : "none",
            transition:
              "opacity 150ms ease-in-out, stroke-width 150ms ease-in-out, filter 150ms ease-in-out",
            cursor: visualStyleType !== "GREY" ? "pointer" : "default",
          },
          // 🌟 GOLDEN THREAD: Use visualStyleType for interaction width
          interactionWidth: isAnchorRay
            ? 25
            : visualStyleType !== "GREY"
              ? 20
              : 10, // Grey secondary edges have smallest interaction area
        };

        layoutEdges.push(edgePayload);
        if (visualStyleType !== "GREY") {
          reactFlowEdges.push(edgePayload);
        }

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

          // Synthetic edges use GREY color to avoid implying lineage
          const edgeStyle = EDGE_STYLES["GREY"];

          const syntheticEdge: Edge = {
            id: `e${fromId}-${toId}-synthetic`,
            source: fromId,
            target: toId,
            type: "smoothstep",
            data: {
              styleType: "GREY",
              edgeType: "NARRATIVE",
              isSynthetic: true,
              isLLMDiscovered: false,
              isStructural: false,
              baseWidth: edgeStyle.width, // Store base width for hover effects
              weight: 0.4,
            },
            style: {
              stroke: `url(#edge-gradient-GREY)`, // Use directional gradient
              strokeWidth: edgeStyle.width,
              strokeLinecap: "round",
              opacity: 0, // Start invisible for entrance animation
              // Subtle glow for synthetic edges
              filter: `drop-shadow(0 0 2px ${edgeStyle.glowColor}30)`, // 40 = 25% opacity
              transition: "all 150ms ease-in-out",
            },
          };

          layoutEdges.push(syntheticEdge);

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
        layoutEdges,
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
  useLayoutEffect(() => {
    if (!bundle) {
      setInitialExpansionDone(false);
      setExpandedNodes(new Set());
      return;
    }

    if (initialExpansionDone) return;

    // Only expand the anchor node - its direct children (depth 1) will become visible
    const nodesToExpand = buildInitialExpandedNodes(bundle);

    if (nodesToExpand.size > 0) {
      console.log(
        `[NarrativeMap] Auto-expanding anchor + depth 0-1 nodes: ${nodesToExpand.size} nodes`,
        Array.from(nodesToExpand).slice(0, 10),
      );
    }

    setExpandedNodes(nodesToExpand);
    setInitialExpansionDone(true);
  }, [bundle, buildInitialExpandedNodes, initialExpansionDone]);

  // Update layout when bundle, highlights, or expanded nodes change
  useLayoutEffect(() => {
    if (!bundle) {
      return;
    }

    const layoutExpandedNodes = initialExpansionDone
      ? expandedNodes
      : buildInitialExpandedNodes(bundle);
    const placeholder = buildPlaceholderLayout(bundle, layoutExpandedNodes);
    setNodes(placeholder.nodes);
    setEdges(placeholder.edges);
    setEdgesAnimated(false);

    let edgeTimer: number | null = null;
    let layoutTimer: number | null = null;
    let layoutFrame: number | null = null;
    const layoutDelay = initialExpansionDone ? 0 : 140;

    if (!autoCenteredRef.current) {
      window.requestAnimationFrame(() => {
        centerMapView(0);
      });
    }

    const runLayout = () => {
      layoutFrame = window.requestAnimationFrame(() => {
        const { nodes: layoutedNodes, edges: layoutedEdges } =
          getLayoutedElements(bundle, layoutExpandedNodes, handleExpandNode);
        const transitionedNodes = layoutedNodes.map(applyNodeTransition);
        setNodes(transitionedNodes);
        setEdges(layoutedEdges);

        // Reset edge animation state and trigger after node entrance
        const maxNodeDepth = Math.max(
          ...layoutedNodes.map((n) => (n.data.verse.depth as number) || 0),
          0,
        );
        const nodeEntranceTime = Math.min(maxNodeDepth * 80 + 400, 1200); // Wait for nodes to enter

        edgeTimer = window.setTimeout(() => {
          setEdgesAnimated(true);
        }, nodeEntranceTime);

        if (!autoCenteredRef.current) {
          window.requestAnimationFrame(() => {
            centerMapView(520);
            autoCenteredRef.current = true;
          });
        }
      });
    };

    if (layoutDelay > 0) {
      layoutTimer = window.setTimeout(runLayout, layoutDelay);
    } else {
      runLayout();
    }

    return () => {
      if (layoutTimer) {
        window.clearTimeout(layoutTimer);
      }
      if (layoutFrame) {
        window.cancelAnimationFrame(layoutFrame);
      }
      if (edgeTimer) {
        window.clearTimeout(edgeTimer);
      }
    };
  }, [
    applyNodeTransition,
    buildInitialExpandedNodes,
    buildPlaceholderLayout,
    bundle,
    centerMapView,
    expandedNodes,
    handleExpandNode,
    highlightedRefs,
    initialExpansionDone,
  ]);

  const selectVersesForDiscovery = useCallback(
    (excludeIds: Set<number>) => {
      if (!bundle) return [];

      const allNodes = bundle.nodes || [];
      const availableNodes = allNodes.filter(
        (node) => !excludeIds.has(node.id),
      );
      if (availableNodes.length === 0) return [];

      if (availableNodes.length <= DISCOVERY_BATCH_SIZE) {
        return availableNodes;
      }

      // Priority: anchor + spine + centrality
      const selected = new Set<number>();

      // 1. Anchor (depth 0)
      const anchor = availableNodes.find((n) => n.depth === 0);
      if (anchor) selected.add(anchor.id);

      // 2. Spine nodes
      const spineNodes = availableNodes.filter((n) => n.isSpine);
      spineNodes.forEach((n) => selected.add(n.id));

      // 3. Fill with highest centrality
      const centrality = new Map<number, number>();
      availableNodes.forEach((n) => {
        const connections = (bundle.edges || []).filter(
          (e) => e.from === n.id || e.to === n.id,
        ).length;
        centrality.set(n.id, connections);
      });

      const remainingSlots = Math.max(DISCOVERY_BATCH_SIZE - selected.size, 0);
      const remaining = availableNodes
        .filter((n) => !selected.has(n.id))
        .sort((a, b) => {
          const aCentrality = centrality.get(a.id) || 0;
          const bCentrality = centrality.get(b.id) || 0;
          return bCentrality - aCentrality;
        })
        .slice(0, remainingSlots);

      remaining.forEach((n) => selected.add(n.id));
      const selection = availableNodes.filter((n) => selected.has(n.id));
      return selection.slice(0, DISCOVERY_BATCH_SIZE);
    },
    [bundle],
  );

  const runDiscovery = useCallback(
    async (coreVerses: ThreadNode[]) => {
      try {
        setDiscovering(true);
        setDiscoveryProgress({
          phase: "selecting",
          progress: 10,
          message: "Selecting key verses...",
        });
        console.log("[LLM Discovery] Starting discovery...");

        setDiscoveryProgress({
          phase: "analyzing",
          progress: 30,
          message: "Analyzing verses...",
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
          message: "Processing insights...",
        });

        const data = await response.json();

        // Check if this is an error response
        if (data.error) {
          console.warn("[LLM Discovery] API error:", data.error, data.message);
          console.warn("[LLM Discovery] Rate limited - try again later");
          setDiscovering(false);
          return;
        }

        setAnalyzedVerseIds((prev) => {
          const next = new Set(prev);
          coreVerses.forEach((verse) => next.add(verse.id));
          return next;
        });

        const { connections, fromCache } = data;
        console.log(
          `[LLM Discovery] Found ${connections.length} connections (${fromCache ? "cached" : "new"})`,
        );

        if (connections.length === 0) {
          console.log("[LLM Discovery] No new connections discovered");
          setDiscoveryHighlights([]);
          setDiscoveryProgress({
            phase: "complete",
            progress: 100,
            message: "Discovery complete",
          });
          setTimeout(() => {
            setDiscovering(false);
          }, 2000);
          return;
        }

        setDiscoveryProgress({
          phase: "connecting",
          progress: 75,
          message: `Mapping ${connections.length} connections...`,
        });

        const verseLabel = (id: number) => {
          const verse = bundle?.nodes.find((node) => node.id === id);
          if (!verse) return "Unknown";
          return verse.displayLabel || formatNodeReference(verse);
        };

        const highlights = (connections as DiscoveredConnection[])
          .slice(0, 6)
          .map((conn) => {
            const label =
              EDGE_STYLES[TYPE_TO_STYLE_MAP[conn.type] || "GREY"].label;
            return {
              title: `${verseLabel(conn.from)} ƒ+' ${verseLabel(conn.to)}`,
              subtitle: `Connection found: ${label}`,
            };
          });

        setDiscoveryHighlights(highlights);
        setDiscoveryHighlightIndex(0);

        // Add discovered edges to the map
        const edgeFinalStyles = new Map<
          string,
          { opacity: number; filter: string }
        >();
        const pulseNodeIds = new Set<number>();
        const newEdges = (connections as DiscoveredConnection[]).map((conn) => {
          const styleType =
            TYPE_TO_STYLE_MAP[conn.type] || TYPE_TO_STYLE_MAP.DEEPER;
          const edgeStyle = EDGE_STYLES[styleType];

          const finalOpacity = 0.6;
          const finalFilter = `drop-shadow(0 0 3px ${edgeStyle.glowColor}35)`;

          const edgeId = `llm-${conn.type}-${conn.from}-${conn.to}`;

          edgeFinalStyles.set(edgeId, {
            opacity: finalOpacity,
            filter: finalFilter,
          });

          pulseNodeIds.add(conn.from);
          pulseNodeIds.add(conn.to);

          return {
            id: edgeId,
            source: conn.from.toString(),
            target: conn.to.toString(),
            type: "smoothstep",
            data: {
              styleType,
              edgeType: conn.type,
              explanation: conn.explanation,
              confidence: conn.confidence,
              isLLMDiscovered: true,
              isStructural: false,
              baseWidth: edgeStyle.width, // Store base width for hover effects
              weight: conn.confidence,
            },
            style: {
              stroke: `url(#edge-gradient-${styleType})`, // Use directional gradient
              strokeWidth: edgeStyle.width,
              strokeLinecap: "round",
              opacity: 0,
              filter: `drop-shadow(0 0 2px ${edgeStyle.glowColor}30)`, // Start subtle
              transition: "opacity 450ms ease, filter 450ms ease",
            },
            animated: false,
          };
        });

        console.log(
          `[LLM Discovery] Adding ${newEdges.length} new edges to map`,
        );

        // Deduplicate edges by ID when adding
        let appliedNewEdgeIds: string[] = [];
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
          appliedNewEdgeIds = uniqueNewEdges.map((edge) => edge.id);
          return [...prev, ...uniqueNewEdges];
        });

        if (appliedNewEdgeIds.length > 0) {
          const pulseKey = Date.now();
          setNodes((nds) =>
            nds.map((node) => {
              const nodeId = Number(node.id);
              if (!pulseNodeIds.has(nodeId)) return node;
              return {
                ...node,
                data: {
                  ...node.data,
                  discoveryPulseKey: pulseKey + nodeId,
                },
              };
            }),
          );

          window.setTimeout(() => {
            setEdges((eds) =>
              eds.map((edge) => {
                if (!appliedNewEdgeIds.includes(edge.id)) return edge;
                const finalStyle = edgeFinalStyles.get(edge.id);
                if (!finalStyle) return edge;
                return {
                  ...edge,
                  style: {
                    ...edge.style,
                    opacity: finalStyle.opacity,
                    filter: finalStyle.filter,
                  },
                };
              }),
            );
          }, 80);
        }

        setDiscoveryProgress({
          phase: "complete",
          progress: 100,
          message: `Added ${connections.length} connections`,
        });

        // Hide progress bar after a brief moment
        setTimeout(() => {
          setDiscovering(false);
        }, 2000);
      } catch (error) {
        console.error("[LLM Discovery] Error:", error);
        // Silent fail - user still gets algorithmic connections
        setDiscoveryHighlights([]);
        setDiscovering(false);
      }
    },
    [bundle],
  );

  const remainingVerseCount = useMemo(() => {
    if (!bundle) return 0;
    let count = 0;
    bundle.nodes.forEach((node) => {
      if (!analyzedVerseIds.has(node.id)) count += 1;
    });
    return count;
  }, [bundle, analyzedVerseIds]);

  const isPericopeBundle = bundle?.lens === "NARRATIVE";

  const startDiscovery = useCallback(
    async (mode: "auto" | "deep") => {
      if (!bundle || discovering || isPericopeBundle) return;
      const coreVerses = selectVersesForDiscovery(analyzedVerseIds);
      if (coreVerses.length < 2) {
        if (mode === "deep") {
          console.log("[LLM Discovery] No additional verses available");
        }
        return;
      }
      await runDiscovery(coreVerses);
    },
    [
      analyzedVerseIds,
      bundle,
      discovering,
      isPericopeBundle,
      runDiscovery,
      selectVersesForDiscovery,
    ],
  );

  // Discover additional LLM connections automatically
  useEffect(() => {
    if (!bundle || discovering || autoDiscoveryRunRef.current) return;
    autoDiscoveryRunRef.current = true;
    void startDiscovery("auto");
  }, [bundle, discovering, startDiscovery]);

  const deepCrawlDisabled =
    isPericopeBundle ||
    !initialExpansionDone ||
    discovering ||
    remainingVerseCount < 2;
  const deepCrawlLabel = discovering ? "Crawling..." : "Deep Seach";
  const deepCrawlTitle = isPericopeBundle
    ? "Deep search is available in verse view"
    : deepCrawlDisabled
      ? "No more verses to analyze"
      : "Analyze more verses for new connections";

  const shouldShowOverlay = !bundle || discovering || !initialExpansionDone;

  useEffect(() => {
    if (!discovering || discoveryHighlights.length === 0) return;

    const timer = window.setInterval(() => {
      setDiscoveryHighlightIndex(
        (prev) => (prev + 1) % discoveryHighlights.length,
      );
    }, 3600);

    return () => window.clearInterval(timer);
  }, [discovering, discoveryHighlights]);

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
        const edgeData = edge.data as EdgeData & { visualStyleType?: string };
        // 🌟 GOLDEN THREAD: Use visualStyleType for proper GREY styling
        const visualStyleType =
          edgeData?.visualStyleType || edgeData?.styleType || "PURPLE";
        const isSynthetic = edgeData?.isSynthetic;
        const finalOpacity =
          visualStyleType === "GREY" ? 0.3 : isSynthetic ? 0.2 : 0.45;

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: finalOpacity,
            transition: "opacity 600ms cubic-bezier(0.4, 0, 0.2, 1)",
            transitionDelay: `${idx * 50}ms`, // Stagger each edge by 50ms
          },
        };
      }),
    );
  }, [edgesAnimated]);

  // Apply highlighting when hoveredBranch changes
  useEffect(() => {
    const activeBranch = selectedBranch ?? hoveredBranch;
    if (!activeBranch) {
      // Reset to neutral state
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            isDimmed: false,
            branchHighlight: undefined,
          },
        })),
      );

      setEdges((eds) =>
        eds.map((edge) => {
          const edgeData = edge.data as EdgeData & { visualStyleType?: string };
          // 🌟 GOLDEN THREAD: Use visualStyleType for proper GREY styling
          const visualStyleType =
            edgeData?.visualStyleType || edgeData?.styleType || "PURPLE";
          const edgeStyle = EDGE_STYLES[visualStyleType];
          const baseWidth = edgeData?.baseWidth || edgeStyle.width;
          const isSynthetic = edgeData?.isSynthetic;
          const defaultOpacity =
            visualStyleType === "GREY" ? 0.3 : isSynthetic ? 0.2 : 0.45;

          // Restore subtle glow for colored edges
          const baseFilter =
            visualStyleType !== "GREY"
              ? `drop-shadow(0 0 2px ${edgeStyle.glowColor}30)`
              : "none";

          return {
            ...edge,
            style: {
              ...edge.style,
              opacity: defaultOpacity,
              filter: baseFilter,
              strokeWidth: baseWidth,
            },
          };
        }),
      );
      return;
    }

    const branchColor = EDGE_STYLES[activeBranch.styleType].color;
    const branchGlow = EDGE_STYLES[activeBranch.styleType].glowColor;
    const isColoredBranch = activeBranch.styleType !== "GREY";

    // Highlight nodes with branch color (only colored branches glow)
    setNodes((nds) =>
      nds.map((node) => {
        const nodeId = Number(node.id);
        const isInBranch = activeBranch.nodeIds.has(nodeId);

        return {
          ...node,
          data: {
            ...node.data,
            isDimmed: !isInBranch,
            branchHighlight:
              isInBranch && isColoredBranch
                ? { color: branchColor, glowColor: branchGlow }
                : undefined,
          },
        };
      }),
    );

    // Highlight edges
    setEdges((eds) =>
      eds.map((edge) => {
        const isInBranch = activeBranch.edgeIds.has(edge.id);
        const edgeData = edge.data as EdgeData & {
          visualStyleType?: string;
          isAnchorRay?: boolean;
        };
        // 🌟 GOLDEN THREAD: Use visualStyleType for proper GREY styling
        const visualStyleType =
          edgeData?.visualStyleType || edgeData?.styleType || "PURPLE";
        const edgeStyle = EDGE_STYLES[visualStyleType];
        const isColoredEdge = visualStyleType !== "GREY"; // Only colored branches get glow

        // Use stored baseWidth if available, otherwise fall back to style width
        const baseWidth = edgeData?.baseWidth || edgeStyle.width;

        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: isInBranch ? 1 : 0.2,
            filter:
              isInBranch && isColoredEdge
                ? `drop-shadow(0 0 5px ${edgeStyle.glowColor})`
                : "none",
            strokeWidth: isInBranch ? baseWidth + 1 : baseWidth,
          },
        };
      }),
    );
  }, [hoveredBranch, selectedBranch]);

  // 🌟 GOLDEN THREAD: Intensify anchor ray glow on hover
  useEffect(() => {
    setEdges((eds) =>
      eds.map((edge) => {
        const edgeData = edge.data as EdgeData & {
          isAnchorRay?: boolean;
          styleType?: string;
          visualStyleType?: string;
        };

        // Only update anchor rays
        if (!edgeData?.isAnchorRay) return edge;

        // Determine if this edge is currently hovered
        const isHovered = hoveredAnchorRay === edge.id;

        const visualStyleType =
          edgeData.visualStyleType || edgeData.styleType || "PURPLE";
        const edgeStyle = EDGE_STYLES[visualStyleType];
        const baseWidth = edgeData?.baseWidth || edgeStyle.width;

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: `url(#edge-gradient-${visualStyleType})`,
            strokeWidth: isHovered ? baseWidth + 1 : baseWidth,
            filter: isHovered
              ? `drop-shadow(0 0 5px ${edgeStyle.glowColor}45)`
              : `drop-shadow(0 0 3px ${edgeStyle.glowColor}30)`,
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
        const edgeData = edge.data as EdgeData & { visualStyleType?: string };
        // 🌟 GOLDEN THREAD: Use visualStyleType for proper GREY styling
        const visualStyleType =
          edgeData?.visualStyleType || edgeData?.styleType || "PURPLE";
        const isSynthetic = edgeData?.isSynthetic;
        const defaultOpacity =
          visualStyleType === "GREY" ? 0.3 : isSynthetic ? 0.2 : 0.45;

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
  const getBranchPreviewCount = useCallback(
    (edge: Edge): number => {
      const edgeData = edge.data as EdgeData & { visualStyleType?: string };
      const styleType =
        edgeData?.styleType || edgeData?.visualStyleType || "GREY";
      if (styleType === "GREY") return 0;

      const baseId = Number(edge.source);
      if (!Number.isFinite(baseId)) return 0;

      const connected = new Set<number>();
      edges.forEach((candidate) => {
        const candidateData = candidate.data as EdgeData & {
          visualStyleType?: string;
        };
        const candidateStyle =
          candidateData?.styleType || candidateData?.visualStyleType || "GREY";
        if (candidateStyle !== styleType) return;

        const sourceId = Number(candidate.source);
        const targetId = Number(candidate.target);
        if (sourceId === baseId && Number.isFinite(targetId)) {
          connected.add(targetId);
        } else if (targetId === baseId && Number.isFinite(sourceId)) {
          connected.add(sourceId);
        }
      });

      const isAnchorBase = bundle?.rootId === baseId;
      return isAnchorBase ? connected.size : connected.size + 1;
    },
    [bundle?.rootId, edges],
  );

  // Handle edge click for colored branches
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const edgeData = edge.data as EdgeData & { visualStyleType?: string };
      // dYOY GOLDEN THREAD: Use visualStyleType to ignore grey secondary edges
      const visualStyleType = edgeData?.visualStyleType || edgeData?.styleType;
      // For connection details popup, use original semantic type
      const styleType = edgeData?.styleType as
        | ConnectionStyleType
        | "GREY"
        | undefined;

      // Only handle colored branches (not GREY)
      if (visualStyleType === "GREY" || !visualStyleType) return;
      if (!bundle || !styleType || styleType === "GREY") return;

      // Get the from and to verse data
      const fromId = parseInt(edge.source);
      const toId = parseInt(edge.target);
      const fromVerse = bundle.nodes.find((n) => n.id === fromId);
      const toVerse = bundle.nodes.find((n) => n.id === toId);

      if (!fromVerse || !toVerse) return;

      // Use viewport coordinates for fixed-position modal rendering.
      const posX = event.clientX;
      const posY = event.clientY;

      const topicData = buildConnectionTopics(fromVerse.id);
      let topicGroups = topicData?.groups ?? [];
      let selectedGroup = topicGroups.find(
        (group) => group.styleType === styleType,
      );

      if (!selectedGroup) {
        selectedGroup = {
          styleType,
          label: EDGE_STYLES[styleType].label,
          color: EDGE_STYLES[styleType].color,
          count: 1,
          verses: [toVerse],
          verseIds: [toVerse.id],
          edgeIds: [edge.id],
        };
        if (topicGroups.length === 0) {
          topicGroups = [selectedGroup];
        } else {
          topicGroups = [selectedGroup, ...topicGroups];
        }
      }

      openConnectionModalForGroup(
        fromVerse,
        selectedGroup,
        { x: posX, y: posY },
        topicGroups,
        edge,
      );
    },
    [buildConnectionTopics, bundle, openConnectionModalForGroup],
  );

  const handleEdgeMouseEnter = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const isFastMoving = checkMouseVelocity(event.clientX, event.clientY);
      const previewCount = getBranchPreviewCount(edge);

      // 🌟 GOLDEN THREAD: Boost anchor ray glow on hover
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
          count: previewCount,
        });
        return;
      }

      // Show basic tooltip after 300ms
      tooltipTimerRef.current = window.setTimeout(() => {
        setTooltipState({
          visible: true,
          expanded: false,
          position: { x: event.clientX, y: event.clientY },
          count: previewCount,
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
    [branchClusters, checkMouseVelocity, getBranchPreviewCount],
  );

  const handleEdgeMouseLeave = useCallback(() => {
    // 🌟 GOLDEN THREAD: Clear hovered anchor ray when mouse leaves
    setHoveredAnchorRay(null);

    setHoveredBranch(null);
    setTooltipState({
      visible: false,
      expanded: false,
      position: { x: 0, y: 0 },
      count: 0,
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

  const tooltipCount =
    hoveredBranch && tooltipState.count > 0
      ? tooltipState.count
      : hoveredBranch
        ? hoveredBranch.nodeIds.size
        : 0;

  return (
    <div className="h-full w-full relative">
      <DiscoveryOverlay
        phase={bundle ? discoveryProgress.phase : "selecting"}
        progress={bundle ? discoveryProgress.progress : 0}
        message={bundle ? discoveryProgress.message : "Preparing map..."}
        visible={shouldShowOverlay}
        highlightTitle={
          discovering
            ? discoveryHighlights[discoveryHighlightIndex]?.title
            : undefined
        }
        highlightSubtitle={
          discovering
            ? discoveryHighlights[discoveryHighlightIndex]?.subtitle
            : undefined
        }
        showHint={bundle ? true : false}
      />

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
                {tooltipCount} {tooltipCount === 1 ? "verse" : "verses"} in
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
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
        className="h-full w-full"
        style={{ width: "100%", height: "100%" }}
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
            {/* Genealogy gradient */}
            <linearGradient
              id="edge-gradient-GENEALOGY"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#34D399" stopOpacity="1" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="1" />
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
                        <span
                          className="text-white text-xs"
                          title={style.description}
                        >
                          {style.label}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <div className="text-gray-400 text-xs font-semibold uppercase mb-2">
                  Explore
                </div>
                <button
                  type="button"
                  onClick={() => startDiscovery("deep")}
                  disabled={deepCrawlDisabled}
                  title={deepCrawlTitle}
                  className="w-full px-3 py-2 rounded-md text-xs font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-white/10 hover:bg-white/15 text-white"
                >
                  {deepCrawlLabel}
                </button>
                <div className="mt-1 text-[10px] text-gray-500">
                  Expand the map with more connections.
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
          onClose={() => {
            setClickedConnection(null);
            setSelectedBranch(null);
          }}
          onTrace={onTrace || (() => {})}
          onGoDeeper={onGoDeeper || (() => {})}
          explanation={clickedConnection.explanation}
          isLLMDiscovered={clickedConnection.isLLMDiscovered}
          connectedVerseIds={clickedConnection.connectedVerseIds}
          connectedVersesPreview={clickedConnection.connectedVersesPreview}
          connectionTopics={clickedConnection.connectionTopics}
          onSelectTopic={handleSelectConnectionTopic}
          visualBundle={bundle || undefined}
        />
      )}

      {/* Parallel Passages Modal */}
      {parallelPassagesModal && (
        <ParallelPassagesModal
          primaryVerse={parallelPassagesModal.verse}
          position={parallelPassagesModal.position}
          onClose={() => setParallelPassagesModal(null)}
          onNavigateToPassage={(passage) => {
            console.log("[Parallel Passages] Navigate to:", passage.reference);
            // TODO: Integrate with Bible reader navigation when available
            // For now, just close the modal
            setParallelPassagesModal(null);
          }}
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
