import type { EdgeType } from "../../types/goldenThread";

// Connection family metadata (used for modal labels, topic colors, and connection grouping)
export const EDGE_STYLES = {
  GREY: {
    color: "#475569",
    glowColor: "#94A3B8",
    label: "Neutral",
    description: "Layout-only helper edges",
  },
  CROSS_REFERENCE: {
    color: "#22C55E",
    glowColor: "#86EFAC",
    label: "Cross-Reference",
    description: "Canonical cross-references and parallels",
  },
  LEXICON: {
    color: "#F59E0B",
    glowColor: "#FCD34D",
    label: "Lexicon",
    description: "Shared roots or key terms",
  },
  ECHO: {
    color: "#6366F1",
    glowColor: "#A5B4FC",
    label: "Echo",
    description: "Semantic or thematic echoes",
  },
  FULFILLMENT: {
    color: "#06B6D4",
    glowColor: "#67E8F9",
    label: "Fulfillment",
    description: "Prophetic or covenant fulfillment",
  },
  PATTERN: {
    color: "#A78BFA",
    glowColor: "#C4B5FD",
    label: "Pattern",
    description: "Typology, contrast, progression, motif, lineage",
  },
} as const;

export const NEUTRAL_EDGE_OPACITY = 0.18;
export const EDGE_THIN_WIDTH = 1.1;
export const EDGE_OPACITY_DEFAULT = 0.3;
export const EDGE_OPACITY_ANCHOR = 0.6;
export const EDGE_OPACITY_DIM = 0.02;
export const EDGE_OPACITY_SYNTHETIC = 0.12;
export const EDGE_RENDER_TYPE = "simplebezier";
export const ELECTRIC_EDGE_COLOR = "rgba(248, 250, 252, 0.95)";
export const ANCHOR_EDGE_COLOR = "#C5B358";
export const ANCHOR_EDGE_GLOW = "#E0C57A";
export const DEFAULT_EDGE_GLOW = "rgba(248, 250, 252, 0.35)";
export const EDGE_CLICK_ENABLED = false;
export const EDGE_HOVER_ENABLED = false;
export const DISCOVERY_BATCH_SIZE = 12;

export type ConnectionStyleType = Exclude<keyof typeof EDGE_STYLES, "GREY">;

export const getEdgeStroke = (
  styleType: keyof typeof EDGE_STYLES,
  isSynthetic?: boolean,
  isAnchorRay?: boolean,
) => {
  if (styleType === "GREY" || isSynthetic) {
    return "url(#edge-gradient-GREY)";
  }
  return isAnchorRay ? ANCHOR_EDGE_COLOR : ELECTRIC_EDGE_COLOR;
};

export const getDefaultEdgeOpacity = ({
  styleType,
  isSynthetic,
  isAnchorRay,
}: {
  styleType: keyof typeof EDGE_STYLES;
  isSynthetic?: boolean;
  isAnchorRay?: boolean;
}) => {
  if (styleType === "GREY") return NEUTRAL_EDGE_OPACITY;
  if (isSynthetic) return EDGE_OPACITY_SYNTHETIC;
  return isAnchorRay ? EDGE_OPACITY_ANCHOR : EDGE_OPACITY_DEFAULT;
};

export const getEdgeAnimationConfig = (
  isLLMDiscovered: boolean,
  _flowDuration: string,
) =>
  isLLMDiscovered
    ? {
        animationName: "llm-shimmer",
        animationDuration: "3s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
      }
    : {
        animationName: "edge-flow",
        animationDuration: "4s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
      };

export const edgePulseDelay = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return `${hash % 1600}ms`;
};

export const edgeFlowDelay = (id: string, depth?: number) => {
  if (typeof depth === "number") {
    return `${depth * 220}ms`;
  }
  return edgePulseDelay(id);
};

export const resolveConnectionFamily = (
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
  if (edgeType === "ALLUSION") return "ECHO";

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

export const resolveConnectionChip = (
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

  if (edgeType === "ALLUSION") return "Allusion";
  if (edgeType === "PROPHECY") return "Prophetic";
  if (edgeType === "FULFILLMENT") return "Fulfillment";
  if (edgeType === "TYPOLOGY") return "Typology";
  if (edgeType === "CONTRAST") return "Contrast";
  if (edgeType === "PROGRESSION") return "Progression";
  if (edgeType === "PATTERN") return "Motif";
  if (edgeType === "GENEALOGY") return "Lineage";

  return null;
};

// --- Types ---

export interface BranchCluster {
  edgeIds: Set<string>;
  nodeIds: Set<number>;
  styleType: keyof typeof EDGE_STYLES;
  edgeType: EdgeType;
  pathPreview: string;
}

export interface EdgeData {
  styleType?: keyof typeof EDGE_STYLES;
  edgeType?: EdgeType;
  source?: string;
  thread?: string;
  explanation?: string;
  confidence?: number;
  isLLMDiscovered?: boolean;
  isStructural?: boolean;
  isSynthetic?: boolean;
  isAnchorRay?: boolean;
  baseWidth?: number;
  weight?: number;
  selectionScore?: number;
}

export interface DiscoveredConnection {
  from: number;
  to: number;
  type: string;
  explanation: string;
  confidence: number;
}

export interface ConnectionTopicGroup {
  styleType: ConnectionStyleType;
  label: string;
  displayLabel?: string;
  labelSource?: "canonical" | "llm";
  color: string;
  count: number;
  chips?: string[];
  verses: import("../../types/goldenThread").ThreadNode[];
  verseIds: number[];
  edgeIds: string[];
}
