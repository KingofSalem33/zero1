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
  VisualEdge,
  ThreadNode,
} from "../../types/goldenThread";
import type { GoDeeperPayload } from "../../types/chat";

// Refined Color System with Intentional Color Psychology
// Signal-first connection families (5-color system) + neutral
const EDGE_STYLES = {
  GREY: {
    color: "#475569", // Neutral for synthetic edges only
    glowColor: "#94A3B8",
    width: 1.2,
    label: "Neutral",
    description: "Layout-only helper edges",
  },
  CROSS_REFERENCE: {
    color: "#22C55E", // Green
    glowColor: "#86EFAC",
    width: 1.4,
    label: "Cross-Reference",
    description: "Canonical cross-references and parallels",
  },
  LEXICON: {
    color: "#F59E0B", // Amber
    glowColor: "#FCD34D",
    width: 2,
    label: "Lexicon",
    description: "Shared roots or key terms",
  },
  ECHO: {
    color: "#6366F1", // Indigo
    glowColor: "#A5B4FC",
    width: 2,
    label: "Echo",
    description: "Semantic or thematic echoes",
  },
  FULFILLMENT: {
    color: "#06B6D4", // Cyan
    glowColor: "#67E8F9",
    width: 2,
    label: "Fulfillment",
    description: "Prophetic or covenant fulfillment",
  },
  PATTERN: {
    color: "#A78BFA", // Violet
    glowColor: "#C4B5FD",
    width: 2,
    label: "Pattern",
    description: "Typology, contrast, progression, motif, lineage",
  },
} as const;

const NEUTRAL_EDGE_OPACITY = 0.18;
const EDGE_DASH_ARRAY = "6 10";
const EDGE_THIN_WIDTH = 1.1;
const EDGE_OPACITY_DEFAULT = 0.3;
const EDGE_OPACITY_ANCHOR = 0.6;
const EDGE_OPACITY_DIM = 0.15;
const EDGE_OPACITY_SYNTHETIC = 0.12;
const EDGE_RENDER_TYPE = "simplebezier";
const ELECTRIC_EDGE_COLOR = "rgba(248, 250, 252, 0.95)";
const ANCHOR_EDGE_COLOR = "#C5B358"; // Vegas gold
const ANCHOR_EDGE_GLOW = "#E0C57A";
const DEFAULT_EDGE_GLOW = "rgba(248, 250, 252, 0.35)";
const EDGE_CLICK_ENABLED = false;
const EDGE_HOVER_ENABLED = false;
const getEdgeStroke = (
  visualStyleType: keyof typeof EDGE_STYLES,
  isSynthetic?: boolean,
  isAnchorRay?: boolean,
) => {
  if (visualStyleType === "GREY" || isSynthetic) {
    return "url(#edge-gradient-GREY)";
  }
  return isAnchorRay ? ANCHOR_EDGE_COLOR : ELECTRIC_EDGE_COLOR;
};

const getDefaultEdgeOpacity = ({
  visualStyleType,
  isSynthetic,
  isAnchorRay,
}: {
  visualStyleType: keyof typeof EDGE_STYLES;
  isSynthetic?: boolean;
  isAnchorRay?: boolean;
}) => {
  if (visualStyleType === "GREY") return NEUTRAL_EDGE_OPACITY;
  if (isSynthetic) return EDGE_OPACITY_SYNTHETIC;
  return isAnchorRay ? EDGE_OPACITY_ANCHOR : EDGE_OPACITY_DEFAULT;
};

const getEdgeAnimationConfig = (
  isLLMDiscovered: boolean,
  flowDuration: string,
) =>
  isLLMDiscovered
    ? {
        animationName: "edge-flow, llm-shimmer",
        animationDuration: `${flowDuration}, 8s`,
        animationTimingFunction: "linear, ease-in-out",
        animationIterationCount: "infinite",
      }
    : {
        animationName: "none",
        animationDuration: "0s",
      };
const edgePulseDelay = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `${hash % 1600}ms`;
};

const edgeFlowDelay = (id: string, depth?: number) => {
  if (typeof depth === "number") {
    return `${depth * 220}ms`;
  }
  return edgePulseDelay(id);
};

type ConnectionStyleType = Exclude<keyof typeof EDGE_STYLES, "GREY">;

const resolveConnectionFamily = (
  edgeType: EdgeType,
  metadata?: Record<string, unknown>,
): ConnectionStyleType => {
  const source = metadata?.source;

  if (edgeType === "DEEPER") return "CROSS_REFERENCE";
  if (edgeType === "NARRATIVE") return "CROSS_REFERENCE";

  if (edgeType === "ROOTS") {
    if (source === "semantic_thread") return "ECHO";
    return "LEXICON";
  }

  if (edgeType === "ECHOES") return "ECHO";

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
};

const resolveConnectionChip = (
  edgeType: EdgeType,
  metadata?: Record<string, unknown>,
): string | null => {
  const source = metadata?.source;
  const thread = metadata?.thread;

  if (edgeType === "DEEPER") return "Parallel";
  if (edgeType === "NARRATIVE") return "Context";

  if (edgeType === "ROOTS") {
    if (source === "semantic_thread") return "Phrase";
    if (source === "canonical") return "Shared Root";
    return "Key Term";
  }

  if (edgeType === "ECHOES") {
    if (thread === "theological") return "Parallel Teaching";
    return "Theme";
  }

  if (edgeType === "PROPHECY") return "Prophetic";
  if (edgeType === "FULFILLMENT") return "Fulfillment";
  if (edgeType === "TYPOLOGY") return "Typology";
  if (edgeType === "CONTRAST") return "Contrast";
  if (edgeType === "PROGRESSION") return "Progression";
  if (edgeType === "PATTERN") return "Motif";
  if (edgeType === "GENEALOGY") return "Lineage";

  return null;
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
  source?: string;
  thread?: string;
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
  displayLabel?: string;
  labelSource?: "canonical" | "llm";
  color: string;
  count: number;
  chips?: string[];
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
  userId?: string;
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

const makeReferenceKey = (node: ThreadNode) => {
  const book = (node.book_name || node.book_abbrev || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return `${book} ${node.chapter}:${node.verse}`;
};

const collapseDuplicateBundle = (
  bundle: VisualContextBundle | null,
): VisualContextBundle | null => {
  if (!bundle || !bundle.nodes || bundle.nodes.length < 2) return bundle;

  const nodes = bundle.nodes;
  const edges = bundle.edges || [];
  const degreeMap = new Map<number, number>();
  edges.forEach((edge) => {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) ?? 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) ?? 0) + 1);
  });

  const groups = new Map<string, number[]>();
  nodes.forEach((node) => {
    const key = node.referenceKey || makeReferenceKey(node);
    const list = groups.get(key) || [];
    list.push(node.id);
    groups.set(key, list);
  });

  const collapseMap = new Map<number, number>();
  groups.forEach((ids) => {
    if (ids.length <= 1) return;

    let canonicalId =
      bundle.rootId && ids.includes(bundle.rootId) ? bundle.rootId : ids[0];
    canonicalId = ids.reduce((best, current) => {
      if (best === canonicalId && canonicalId === bundle.rootId) return best;
      const bestNode = nodes.find((n) => n.id === best);
      const currentNode = nodes.find((n) => n.id === current);
      if (!bestNode || !currentNode) return best;

      if (currentNode.depth < bestNode.depth) return current;
      if (currentNode.depth > bestNode.depth) return best;

      const bestDegree = degreeMap.get(best) ?? 0;
      const currentDegree = degreeMap.get(current) ?? 0;
      if (currentDegree > bestDegree) return current;
      if (currentDegree < bestDegree) return best;

      const bestCentrality = bestNode.centrality ?? 0;
      const currentCentrality = currentNode.centrality ?? 0;
      if (currentCentrality > bestCentrality) return current;

      return best;
    }, canonicalId);

    ids.forEach((id) => {
      if (id !== canonicalId) collapseMap.set(id, canonicalId);
    });
  });

  if (collapseMap.size === 0) return bundle;

  const filteredNodes = nodes
    .filter((node) => !collapseMap.has(node.id))
    .map((node) => ({
      ...node,
      referenceKey: node.referenceKey || makeReferenceKey(node),
      parentId: collapseMap.has(node.parentId ?? -1)
        ? collapseMap.get(node.parentId ?? -1)
        : node.parentId,
    }));

  const edgeKeys = new Set<string>();
  const remappedEdges = edges
    .map((edge) => ({
      ...edge,
      from: collapseMap.get(edge.from) ?? edge.from,
      to: collapseMap.get(edge.to) ?? edge.to,
    }))
    .filter((edge) => edge.from !== edge.to)
    .filter((edge) => {
      const key =
        edge.from < edge.to
          ? `${edge.from}|${edge.to}`
          : `${edge.to}|${edge.from}`;
      if (edgeKeys.has(key)) return false;
      edgeKeys.add(key);
      return true;
    });

  return {
    ...bundle,
    nodes: filteredNodes,
    edges: remappedEdges,
  };
};

const NarrativeMapComponent: React.FC<NarrativeMapProps> = ({
  bundle: rawBundle,
  highlightedRefs,
  onTrace,
  onGoDeeper,
  userId = "anonymous",
}) => {
  const bundle = useMemo(() => collapseDuplicateBundle(rawBundle), [rawBundle]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const llmEdgesRef = useRef<Edge[]>([]);
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
  const [mapSaving, setMapSaving] = useState(false);
  const [mapSaved, setMapSaved] = useState(false);
  const [mapSaveError, setMapSaveError] = useState<string | null>(null);
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
  const autoCenteredRef = useRef(false);

  useEffect(() => {
    setMapSaved(false);
    setMapSaveError(null);
  }, [bundle?.rootId, bundle?.nodes?.length, bundle?.edges?.length]);

  const resolveAnchorRef = useCallback(() => {
    if (!bundle) return undefined;
    const rootId = bundle.rootId;
    const anchor = bundle.nodes.find((node) => node.id === rootId);
    if (!anchor) return undefined;
    return `${anchor.book_name} ${anchor.chapter}:${anchor.verse}`;
  }, [bundle]);

  const handleSaveMap = useCallback(async () => {
    if (!bundle || mapSaving || mapSaved) return;
    try {
      setMapSaving(true);
      setMapSaveError(null);

      const bundleResponse = await fetch(`${API_URL}/api/library/bundles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          bundle,
        }),
      });

      if (!bundleResponse.ok) {
        throw new Error("Failed to save map snapshot");
      }

      const bundleData = await bundleResponse.json();
      const bundleId = bundleData.bundleId as string | undefined;
      if (!bundleId) {
        throw new Error("Missing bundle ID");
      }

      const title = resolveAnchorRef();
      const mapResponse = await fetch(`${API_URL}/api/library/maps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          bundleId,
          title,
        }),
      });

      if (!mapResponse.ok) {
        throw new Error("Failed to save map");
      }

      setMapSaved(true);
    } catch (error) {
      console.error("[NarrativeMap] Save map failed:", error);
      setMapSaveError("Could not save map");
    } finally {
      setMapSaving(false);
    }
  }, [bundle, mapSaving, mapSaved, resolveAnchorRef, userId]);
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
    isAnchorConnection?: boolean;
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

  // Focus Mode state
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const lastAppliedFocusRef = useRef<string | null>(null);

  // Pre-computed branch clusters (computed once per bundle)
  const [branchClusters, setBranchClusters] = useState<
    Map<string, BranchCluster>
  >(new Map());
  const topicTitlesRequestRef = useRef(0);

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
    llmEdgesRef.current = [];
  }, [bundle]);

  const connectionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    edges.forEach((edge) => {
      const edgeData = edge.data as EdgeData & { visualStyleType?: string };
      const styleType =
        edgeData?.styleType || edgeData?.visualStyleType || "GREY";
      if (styleType === "GREY") return;
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

  const buildTopicTitlePayload = useCallback(
    (baseVerse: ThreadNode, topics: ConnectionTopicGroup[]) => {
      return topics.map((topic) => {
        const seen = new Set<number>();
        const verses = [baseVerse, ...topic.verses]
          .filter((verse) => {
            if (!verse || typeof verse.id !== "number") return false;
            if (seen.has(verse.id)) return false;
            seen.add(verse.id);
            return true;
          })
          .slice(0, 4)
          .map((verse) => ({
            reference: formatNodeReference(verse),
            text: verse.text,
          }));
        return {
          type: topic.styleType,
          verses,
        };
      });
    },
    [formatNodeReference],
  );

  const fetchTopicTitles = useCallback(
    async (baseVerse: ThreadNode, topics: ConnectionTopicGroup[]) => {
      if (!topics || topics.length === 0) return topics;
      const payload = {
        topics: buildTopicTitlePayload(baseVerse, topics),
      };

      try {
        const response = await fetch(
          `${API_URL}/api/semantic-connection/topic-titles`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

        if (!response.ok) {
          throw new Error("Failed to fetch topic titles");
        }

        const data = await response.json();
        const titles =
          data && typeof data.titles === "object" ? data.titles : {};

        return topics.map((topic) => {
          const resolved =
            typeof titles?.[topic.styleType] === "string"
              ? titles[topic.styleType].trim()
              : "";
          return {
            ...topic,
            label: resolved || topic.label,
            displayLabel: resolved || topic.displayLabel || topic.label,
            labelSource: resolved ? "llm" : topic.labelSource,
          };
        });
      } catch (error) {
        console.warn("[NarrativeMap] Topic title fetch failed:", error);
        return topics;
      }
    },
    [buildTopicTitlePayload],
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
        { edgeIds: Set<string>; verseIds: Set<number>; chips: Set<string> }
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
            chips: new Set<string>(),
          });
        }
        const entry = groups.get(connectionStyle);
        entry?.edgeIds.add(edge.id);
        entry?.verseIds.add(otherId);
        if (edgeData?.edgeType) {
          const chip = resolveConnectionChip(edgeData.edgeType, edgeData);
          if (chip) entry?.chips.add(chip);
        }
      });

      const buildGroup = (
        styleType: ConnectionStyleType,
        entry: {
          edgeIds: Set<string>;
          verseIds: Set<number>;
          chips: Set<string>;
        },
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
          displayLabel: EDGE_STYLES[styleType].label,
          labelSource: "canonical",
          color: EDGE_STYLES[styleType].color,
          count: verses.length,
          chips: Array.from(entry.chips),
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
    async (
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
      const isAnchorConnection = edgeData?.isAnchorRay || false;

      const highlightVerseIds = Array.from(
        new Set([baseId, ...group.verseIds]),
      );
      const connectedVerseIds =
        bundle.rootId === baseId ? group.verseIds : highlightVerseIds;

      const connectedVersesPreview = buildPreviewVerses(connectedVerseIds);

      const requestId = (topicTitlesRequestRef.current += 1);
      const labelsReady = topicGroups.every(
        (topic) => topic.labelSource === "llm",
      );
      if (!labelsReady) {
        setClickedConnection(null);
        setSelectedBranch(null);
      }
      const resolvedTopics = labelsReady
        ? topicGroups
        : await fetchTopicTitles(baseVerse, topicGroups);

      if (requestId !== topicTitlesRequestRef.current) return;

      const resolvedGroup =
        resolvedTopics.find((topic) => topic.styleType === group.styleType) ??
        group;

      if (
        resolvedGroup.edgeIds.length > 0 ||
        resolvedGroup.verseIds.length > 0
      ) {
        setSelectedBranch({
          edgeIds: new Set(resolvedGroup.edgeIds),
          nodeIds: new Set(highlightVerseIds),
          styleType: resolvedGroup.styleType,
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
        connectionType: resolvedGroup.styleType,
        similarity: isLLMDiscovered ? llmConfidence || 0 : similarity,
        position,
        explanation: llmExplanation,
        confidence: llmConfidence,
        isLLMDiscovered,
        isAnchorConnection,
        connectedVerseIds,
        connectedVersesPreview,
        connectionTopics: resolvedTopics,
        baseVerseId: baseId,
      });
    },
    [
      buildPreviewVerses,
      bundle,
      fetchTopicTitles,
      formatNodeReference,
      selectPrimaryEdge,
    ],
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
    const edgeLookup = new Map<string, VisualEdge>();
    (bundle.edges || []).forEach((edge) => {
      edgeLookup.set(`${edge.from}:${edge.to}`, edge);
      edgeLookup.set(`${edge.to}:${edge.from}`, edge);
    });
    return edgeLookup;
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
      edgeTypeLookup: Map<string, VisualEdge>,
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
          const edge = edgeTypeLookup.get(`${inferredParentId}:${verse.id}`);
          if (edge) {
            semanticConnectionType = resolveConnectionFamily(
              edge.type,
              edge.metadata,
            );
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
          enableSemanticGlow: true,
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
    const depthById = new Map<number, number>();
    visibleNodes.forEach((node) => {
      depthById.set(node.id, node.depth);
    });

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

    // Create edges (only between visible nodes) with 5-family system
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

        // Determine edge style based on type + provenance
        const edgeType = edge.type;
        const finalStyleType = resolveConnectionFamily(
          edgeType as EdgeType,
          edge.metadata,
        );

        // 🌟 GOLDEN THREAD: Check if this is a primary ray from the anchor
        const isAnchorRay =
          edge.from === bundle.rootId || edge.to === bundle.rootId;

        // 🌟 GOLDEN THREAD: Use family color for all edges (anchor rays stay thicker/animated)
        const visualStyleType = finalStyleType;

        const edgeMetadata = edge.metadata || {};
        const isLLMDiscovered = edgeMetadata.source === "llm";
        const isStructural = edgeMetadata.source === "structure";

        const baseWidth = EDGE_THIN_WIDTH;
        const finalWidth = baseWidth;

        const edgePayload: Edge = {
          id: `e${fromId}-${toId}`,
          source: fromId,
          target: toId,
          type: EDGE_RENDER_TYPE,
          animated: false,
          selectable: false,
          data: {
            styleType: finalStyleType, // 🌟 Preserve original type for hover reveal
            visualStyleType, // Current visual style
            edgeType,
            source: edgeMetadata.source,
            thread: edgeMetadata.thread,
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
            stroke: getEdgeStroke(visualStyleType, false, isAnchorRay),
            strokeWidth: finalWidth, // 🌟 Thicker for anchor rays
            strokeLinecap: "round",
            strokeDasharray: isLLMDiscovered ? EDGE_DASH_ARRAY : "0",
            strokeDashoffset: 0,
            opacity: 0, // Start invisible for entrance animation
            ...getEdgeAnimationConfig(isLLMDiscovered, "5.6s"),
            animationDelay: edgeFlowDelay(
              `e${fromId}-${toId}`,
              depthById.get(edge.from),
            ),
            filter: isAnchorRay
              ? `drop-shadow(0 0 6px ${ANCHOR_EDGE_GLOW}70)`
              : `drop-shadow(0 0 4px ${DEFAULT_EDGE_GLOW})`,
            transition:
              "opacity 150ms ease-in-out, stroke-width 150ms ease-in-out, filter 150ms ease-in-out",
            cursor:
              EDGE_CLICK_ENABLED && finalStyleType !== "GREY"
                ? "pointer"
                : "default",
          },
          // 🌟 GOLDEN THREAD: Use visualStyleType for interaction width
          interactionWidth: isAnchorRay
            ? 25
            : finalStyleType !== "GREY"
              ? 20
              : 10, // Grey secondary edges have smallest interaction area
        };

        layoutEdges.push(edgePayload);
        if (finalStyleType !== "GREY") {
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
            type: EDGE_RENDER_TYPE,
            selectable: false,
            data: {
              styleType: "GREY",
              edgeType: "NARRATIVE",
              isSynthetic: true,
              isLLMDiscovered: false,
              isStructural: false,
              baseWidth: EDGE_THIN_WIDTH, // Store calculated width for hover effects
              weight: 0.4,
            },
            style: {
              stroke: `url(#edge-gradient-GREY)`, // Use directional gradient
              strokeWidth: EDGE_THIN_WIDTH,
              strokeLinecap: "round",
              strokeDasharray: "0",
              strokeDashoffset: 0,
              opacity: 0, // Start invisible for entrance animation
              ...getEdgeAnimationConfig(false, "5.6s"),
              animationDelay: edgeFlowDelay(
                `e${fromId}-${toId}-synthetic`,
                depthById.get(node.parentId),
              ),
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

    // === FEATURE FLAG: Force-Directed Layout ===
    // Set to true to use new neural network layout, false for legacy radial layout
    const USE_FORCE_LAYOUT = true;

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

        const visibleIds = new Set(layoutedNodes.map((node) => node.id));
        const extraEdges = llmEdgesRef.current.filter(
          (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
        );
        const mergedEdges =
          extraEdges.length === 0
            ? layoutedEdges
            : [
                ...layoutedEdges,
                ...extraEdges.filter(
                  (edge) => !layoutedEdges.some((e) => e.id === edge.id),
                ),
              ];
        setEdges(mergedEdges);

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
            const styleType = resolveConnectionFamily(conn.type as EdgeType, {
              source: "llm",
            });
            const label = EDGE_STYLES[styleType].label;
            return {
              title: `${verseLabel(conn.from)} -> ${verseLabel(conn.to)}`,
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
          const styleType = resolveConnectionFamily(conn.type as EdgeType, {
            source: "llm",
          });
          const visualStyleType = styleType;
          const isAnchorRay =
            conn.from === bundle?.rootId || conn.to === bundle?.rootId;

          const finalOpacity = getDefaultEdgeOpacity({
            visualStyleType,
            isSynthetic: false,
            isAnchorRay,
          });
          const finalFilter = isAnchorRay
            ? `drop-shadow(0 0 6px ${ANCHOR_EDGE_GLOW}70)`
            : `drop-shadow(0 0 4px ${DEFAULT_EDGE_GLOW})`;

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
            type: EDGE_RENDER_TYPE,
            selectable: false,
            data: {
              styleType,
              visualStyleType,
              edgeType: conn.type,
              source: "llm",
              explanation: conn.explanation,
              confidence: conn.confidence,
              isLLMDiscovered: true,
              isStructural: false,
              isAnchorRay,
              baseWidth: EDGE_THIN_WIDTH, // Store base width for hover effects
              weight: conn.confidence,
            },
            style: {
              stroke: getEdgeStroke(visualStyleType, false, isAnchorRay),
              strokeWidth: EDGE_THIN_WIDTH,
              strokeLinecap: "round",
              strokeDasharray: EDGE_DASH_ARRAY,
              strokeDashoffset: 0,
              opacity: 0,
              ...getEdgeAnimationConfig(true, "5.6s"),
              animationDelay: edgeFlowDelay(edgeId),
              filter: isAnchorRay
                ? `drop-shadow(0 0 4px ${ANCHOR_EDGE_GLOW}55)`
                : `drop-shadow(0 0 3px ${DEFAULT_EDGE_GLOW})`, // Start subtle
              transition: "opacity 450ms ease, filter 450ms ease",
            },
            animated: false,
          };
        });

        // Deduplicate edges by ID when adding
        let appliedNewEdgeIds: string[] = [];
        setEdges((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const uniqueNewEdges = newEdges.filter((e) => !existingIds.has(e.id));

          if (uniqueNewEdges.length === 0) {
            console.log("[LLM Discovery] All edges already exist, skipping");
            return prev;
          }

          const existingLlmIds = new Set(llmEdgesRef.current.map((e) => e.id));
          uniqueNewEdges.forEach((edge) => {
            if (!existingLlmIds.has(edge.id)) {
              llmEdgesRef.current.push(edge);
              existingLlmIds.add(edge.id);
            }
          });

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
  const deepCrawlLabel = discovering ? "Crawling..." : "Deep Search";
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
          edgeData?.visualStyleType || edgeData?.styleType || "CROSS_REFERENCE";
        const isSynthetic = edgeData?.isSynthetic;
        const isAnchorRay = edgeData?.isAnchorRay;
        const finalOpacity = getDefaultEdgeOpacity({
          visualStyleType,
          isSynthetic,
          isAnchorRay,
        });

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
            edgeData?.styleType ||
            edgeData?.visualStyleType ||
            "CROSS_REFERENCE";
          const baseWidth = edgeData?.baseWidth || EDGE_THIN_WIDTH;
          const isSynthetic = edgeData?.isSynthetic;
          const isLLMDiscovered = edgeData?.isLLMDiscovered || false;
          const isAnchorRay = edgeData?.isAnchorRay;
          const defaultOpacity = getDefaultEdgeOpacity({
            visualStyleType,
            isSynthetic,
            isAnchorRay,
          });

          // Restore subtle glow for colored edges
          const baseFilter = isAnchorRay
            ? `drop-shadow(0 0 5px ${ANCHOR_EDGE_GLOW}70)`
            : visualStyleType === "GREY"
              ? `drop-shadow(0 0 4px ${EDGE_STYLES.GREY.glowColor}55)`
              : `drop-shadow(0 0 2px ${DEFAULT_EDGE_GLOW})`;

          return {
            ...edge,
            data: {
              ...(edge.data as EdgeData),
              visualStyleType,
            },
            style: {
              ...edge.style,
              stroke: getEdgeStroke(visualStyleType, isSynthetic, isAnchorRay),
              opacity: defaultOpacity,
              filter: baseFilter,
              strokeWidth: baseWidth,
              ...getEdgeAnimationConfig(isLLMDiscovered, "5.6s"),
            },
          };
        }),
      );
      return;
    }

    const branchColor = "#E5E7EB";
    const branchGlow = "rgba(248, 250, 252, 0.45)";

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
            branchHighlight: isInBranch
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
        const visualStyleType =
          edgeData?.visualStyleType || edgeData?.styleType || "CROSS_REFERENCE";
        const isLLMDiscovered = edgeData?.isLLMDiscovered || false;
        const isAnchorRay = edgeData?.isAnchorRay;

        // Use stored baseWidth if available, otherwise fall back to semantic width
        const baseWidth = edgeData?.baseWidth || EDGE_THIN_WIDTH;

        return {
          ...edge,
          data: {
            ...(edge.data as EdgeData),
            visualStyleType,
          },
          style: {
            ...edge.style,
            opacity: isInBranch ? 1 : EDGE_OPACITY_DIM,
            stroke: getEdgeStroke(
              visualStyleType,
              edgeData?.isSynthetic,
              isAnchorRay,
            ),
            filter: isInBranch
              ? isAnchorRay
                ? `drop-shadow(0 0 6px ${ANCHOR_EDGE_GLOW}75)`
                : `drop-shadow(0 0 4px ${DEFAULT_EDGE_GLOW})`
              : visualStyleType === "GREY"
                ? `drop-shadow(0 0 2px ${EDGE_STYLES.GREY.glowColor}30)`
                : `drop-shadow(0 0 2px ${DEFAULT_EDGE_GLOW})`,
            strokeWidth: baseWidth,
            ...getEdgeAnimationConfig(
              isLLMDiscovered,
              isInBranch ? "3.4s" : "5.6s",
            ),
            animationDelay: isInBranch ? "0ms" : edge.style?.animationDelay,
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
          edgeData.visualStyleType || edgeData.styleType || "CROSS_REFERENCE";
        const baseWidth = edgeData?.baseWidth || EDGE_THIN_WIDTH;

        return {
          ...edge,
          style: {
            ...edge.style,
            stroke: getEdgeStroke(
              visualStyleType,
              edgeData?.isSynthetic,
              edgeData?.isAnchorRay,
            ),
            strokeWidth: baseWidth,
            filter: isHovered
              ? `drop-shadow(0 0 4px ${ANCHOR_EDGE_GLOW}50)`
              : `drop-shadow(0 0 2px ${ANCHOR_EDGE_GLOW}35)`,
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

      // Dim non-focused nodes to 20% opacity, add GOLD glow to anchor connections
      setNodes((nds) =>
        nds.map((node) => {
          const isConnected = connectedNodeIds.has(node.id);

          return {
            ...node,
            style: {
              ...node.style,
              opacity: isConnected ? 1 : 0.2,
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
          edgeData?.visualStyleType || edgeData?.styleType || "CROSS_REFERENCE";
        const isSynthetic = edgeData?.isSynthetic;
        const defaultOpacity =
          visualStyleType === "GREY"
            ? NEUTRAL_EDGE_OPACITY
            : isSynthetic
              ? 0.2
              : 0.45;

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

  // Handle edge click for colored branches
  const handleEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      if (!EDGE_CLICK_ENABLED) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const edgeData = edge.data as EdgeData & { visualStyleType?: string };
      // For connection details popup, use original semantic type
      const styleType = edgeData?.styleType as
        | ConnectionStyleType
        | "GREY"
        | undefined;

      // Only handle colored branches (not GREY)
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
          displayLabel: EDGE_STYLES[styleType].label,
          labelSource: "canonical",
          color: EDGE_STYLES[styleType].color,
          count: 1,
          chips: [],
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
    (_event: React.MouseEvent, edge: Edge) => {
      if (!EDGE_HOVER_ENABLED) return;
      // GOLDEN THREAD: Boost anchor ray glow on hover
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
    },
    [branchClusters],
  );

  const handleEdgeMouseLeave = useCallback(() => {
    if (!EDGE_HOVER_ENABLED) return;
    // GOLDEN THREAD: Clear hovered anchor ray when mouse leaves
    setHoveredAnchorRay(null);
    setHoveredBranch(null);
  }, []);

  return (
    <div className="h-full w-full relative">
      <style>{`
        @keyframes edge-flow {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -32;
          }
        }

        @keyframes llm-shimmer {
          0%,
          100% {
            stroke-opacity: 0.65;
          }
          50% {
            stroke-opacity: 1;
          }
        }
      `}</style>
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
      {bundle && (
        <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2">
          <button
            onClick={handleSaveMap}
            disabled={mapSaving || mapSaved}
            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 bg-white/10 hover:bg-white/20 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mapSaved ? "Map Saved" : mapSaving ? "Saving..." : "Save Map"}
          </button>
          {mapSaveError && (
            <span className="text-[10px] text-red-400">{mapSaveError}</span>
          )}
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
            {/* Neutral gradient */}
            <linearGradient
              id="edge-gradient-GREY"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#64748B" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#475569" stopOpacity="0.6" />
            </linearGradient>
            {/* Cross-Reference */}
            <linearGradient
              id="edge-gradient-CROSS_REFERENCE"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#86EFAC" stopOpacity="1" />
              <stop offset="100%" stopColor="#22C55E" stopOpacity="1" />
            </linearGradient>
            {/* Lexicon */}
            <linearGradient
              id="edge-gradient-LEXICON"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#FCD34D" stopOpacity="1" />
              <stop offset="100%" stopColor="#F59E0B" stopOpacity="1" />
            </linearGradient>
            {/* Echo */}
            <linearGradient
              id="edge-gradient-ECHO"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#A5B4FC" stopOpacity="1" />
              <stop offset="100%" stopColor="#6366F1" stopOpacity="1" />
            </linearGradient>
            {/* Fulfillment */}
            <linearGradient
              id="edge-gradient-FULFILLMENT"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#67E8F9" stopOpacity="1" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="1" />
            </linearGradient>
            {/* Pattern */}
            <linearGradient
              id="edge-gradient-PATTERN"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="#C4B5FD" stopOpacity="1" />
              <stop offset="100%" stopColor="#A78BFA" stopOpacity="1" />
            </linearGradient>
          </defs>
        </svg>
        <Background variant="lines" color="rgba(0,0,0,0)" gap={16} />
        {/* Controls removed */}
      </ReactFlow>

      {/* Legend + Deep Search */}
      <div className="absolute bottom-4 right-4 z-40">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl px-3 py-3 w-[220px]">
          <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-2">
            Legend
          </div>
          <div className="space-y-2 text-[11px] text-white/80">
            <div className="flex items-center gap-2">
              <span className="inline-block w-6 h-[2px] rounded-full bg-white/80" />
              <span>Graph connection</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-6 h-[2px] rounded-full"
                style={{ backgroundColor: "#C5B358" }}
              />
              <span>Anchor connection</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-6 h-[2px] rounded-full"
                style={{
                  background:
                    "repeating-linear-gradient(90deg, rgba(248,250,252,0.9) 0 6px, transparent 6px 12px)",
                }}
              />
              <span>LLM connection</span>
            </div>
          </div>
          <div className="mt-3 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => startDiscovery("deep")}
              disabled={deepCrawlDisabled}
              title={deepCrawlTitle}
              className="w-full px-3 py-2 rounded-full text-[11px] font-semibold tracking-wide transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-white/10 hover:bg-white/15 text-white"
            >
              {deepCrawlLabel}
            </button>
          </div>
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
          onGoDeeper={onGoDeeper || (() => {})}
          explanation={clickedConnection.explanation}
          isLLMDiscovered={clickedConnection.isLLMDiscovered}
          isAnchorConnection={clickedConnection.isAnchorConnection}
          connectedVerseIds={clickedConnection.connectedVerseIds}
          connectedVersesPreview={clickedConnection.connectedVersesPreview}
          connectionTopics={clickedConnection.connectionTopics}
          onSelectTopic={handleSelectConnectionTopic}
          visualBundle={bundle || undefined}
          userId={userId}
          maxVisibleVerses={6}
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
