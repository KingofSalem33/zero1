import {
  Animated,
  Easing,
  FlatList,
  Keyboard,
  type LayoutChangeEvent,
  type GestureResponderEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path as SvgPath,
  Pattern,
  Rect,
  Stop,
} from "react-native-svg";
import {
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  buildLibraryMapSession,
  resolveBibleBookName,
  type BibleBookName,
} from "@zero1/shared";
import {
  collapseDuplicateBundle,
  deriveNarrativeMapGraph,
  getNarrativeMapNodeDimensions,
  type NarrativeMapConnectionFamily,
  type NarrativeMapGraphEdge,
  type NarrativeMapGraphNode,
} from "@zero1/shared/graph/narrativeMapGraph";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/native/ActionButton";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { BottomSheetSurface } from "../components/native/BottomSheetSurface";
import { ChipButton } from "../components/native/ChipButton";
import { IconButton } from "../components/native/IconButton";
import { MapInspectorSurface } from "../components/native/MapInspectorSurface";
import { ChatThinkingState } from "../components/native/loading/ChatThinkingState";
import { LoadingDotsNative } from "../components/native/loading/LoadingDotsNative";
import { PressableScale } from "../components/native/PressableScale";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { useLayoutMode } from "../hooks/useLayoutMode";
import {
  discoverConnections,
  fetchChainOfThought,
  fetchNextBranches,
  fetchSemanticConnectionSynopsis,
  fetchSemanticConnectionTopicTitles,
  fetchTraceBundle,
  fetchVerseText,
  type NextBranchOption,
} from "../lib/api";
import { getBibleBook } from "../lib/bibleBookCache";
import { MOBILE_ENV } from "../lib/env";
import {
  normalizeMobilePendingPrompt,
  type MobileMapConnection,
  type MobileGoDeeperPayload,
  type MobileMapSession,
  type MobilePendingPrompt,
  type MobilePromptMode,
} from "../types/chat";
import {
  type VisualContextBundle,
  type VisualEdge,
  type VisualNode,
  isVisualContextBundle,
} from "../types/visualization";
import { styles, T } from "../theme/mobileStyles";
import { ensureMinLoaderDuration } from "../utils/ensureMinLoaderDuration";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  rawContent?: string;
  citations?: string[];
  mapBundle?: VisualContextBundle;
  suggestTrace?: boolean;
  connectionCount?: number;
  chainData?: ChainData;
  nextBranches?: NextBranchOption[];
}

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

type MapNodeLayout = NarrativeMapGraphNode;
type MapConnectionFamily = NarrativeMapConnectionFamily;
type MapRenderableEdge = NarrativeMapGraphEdge;

interface MapEdgeSelection {
  edge: MapRenderableEdge;
  from: MapNodeLayout;
  to: MapNodeLayout;
  baseNode?: MapNodeLayout | null;
  connectedVerseIds?: number[];
  topicGroups?: MapConnectionTopicGroup[];
  styleType?: MapConnectionFamily;
}

interface MapEdgeAnalysis {
  title: string;
  synopsis: string;
  verses: Array<{
    id: number;
    reference: string;
    text: string;
  }>;
}

interface MapConnectionTopicGroup {
  styleType: MapConnectionFamily;
  label: string;
  displayLabel?: string;
  labelSource?: "canonical" | "llm";
  color: string;
  count: number;
  chips: string[];
  verseIds: number[];
  edgeIds: string[];
}

interface MapVersePreview {
  id: number;
  reference: string;
  text: string;
  isBase: boolean;
}

type MapParallelPassage = NonNullable<VisualNode["parallelPassages"]>[number];

interface ParsedBibleStudyResult {
  content: string;
  citations: string[];
  suggestTrace?: boolean;
  connectionCount?: number;
  mapBundle?: VisualContextBundle;
  chainData?: ChainData;
  errorMessage?: string;
  searchingVerses?: string[];
  activeTools?: string[];
  completedTools?: string[];
  erroredTools?: string[];
}

interface ChainStep {
  fromReference: string;
  toReference: string;
  connectionType: string;
  explanation: string;
}

interface ChainData {
  theme: string;
  steps: ChainStep[];
}

interface ChainLink {
  from: string;
  to: string;
  concept: string;
  fromIsReference: boolean;
  toIsReference: boolean;
}

interface RandomPericopeTopic {
  id: number;
  title: string;
  rangeRef: string;
  displayText: string;
  promptText: string;
  kind: "random" | "ot" | "nt";
}

const MIN_VERSE_PREVIEW_LOADING_MS = 300;

const MAP_CANVAS_SIZE = 1680;
const MAP_CENTER = MAP_CANVAS_SIZE / 2;
const MAP_ONBOARDING_STORAGE_KEY = "mobile-map-onboarding-complete";
const MAP_VIEWPORT_STORAGE_KEY = "mobile-map-viewport";
const REFERENCE_PARTS_REGEX =
  /((?:\[)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\])?)/g;
const REFERENCE_MATCH_REGEX =
  /^(?:\[)?((?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?)(?:\])?$/;
const REFERENCE_REGEX =
  /((?:\[\s*)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\s*\])?)/g;
const EDGE_TYPE_TO_STYLE: Record<string, string> = {
  DEEPER: "GREY",
  ROOTS: "GOLD",
  ECHOES: "PURPLE",
  PROPHECY: "CYAN",
  GENEALOGY: "GENEALOGY",
  NARRATIVE: "GREY",
  TYPOLOGY: "TYPOLOGY",
  FULFILLMENT: "FULFILLMENT",
  CONTRAST: "CONTRAST",
  PROGRESSION: "PROGRESSION",
  PATTERN: "PATTERN",
};
const CHAT_QUICK_PROMPTS_FALLBACK = [
  {
    key: "random",
    label: "Surprise Me",
    prompt:
      "Surprise me with a rich Bible study prompt and start with one passage.",
  },
  {
    key: "ot",
    label: "Old Testament",
    prompt:
      "Give me an Old Testament passage to study with context and key themes.",
  },
  {
    key: "nt",
    label: "New Testament",
    prompt:
      "Give me a New Testament passage to study with context and key themes.",
  },
] as const;
const STREAM_CHARS_PER_FRAME = 4;
const MAP_MIN_SCALE = 0.2;
const MAP_MAX_SCALE = 2.8;
const MAP_VIEWPORT_PADDING = 60;
const MAP_PAN_MARGIN = 200;
const MAP_RING_BASE_RADIUS = 360;
const MAP_RING_STEP = 240;

type QuickPromptEntry = {
  key: "random" | "ot" | "nt";
  label: string;
  displayText: string;
  promptText: string;
  title: string;
};

type AssistantBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string };

type MapViewportSize = {
  width: number;
  height: number;
};

type ActiveInspector =
  | { kind: "none" }
  | {
      kind: "node";
      node: MapNodeLayout;
      title: string;
      subtitle: string | null;
    }
  | {
      kind: "edge";
      edge: MapEdgeSelection;
      title: string | null;
      subtitle: string | null;
    }
  | {
      kind: "parallels";
      sourceNode: MapNodeLayout;
      title: string;
      subtitle: string | null;
    };

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/~~(.*?)~~/g, "$1");
}

function containsScriptureReference(text: string): boolean {
  const pattern =
    /(?:\[)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\])?/;
  return pattern.test(text);
}

function parseScriptureReference(reference: string) {
  const cleaned = reference.replace(/^\[/, "").replace(/\]$/, "").trim();
  const parsed = cleaned.match(/^(.+?)\s+(\d+):(\d+)(?:-\d+)?$/);
  if (!parsed) return null;
  const rawBook = parsed[1].trim();
  const chapter = Number(parsed[2]);
  const verse = Number(parsed[3]);
  const book = resolveBibleBookName(rawBook);
  if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
    return null;
  }
  return {
    label: cleaned,
    book,
    chapter,
    verse,
    normalizedReference: `${book} ${chapter}:${verse}`,
  };
}

function parseApiStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\((\d{3})\)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) ? parsed : null;
}

function getVersePreviewErrorMessage(error: unknown): string {
  const status = parseApiStatus(error);
  if (status === 429) {
    return "Too many requests right now. Try again in a few seconds.";
  }
  return "Could not load verse text.";
}

function isChainData(value: unknown): value is ChainData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ChainData>;
  if (!Array.isArray(candidate.steps)) return false;
  return candidate.steps.every((step) => {
    if (!step || typeof step !== "object") return false;
    const entry = step as Partial<ChainStep>;
    return (
      typeof entry.fromReference === "string" &&
      typeof entry.toReference === "string" &&
      typeof entry.connectionType === "string" &&
      typeof entry.explanation === "string"
    );
  });
}

async function getLocalVerseTextForReference(parsed: {
  book: BibleBookName;
  chapter: number;
  verse: number;
}): Promise<string | null> {
  try {
    const bookData = await getBibleBook(parsed.book);
    const chapter = bookData.chapters.find(
      (entry) => entry.chapter === parsed.chapter,
    );
    if (!chapter) return null;
    const verse = chapter.verses.find((entry) => entry.verse === parsed.verse);
    if (!verse || typeof verse.text !== "string") return null;
    const trimmed = verse.text.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

function parseAssistantBlocks(content: string): AssistantBlock[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const lines = normalized.split("\n");
  const blocks: AssistantBlock[] = [];
  let paragraphBuffer = "";

  function flushParagraph() {
    const text = stripMarkdownInline(paragraphBuffer.trim());
    if (text) {
      blocks.push({ kind: "paragraph", text });
    }
    paragraphBuffer = "";
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const headingMatch = line.match(/^#{1,3}\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const heading = stripMarkdownInline(headingMatch[1].trim());
      if (heading) {
        blocks.push({ kind: "heading", text: heading });
      }
      continue;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      const bullet = stripMarkdownInline(bulletMatch[1].trim());
      if (bullet) {
        blocks.push({ kind: "bullet", text: bullet });
      }
      continue;
    }

    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (numberedMatch) {
      flushParagraph();
      const numbered = stripMarkdownInline(numberedMatch[1].trim());
      if (numbered) {
        blocks.push({ kind: "bullet", text: numbered });
      }
      continue;
    }

    paragraphBuffer = paragraphBuffer ? `${paragraphBuffer} ${line}` : line;
  }

  flushParagraph();
  return blocks;
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function measureTouchDistance(
  touches: GestureResponderEvent["nativeEvent"]["touches"],
) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  const dx = second.pageX - first.pageX;
  const dy = second.pageY - first.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function measureTouchMidpoint(
  touches: GestureResponderEvent["nativeEvent"]["touches"],
) {
  if (touches.length === 0) {
    return { x: 0, y: 0 };
  }
  if (touches.length === 1) {
    return {
      x: touches[0].pageX,
      y: touches[0].pageY,
    };
  }
  const [first, second] = touches;
  return {
    x: (first.pageX + second.pageX) / 2,
    y: (first.pageY + second.pageY) / 2,
  };
}

function clampMapScale(scale: number) {
  return clampValue(scale, MAP_MIN_SCALE, MAP_MAX_SCALE);
}

function getGraphBounds(nodes: MapNodeLayout[]) {
  if (nodes.length === 0) {
    return {
      left: MAP_CENTER - 80,
      right: MAP_CENTER + 80,
      top: MAP_CENTER - 80,
      bottom: MAP_CENTER + 80,
      width: 160,
      height: 160,
      centerX: MAP_CENTER,
      centerY: MAP_CENTER,
    };
  }

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  nodes.forEach((node) => {
    const frame = getMapNodeFrame(node);
    left = Math.min(left, node.x - frame.width / 2);
    right = Math.max(right, node.x + frame.width / 2);
    top = Math.min(top, node.y - frame.height / 2);
    bottom = Math.max(bottom, node.y + frame.height / 2);
  });

  left -= MAP_VIEWPORT_PADDING;
  right += MAP_VIEWPORT_PADDING;
  top -= MAP_VIEWPORT_PADDING;
  bottom += MAP_VIEWPORT_PADDING;

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

function getPanRangeForAxis({
  viewportSize,
  boundsStart,
  boundsEnd,
  canvasCenter,
  scale,
  margin,
}: {
  viewportSize: number;
  boundsStart: number;
  boundsEnd: number;
  canvasCenter: number;
  scale: number;
  margin: number;
}) {
  const projectedStart = canvasCenter + scale * (boundsStart - canvasCenter);
  const projectedEnd = canvasCenter + scale * (boundsEnd - canvasCenter);

  // Always allow panning with generous breathing room beyond the graph.
  // The user should feel like they're in an open, infinite-ish canvas.
  return {
    min: viewportSize - margin - projectedEnd,
    max: margin - projectedStart,
  };
}

function clampPanToGraphBounds({
  pan,
  scale,
  viewport,
  bounds,
}: {
  pan: { x: number; y: number };
  scale: number;
  viewport: MapViewportSize;
  bounds: ReturnType<typeof getGraphBounds>;
}) {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return pan;
  }

  const xRange = getPanRangeForAxis({
    viewportSize: viewport.width,
    boundsStart: bounds.left,
    boundsEnd: bounds.right,
    canvasCenter: MAP_CENTER,
    scale,
    margin: MAP_PAN_MARGIN,
  });
  const yRange = getPanRangeForAxis({
    viewportSize: viewport.height,
    boundsStart: bounds.top,
    boundsEnd: bounds.bottom,
    canvasCenter: MAP_CENTER,
    scale,
    margin: MAP_PAN_MARGIN,
  });

  return {
    x: clampValue(pan.x, xRange.min, xRange.max),
    y: clampValue(pan.y, yRange.min, yRange.max),
  };
}

function buildFittedViewport({
  viewport,
  bounds,
}: {
  viewport: MapViewportSize;
  bounds: ReturnType<typeof getGraphBounds>;
}) {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { scale: 1, pan: { x: 0, y: 0 } };
  }

  const availableWidth = Math.max(1, viewport.width - MAP_VIEWPORT_PADDING * 2);
  const availableHeight = Math.max(
    1,
    viewport.height - MAP_VIEWPORT_PADDING * 2,
  );
  const scale = clampMapScale(
    Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
  );
  const pan = clampPanToGraphBounds({
    pan: {
      x:
        viewport.width / 2 -
        (MAP_CENTER + scale * (bounds.centerX - MAP_CENTER)),
      y:
        viewport.height / 2 -
        (MAP_CENTER + scale * (bounds.centerY - MAP_CENTER)),
    },
    scale,
    viewport,
    bounds,
  });

  return { scale, pan };
}

function getPanForCenteredNode({
  node,
  scale,
  viewport,
  bounds,
}: {
  node: MapNodeLayout;
  scale: number;
  viewport: MapViewportSize;
  bounds: ReturnType<typeof getGraphBounds>;
}) {
  return clampPanToGraphBounds({
    pan: {
      x: viewport.width / 2 - (MAP_CENTER + scale * (node.x - MAP_CENTER)),
      y: viewport.height / 2 - (MAP_CENTER + scale * (node.y - MAP_CENTER)),
    },
    scale,
    viewport,
    bounds,
  });
}

function getPanForScaledFocalPoint({
  currentPan,
  currentScale,
  nextScale,
  focalPoint,
}: {
  currentPan: { x: number; y: number };
  currentScale: number;
  nextScale: number;
  focalPoint: { x: number; y: number };
}) {
  const safeCurrentScale = Math.max(currentScale, 0.0001);
  return {
    x:
      focalPoint.x -
      MAP_CENTER -
      (nextScale * (focalPoint.x - currentPan.x - MAP_CENTER)) /
        safeCurrentScale,
    y:
      focalPoint.y -
      MAP_CENTER -
      (nextScale * (focalPoint.y - currentPan.y - MAP_CENTER)) /
        safeCurrentScale,
  };
}

function preferRicherBundle(
  current: VisualContextBundle | null | undefined,
  incoming: VisualContextBundle,
): VisualContextBundle {
  if (!current || current.rootId !== incoming.rootId) {
    return incoming;
  }

  const currentScore = current.nodes.length + current.edges.length;
  const incomingScore = incoming.nodes.length + incoming.edges.length;
  return incomingScore >= currentScore ? incoming : current;
}

function parseSsePayload(raw: string): ParsedBibleStudyResult {
  const lines = raw.split(/\r?\n/);
  let currentEvent = "";
  let content = "";
  let citations: string[] = [];
  let suggestTrace = false;
  let connectionCount: number | undefined;
  let mapBundle: VisualContextBundle | undefined;
  let chainData: ChainData | undefined;
  let errorMessage: string | undefined;
  const searchingVerses: string[] = [];
  const activeTools: string[] = [];
  const completedTools: string[] = [];
  const erroredTools: string[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      currentEvent = "";
      continue;
    }
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
      continue;
    }
    if (!line.startsWith("data:")) {
      continue;
    }

    const json = line.slice(5).trim();
    if (!json) continue;

    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      if (currentEvent === "content") {
        content += typeof parsed.delta === "string" ? parsed.delta : "";
      }
      if (currentEvent === "done") {
        if (Array.isArray(parsed.citations)) {
          citations = parsed.citations.filter(
            (entry): entry is string => typeof entry === "string",
          );
        }
        suggestTrace = Boolean(parsed.suggestTrace);
        connectionCount =
          typeof parsed.connectionCount === "number"
            ? parsed.connectionCount
            : undefined;
      }
      if (currentEvent === "verse_search" && typeof parsed.verse === "string") {
        searchingVerses.push(parsed.verse);
      }
      if (currentEvent === "tool_call" && typeof parsed.tool === "string") {
        activeTools.push(parsed.tool);
      }
      if (currentEvent === "tool_result" && typeof parsed.tool === "string") {
        completedTools.push(parsed.tool);
      }
      if (currentEvent === "tool_error" && typeof parsed.tool === "string") {
        erroredTools.push(parsed.tool);
      }
      if (currentEvent === "map_data" && isVisualContextBundle(parsed)) {
        mapBundle = parsed;
      }
      if (currentEvent === "chain_data" && isChainData(parsed)) {
        chainData = parsed;
      }
      if (currentEvent === "error" && typeof parsed.message === "string") {
        errorMessage = parsed.message;
      }
    } catch {
      // Ignore malformed SSE line and continue parsing.
    }
  }

  return {
    content,
    citations,
    suggestTrace,
    connectionCount,
    mapBundle,
    chainData,
    errorMessage,
    searchingVerses,
    activeTools,
    completedTools,
    erroredTools,
  };
}

function appendUnique(items: string[], value: string): string[] {
  if (!value.trim()) return items;
  return items.includes(value) ? items : [...items, value];
}

function normalizeReference(value: string): string {
  return value
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toSentenceCaseLabel(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  return `${cleaned.slice(0, 1).toUpperCase()}${cleaned.slice(1)}`;
}

function compactBookLabel(book: string): string {
  const words = book.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return book;
  return words
    .map((word, index) => {
      if (index === 0 && /^\d+$/.test(word)) return word;
      return word.slice(0, 3);
    })
    .join(" ");
}

function compactReferenceLabel(reference: string): string {
  const parsed = parseScriptureReference(reference);
  if (!parsed) return reference;
  return `${compactBookLabel(parsed.book)} ${parsed.chapter}:${parsed.verse}`;
}

function getMapEdgeAppearance(edge: MapRenderableEdge) {
  // Synthetic / structural edges — subtle gradient
  if (edge.isSynthetic || edge.styleType === "GREY") {
    return {
      stroke: "url(#mobileMapSyntheticEdge)",
      glow: "rgba(148,163,184,0.16)",
      opacity: 0.18,
      width: 1.1,
    };
  }
  // Anchor rays — gold accent (matches web ANCHOR_EDGE_COLOR)
  if (edge.isAnchorRay) {
    return {
      stroke: "#C5B358",
      glow: "rgba(224,197,122,0.32)",
      opacity: 0.6,
      width: 1.4,
    };
  }
  // Semantic edges — white stroke, opacity varies by family (matches web)
  const familyOpacity: Record<string, number> = {
    CROSS_REFERENCE: 0.3,
    LEXICON: 0.3,
    ECHO: 0.3,
    FULFILLMENT: 0.3,
    PATTERN: 0.3,
  };
  return {
    stroke: "rgba(248,250,252,0.95)",
    glow: "rgba(248,250,252,0.22)",
    opacity: familyOpacity[edge.styleType] ?? 0.3,
    width: 1.1,
  };
}

function dedupeReferencesInOrder(candidates: string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  candidates.forEach((candidate) => {
    const parsed = parseScriptureReference(candidate);
    if (!parsed) return;
    const normalized = normalizeReference(parsed.normalizedReference);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    output.push(parsed.normalizedReference);
  });
  return output;
}

function edgeTypeToConceptLabel(edgeType: string): string {
  switch (edgeType) {
    case "ROOTS":
      return "Root context";
    case "ECHOES":
      return "Echoed theme";
    case "PROPHECY":
      return "Prophetic movement";
    case "FULFILLMENT":
      return "Promise -> fulfillment";
    case "TYPOLOGY":
      return "Type -> fulfillment";
    case "CONTRAST":
      return "Theological contrast";
    case "PROGRESSION":
      return "Doctrinal progression";
    case "PATTERN":
      return "Canonical pattern";
    case "GENEALOGY":
      return "Covenant lineage";
    case "NARRATIVE":
      return "Narrative continuation";
    case "ALLUSION":
      return "Scripture allusion";
    default:
      return "Linked idea";
  }
}

function normalizeConceptPhrase(line: string): string {
  const withoutRefs = line.replace(REFERENCE_REGEX, " ");
  const cleaned = stripMarkdownInline(withoutRefs)
    .replace(/^concept\s*:\s*/i, "")
    .replace(/^[*\u2022\d.)\s:-]+/, "")
    .replace(/^this\s+(step|passage)\s+/i, "")
    .replace(/^shows?\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0]?.trim() || cleaned;
  if (!firstSentence) return "";

  const words = firstSentence.split(/\s+/).filter(Boolean);
  const compact = words.slice(0, 7).join(" ").trim();
  return compact;
}

function extractConceptCandidates(reasoning: string): string[] {
  const rawLines = reasoning
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const concepts = rawLines
    .map((line) => normalizeConceptPhrase(line))
    .filter((phrase) => phrase.split(" ").length >= 3);

  return concepts.length > 0 ? concepts : ["Linked idea"];
}
function buildChainLinksFromReasoning({
  reasoning,
  message,
}: {
  reasoning: string;
  message: ChatMessage | null;
}): ChainLink[] {
  const messageText = (message?.rawContent ?? message?.content ?? "").trim();
  const references = dedupeReferencesInOrder([
    ...extractReferences(reasoning),
    ...extractReferences(messageText),
    ...(message?.citations || []).flatMap((entry) => extractReferences(entry)),
  ]);
  const concepts = extractConceptCandidates(reasoning);
  const conceptAt = (index: number): string =>
    concepts[index] || concepts[0] || "Scripture clarifies Scripture";

  if (references.length >= 2) {
    return references.slice(0, -1).map((from, index) => ({
      from,
      to: references[index + 1],
      concept: conceptAt(index),
      fromIsReference: true,
      toIsReference: true,
    }));
  }

  if (references.length === 1) {
    return [
      {
        from: references[0],
        to: "Related text",
        concept: conceptAt(0),
        fromIsReference: true,
        toIsReference: false,
      },
    ];
  }

  return [
    {
      from: "Current text",
      to: "Related text",
      concept: conceptAt(0),
      fromIsReference: false,
      toIsReference: false,
    },
  ];
}

function buildChainLinksFromChainData(chainData?: ChainData): ChainLink[] {
  if (
    !chainData ||
    !Array.isArray(chainData.steps) ||
    chainData.steps.length === 0
  ) {
    return [];
  }

  return chainData.steps
    .filter(
      (step) =>
        typeof step.fromReference === "string" &&
        typeof step.toReference === "string",
    )
    .map((step) => {
      const concept = normalizeConceptPhrase(step.explanation || "");
      return {
        from: step.fromReference,
        to: step.toReference,
        concept: concept || edgeTypeToConceptLabel(step.connectionType),
        fromIsReference: Boolean(parseScriptureReference(step.fromReference)),
        toIsReference: Boolean(parseScriptureReference(step.toReference)),
      };
    });
}

function describeEdgeConcept(edgeType: string): string {
  return edgeTypeToConceptLabel(edgeType);
}

function buildChainLinksFromBundle(bundle: VisualContextBundle): ChainLink[] {
  if (!bundle.nodes.length || !bundle.edges.length) return [];

  const nodeById = new Map(bundle.nodes.map((node) => [node.id, node]));
  const withDirection = bundle.edges
    .map((edge) => {
      const fromNode = nodeById.get(edge.from);
      const toNode = nodeById.get(edge.to);
      if (!fromNode || !toNode) return null;

      let fromId = edge.from;
      let toId = edge.to;
      if (fromNode.depth > toNode.depth) {
        fromId = edge.to;
        toId = edge.from;
      } else if (
        fromNode.depth === toNode.depth &&
        edge.to === bundle.rootId &&
        edge.from !== bundle.rootId
      ) {
        fromId = edge.to;
        toId = edge.from;
      }

      return {
        ...edge,
        fromId,
        toId,
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));

  const outgoing = new Map<number, typeof withDirection>();
  withDirection.forEach((edge) => {
    const list = outgoing.get(edge.fromId) ?? [];
    list.push(edge);
    outgoing.set(edge.fromId, list);
  });

  const edgeKey = (edge: { fromId: number; toId: number; type: string }) =>
    `${edge.type}:${Math.min(edge.fromId, edge.toId)}-${Math.max(edge.fromId, edge.toId)}`;

  const visitedEdges = new Set<string>();
  const visitedNodes = new Set<number>();
  const links: ChainLink[] = [];
  const maxLinks = Math.min(18, withDirection.length);
  let currentId = bundle.rootId;

  const pickNext = (): (typeof withDirection)[number] | null => {
    const outgoingCandidates = (outgoing.get(currentId) ?? [])
      .filter((edge) => !visitedEdges.has(edgeKey(edge)))
      .sort((a, b) => {
        const aVisited = visitedNodes.has(a.toId) ? 1 : 0;
        const bVisited = visitedNodes.has(b.toId) ? 1 : 0;
        if (aVisited !== bVisited) return aVisited - bVisited;
        if (b.weight !== a.weight) return b.weight - a.weight;
        const aDepth = nodeById.get(a.toId)?.depth ?? 0;
        const bDepth = nodeById.get(b.toId)?.depth ?? 0;
        return aDepth - bDepth;
      });
    if (outgoingCandidates[0]) return outgoingCandidates[0];

    const bridge = withDirection
      .filter((edge) => !visitedEdges.has(edgeKey(edge)))
      .sort((a, b) => b.weight - a.weight)[0];
    return bridge ?? null;
  };

  while (links.length < maxLinks) {
    const next = pickNext();
    if (!next) break;

    const fromNode = nodeById.get(next.fromId);
    const toNode = nodeById.get(next.toId);
    if (!fromNode || !toNode) {
      visitedEdges.add(edgeKey(next));
      continue;
    }

    const fromRef = `${fromNode.book_name} ${fromNode.chapter}:${fromNode.verse}`;
    const toRef = `${toNode.book_name} ${toNode.chapter}:${toNode.verse}`;
    links.push({
      from: fromRef,
      to: toRef,
      concept: describeEdgeConcept(next.type),
      fromIsReference: true,
      toIsReference: true,
    });

    visitedEdges.add(edgeKey(next));
    visitedNodes.add(next.fromId);
    visitedNodes.add(next.toId);
    currentId = next.toId;
  }

  const deduped: ChainLink[] = [];
  const seen = new Set<string>();
  links.forEach((link) => {
    const key = `${normalizeReference(link.from)}->${normalizeReference(link.to)}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(link);
  });
  return deduped;
}

function formatNodeReference(node: VisualNode): string {
  return `${node.book_name} ${node.chapter}:${node.verse}`;
}

function buildReferenceLookup(
  bundle: VisualContextBundle,
): Map<string, number> {
  const lookup = new Map<string, number>();
  bundle.nodes.forEach((node) => {
    const canonical = formatNodeReference(node);
    lookup.set(normalizeReference(canonical), node.id);
  });
  return lookup;
}

function extractReferences(text: string): string[] {
  const matches = text.match(REFERENCE_REGEX);
  if (!matches) return [];
  return matches.map((value) => value.replace(/^\s*\[|\]\s*$/g, "").trim());
}

function buildEdgeKey(connectionType: string, fromId: number, toId: number) {
  const a = Math.min(fromId, toId);
  const b = Math.max(fromId, toId);
  return `${connectionType}:${a}-${b}`;
}

function getEdgeStyleType(edgeType: string | undefined): string {
  if (!edgeType) return "GREY";
  return EDGE_TYPE_TO_STYLE[edgeType] || "GREY";
}

function findBestEdge(
  bundle: VisualContextBundle,
  fromId: number,
  toId: number,
) {
  const candidates = (bundle.edges || []).filter(
    (edge) =>
      (edge.from === fromId && edge.to === toId) ||
      (edge.from === toId && edge.to === fromId),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, current) =>
    current.weight > best.weight ? current : best,
  );
}

function resolveConnectionType(
  bundle: VisualContextBundle,
  fromId: number,
  toId: number,
  fallback: string,
): string {
  const edge = findBestEdge(bundle, fromId, toId);
  if (!edge) return fallback;
  return getEdgeStyleType(edge.type);
}

function buildClusterFromBundle(
  bundle: VisualContextBundle,
  baseId: number,
  connectionType: string,
  seedVerseIds: number[] = [],
) {
  const verseIdSet = new Set<number>(seedVerseIds);
  verseIdSet.add(baseId);
  (bundle.edges || []).forEach((edge) => {
    const styleType = getEdgeStyleType(edge.type);
    if (styleType !== connectionType) return;
    if (edge.from === baseId) {
      verseIdSet.add(edge.to);
    } else if (edge.to === baseId) {
      verseIdSet.add(edge.from);
    }
  });
  return {
    baseId,
    verseIds: Array.from(verseIdSet),
    connectionType,
  };
}

function buildClusterEdges(
  bundle: VisualContextBundle,
  cluster: NonNullable<MobileMapSession["cluster"]>,
) {
  return cluster.verseIds
    .filter((id) => id !== cluster.baseId)
    .map((id) => {
      const bestEdge = findBestEdge(bundle, cluster.baseId, id);
      return {
        fromId: cluster.baseId,
        toId: id,
        connectionType: cluster.connectionType,
        weight: bestEdge?.weight ?? 0.7,
      };
    });
}

function buildAllClusters(bundle: VisualContextBundle) {
  const clusters = new Map<
    string,
    {
      key: string;
      baseId: number;
      connectionType: string;
      verseIds: Set<number>;
      totalWeight: number;
    }
  >();

  (bundle.edges || []).forEach((edge) => {
    const styleType = getEdgeStyleType(edge.type);
    const weight = typeof edge.weight === "number" ? edge.weight : 0.7;
    const addEdge = (baseId: number, otherId: number) => {
      const key = `${baseId}:${styleType}`;
      if (!clusters.has(key)) {
        clusters.set(key, {
          key,
          baseId,
          connectionType: styleType,
          verseIds: new Set<number>(),
          totalWeight: 0,
        });
      }
      const cluster = clusters.get(key);
      if (cluster) {
        cluster.verseIds.add(otherId);
        cluster.totalWeight += weight;
      }
    };

    addEdge(edge.from, edge.to);
    addEdge(edge.to, edge.from);
  });

  return Array.from(clusters.values()).map((cluster) => ({
    ...cluster,
    verseIds: Array.from(cluster.verseIds),
  }));
}

function pickNextConnection(
  bundle: VisualContextBundle,
  cluster: MobileMapSession["cluster"] | undefined,
  visited: Set<string>,
): {
  nextConnection: MobileMapConnection | null;
  nextCluster: MobileMapSession["cluster"] | undefined;
} {
  if (cluster) {
    const edges = buildClusterEdges(bundle, cluster);
    const filtered = edges.filter(
      (edge) =>
        !visited.has(buildEdgeKey(edge.connectionType, edge.fromId, edge.toId)),
    );
    const nextInCluster = filtered.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.toId - b.toId;
    })[0];

    if (nextInCluster) {
      return {
        nextConnection: {
          fromId: nextInCluster.fromId,
          toId: nextInCluster.toId,
          connectionType: nextInCluster.connectionType,
        },
        nextCluster: cluster,
      };
    }
  }

  const clusters = buildAllClusters(bundle)
    .map((entry) => {
      const remainingIds = entry.verseIds.filter(
        (id) =>
          !visited.has(buildEdgeKey(entry.connectionType, entry.baseId, id)),
      );
      return {
        ...entry,
        remainingIds,
        remainingCount: remainingIds.length,
      };
    })
    .filter((entry) => entry.remainingCount > 0);

  if (clusters.length === 0) {
    return { nextConnection: null, nextCluster: cluster };
  }

  const remainingByType = clusters.reduce(
    (acc, entry) => {
      acc[entry.connectionType] =
        (acc[entry.connectionType] || 0) + entry.remainingCount;
      return acc;
    },
    {} as Record<string, number>,
  );

  const targetType = Object.entries(remainingByType).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  })[0]?.[0];

  const sameBaseTargetClusters =
    cluster && targetType
      ? clusters.filter(
          (entry) =>
            entry.baseId === cluster.baseId &&
            entry.connectionType === targetType,
        )
      : [];

  const candidateClusters =
    sameBaseTargetClusters.length > 0
      ? sameBaseTargetClusters
      : targetType
        ? clusters.filter((entry) => entry.connectionType === targetType)
        : clusters;

  candidateClusters.sort((a, b) => {
    if (b.remainingCount !== a.remainingCount) {
      return b.remainingCount - a.remainingCount;
    }
    if (b.totalWeight !== a.totalWeight) {
      return b.totalWeight - a.totalWeight;
    }
    if (b.verseIds.length !== a.verseIds.length) {
      return b.verseIds.length - a.verseIds.length;
    }
    if (a.baseId !== b.baseId) return a.baseId - b.baseId;
    return a.connectionType.localeCompare(b.connectionType);
  });

  const selectedCluster = candidateClusters[0];
  const nextId = selectedCluster.remainingIds.sort((a, b) => a - b)[0];
  if (!nextId) {
    return { nextConnection: null, nextCluster: cluster };
  }

  return {
    nextConnection: {
      fromId: selectedCluster.baseId,
      toId: nextId,
      connectionType: selectedCluster.connectionType,
    },
    nextCluster: {
      baseId: selectedCluster.baseId,
      verseIds: selectedCluster.verseIds,
      connectionType: selectedCluster.connectionType,
    },
  };
}

function buildMapSessionPayload({
  bundle,
  seedSession,
  existingSession,
  inputText,
  useQueuedConnection,
}: {
  bundle: VisualContextBundle;
  seedSession?: MobileMapSession | null;
  existingSession?: MobileMapSession | null;
  inputText?: string;
  useQueuedConnection: boolean;
}) {
  const visited = new Set<string>(
    seedSession?.visitedEdgeKeys || existingSession?.visitedEdgeKeys || [],
  );
  let cluster = seedSession?.cluster || existingSession?.cluster;
  let currentConnection =
    seedSession?.currentConnection || existingSession?.currentConnection;
  let previousConnection =
    seedSession?.previousConnection || existingSession?.previousConnection;

  const references = inputText ? extractReferences(inputText) : [];
  const lookup = buildReferenceLookup(bundle);
  const referencedIds = references
    .map((ref) => lookup.get(normalizeReference(ref)))
    .filter((id): id is number => typeof id === "number");
  const offMapReferences = references.filter(
    (ref) => !lookup.has(normalizeReference(ref)),
  );

  if (!seedSession) {
    if (useQueuedConnection && existingSession?.nextConnection) {
      currentConnection = existingSession.nextConnection;
      previousConnection = existingSession.currentConnection;
    } else if (referencedIds.length > 0) {
      previousConnection = undefined;
      const baseId =
        referencedIds.length > 1
          ? referencedIds[0]
          : cluster?.baseId || bundle.rootId || referencedIds[0];
      let toId =
        referencedIds.length > 1
          ? referencedIds[1]
          : referencedIds[0] === baseId
            ? bundle.rootId || referencedIds[0]
            : referencedIds[0];
      if (toId === baseId) {
        const fallbackId = cluster?.verseIds?.find((id) => id !== baseId);
        if (fallbackId) {
          toId = fallbackId;
        }
      }
      const connectionType = resolveConnectionType(
        bundle,
        baseId,
        toId,
        cluster?.connectionType || "GREY",
      );
      currentConnection = { fromId: baseId, toId, connectionType };
      cluster = buildClusterFromBundle(bundle, baseId, connectionType, [
        baseId,
        toId,
      ]);
    }
  }

  if (currentConnection) {
    visited.add(
      buildEdgeKey(
        currentConnection.connectionType,
        currentConnection.fromId,
        currentConnection.toId,
      ),
    );
  }

  const { nextConnection, nextCluster } = pickNextConnection(
    bundle,
    cluster,
    visited,
  );

  const session: MobileMapSession = {
    cluster: nextCluster || cluster,
    currentConnection,
    previousConnection,
    nextConnection,
    visitedEdgeKeys: Array.from(visited),
    offMapReferences: offMapReferences.length ? offMapReferences : undefined,
    exhausted: !nextConnection,
  };

  return {
    session,
    queuedConnection: nextConnection,
  };
}

function isContextualFollowUp(message: string, hasBundle: boolean): boolean {
  if (!hasBundle) return false;

  const normalized = message.trim().toLowerCase();
  const wordCount = normalized.split(/\s+/).length;
  const hasVerseRef = /\b\d?\s?[a-z]+\s+\d+:\d+/i.test(message);
  if (hasVerseRef) return false;

  const pronounPattern =
    /\b(it|that|this|these|those|the same|what you said|you mentioned|the passage|the verse|the text)\b/i;
  const hasPronoun = pronounPattern.test(normalized);
  const followUpPattern =
    /^(what|why|how|can you|could you|tell me|explain|more about|go deeper|elaborate|clarify|meaning|significance|does this|does that|what does)/i;
  const isFollowUpPhrase = followUpPattern.test(normalized);

  if (wordCount <= 15 && (hasPronoun || isFollowUpPhrase)) return true;
  if (wordCount <= 6) return true;
  return false;
}

async function streamBibleStudy({
  endpoint,
  prompt,
  history,
  promptMode,
  visualBundle,
  mapSession,
  mapMode,
  accessToken,
  signal,
  onDelta,
  onVerseSearch,
  onToolCall,
  onToolResult,
  onToolError,
  onMapData,
}: {
  endpoint: string;
  prompt: string;
  history: ChatHistoryMessage[];
  promptMode?: MobilePromptMode;
  visualBundle?: VisualContextBundle;
  mapSession?: MobileMapSession | null;
  mapMode?: "fast" | "full";
  accessToken?: string;
  signal?: globalThis.AbortSignal;
  onDelta: (delta: string) => void;
  onVerseSearch?: (verse: string) => void;
  onToolCall?: (tool: string) => void;
  onToolResult?: (tool: string) => void;
  onToolError?: (tool: string) => void;
  onMapData?: (bundle: VisualContextBundle) => void;
}): Promise<ParsedBibleStudyResult> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: prompt,
      history,
      ...(promptMode ? { promptMode } : {}),
      ...(visualBundle ? { visualBundle } : {}),
      ...(mapSession ? { mapSession } : {}),
      ...(mapMode ? { mapMode } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Chat request failed (${response.status})`);
  }

  const streamReader = response.body?.getReader?.();
  if (streamReader) {
    const decoder = new globalThis.TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let content = "";
    let citations: string[] = [];
    let suggestTrace = false;
    let connectionCount: number | undefined;
    let mapBundle: VisualContextBundle | undefined;
    let chainData: ChainData | undefined;
    let streamErrorMessage: string | undefined;
    const searchingVerses: string[] = [];
    const activeTools: string[] = [];
    const completedTools: string[] = [];
    const erroredTools: string[] = [];

    while (true) {
      const { done, value } = await streamReader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          currentEvent = "";
          continue;
        }
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (!line.startsWith("data:")) {
          continue;
        }

        const json = line.slice(5).trim();
        if (!json) continue;

        try {
          const parsed = JSON.parse(json) as Record<string, unknown>;
          if (currentEvent === "content") {
            const delta = typeof parsed.delta === "string" ? parsed.delta : "";
            if (delta) {
              content += delta;
              onDelta(delta);
            }
          }
          if (currentEvent === "done") {
            if (Array.isArray(parsed.citations)) {
              citations = parsed.citations.filter(
                (entry): entry is string => typeof entry === "string",
              );
            }
            suggestTrace = Boolean(parsed.suggestTrace);
            connectionCount =
              typeof parsed.connectionCount === "number"
                ? parsed.connectionCount
                : undefined;
          }
          if (
            currentEvent === "verse_search" &&
            typeof parsed.verse === "string"
          ) {
            searchingVerses.push(parsed.verse);
            onVerseSearch?.(parsed.verse);
          }
          if (currentEvent === "tool_call" && typeof parsed.tool === "string") {
            activeTools.push(parsed.tool);
            onToolCall?.(parsed.tool);
          }
          if (
            currentEvent === "tool_result" &&
            typeof parsed.tool === "string"
          ) {
            completedTools.push(parsed.tool);
            onToolResult?.(parsed.tool);
          }
          if (
            currentEvent === "tool_error" &&
            typeof parsed.tool === "string"
          ) {
            erroredTools.push(parsed.tool);
            onToolError?.(parsed.tool);
          }
          if (currentEvent === "map_data" && isVisualContextBundle(parsed)) {
            mapBundle = parsed;
            onMapData?.(parsed);
          }
          if (currentEvent === "chain_data" && isChainData(parsed)) {
            chainData = parsed;
          }
          if (
            currentEvent === "error" &&
            typeof parsed.message === "string" &&
            parsed.message.trim().length > 0
          ) {
            streamErrorMessage = parsed.message.trim();
          }
        } catch {
          // Ignore malformed SSE event and continue streaming.
        }
      }
    }

    if (streamErrorMessage && !content.trim()) {
      throw new Error(streamErrorMessage);
    }

    return {
      content,
      citations,
      suggestTrace,
      connectionCount,
      mapBundle,
      chainData,
      errorMessage: streamErrorMessage,
      searchingVerses,
      activeTools,
      completedTools,
      erroredTools,
    };
  }

  const raw = await response.text();
  const parsed = parseSsePayload(raw);
  if (parsed.errorMessage && !parsed.content.trim()) {
    throw new Error(parsed.errorMessage);
  }
  if (parsed.content) {
    onDelta(parsed.content);
  }
  return parsed;
}

async function fetchRandomPericope(
  kind: "random" | "ot" | "nt",
): Promise<RandomPericopeTopic> {
  const params =
    kind === "ot" ? "?testament=OT" : kind === "nt" ? "?testament=NT" : "";
  const response = await fetch(
    `${MOBILE_ENV.API_URL}/api/pericope/random${params}`,
  );
  if (!response.ok) {
    throw new Error("Failed to load random pericope");
  }
  const data = (await response.json()) as {
    pericopeId?: number;
    prompt?: string;
    title?: string;
    rangeRef?: string;
  };
  const title = typeof data.title === "string" ? data.title.trim() : "Pericope";
  const rangeRef =
    typeof data.rangeRef === "string" ? data.rangeRef.trim() : "";
  const basePrompt =
    typeof data.prompt === "string" && data.prompt.trim().length > 0
      ? data.prompt.trim()
      : rangeRef
        ? `Go deeper on [${rangeRef}].`
        : `Go deeper on ${title}.`;
  return {
    id: typeof data.pericopeId === "number" ? data.pericopeId : Date.now(),
    title,
    rangeRef,
    displayText: basePrompt,
    promptText: basePrompt,
    kind,
  };
}

function AssistantRichText({
  content,
  onReferencePress,
}: {
  content: string;
  onReferencePress: (reference: string) => void;
}) {
  const blocks = useMemo(() => parseAssistantBlocks(content), [content]);

  if (!blocks.length) {
    return <Text style={localStyles.messageText}>{content}</Text>;
  }

  return (
    <View style={localStyles.assistantBlocks}>
      {blocks.map((block, index) => {
        const parts = block.text.split(REFERENCE_PARTS_REGEX);
        if (block.kind === "heading") {
          return (
            <Text key={`heading-${index}`} style={localStyles.assistantHeading}>
              {parts.map((part, partIndex) => {
                const match = part.match(REFERENCE_MATCH_REGEX);
                if (match) {
                  const reference = match[1];
                  return (
                    <Text
                      key={`heading-ref-${index}-${partIndex}`}
                      onPress={() => onReferencePress(reference)}
                      style={localStyles.inlineReference}
                    >
                      {reference}
                    </Text>
                  );
                }
                return (
                  <Text key={`heading-text-${index}-${partIndex}`}>
                    {stripMarkdownInline(part)}
                  </Text>
                );
              })}
            </Text>
          );
        }

        if (block.kind === "bullet") {
          return (
            <View
              key={`bullet-${index}`}
              style={localStyles.assistantBulletRow}
            >
              <Text style={localStyles.assistantBulletMarker}>*</Text>
              <Text style={localStyles.assistantBulletText}>
                {parts.map((part, partIndex) => {
                  const match = part.match(REFERENCE_MATCH_REGEX);
                  if (match) {
                    const reference = match[1];
                    return (
                      <Text
                        key={`bullet-ref-${index}-${partIndex}`}
                        onPress={() => onReferencePress(reference)}
                        style={localStyles.inlineReference}
                      >
                        {reference}
                      </Text>
                    );
                  }
                  return (
                    <Text key={`bullet-text-${index}-${partIndex}`}>
                      {stripMarkdownInline(part)}
                    </Text>
                  );
                })}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`paragraph-${index}`} style={localStyles.messageText}>
            {parts.map((part, partIndex) => {
              const match = part.match(REFERENCE_MATCH_REGEX);
              if (match) {
                const reference = match[1];
                return (
                  <Text
                    key={`paragraph-ref-${index}-${partIndex}`}
                    onPress={() => onReferencePress(reference)}
                    style={localStyles.inlineReference}
                  >
                    {reference}
                  </Text>
                );
              }
              return (
                <Text key={`paragraph-text-${index}-${partIndex}`}>
                  {stripMarkdownInline(part)}
                </Text>
              );
            })}
          </Text>
        );
      })}
    </View>
  );
}

export function ChatScreen({
  nav,
}: {
  nav: {
    openMapViewer: (
      title?: string,
      bundle?: unknown,
      traceQuery?: string,
    ) => void;
    openReader: (book: string, chapter: number) => void;
    isActive: boolean;
    pendingPrompt?: MobileGoDeeperPayload;
    autoSend?: boolean;
    clearPendingPrompt: () => void;
  };
}) {
  const controller = useMobileApp();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullMapPending, setFullMapPending] = useState(false);
  const [mapPendingFullMessageId, setMapPendingFullMessageId] = useState<
    string | null
  >(null);
  const [mapBusyMessageId, setMapBusyMessageId] = useState<string | null>(null);
  const [chainBusyMessageId, setChainBusyMessageId] = useState<string | null>(
    null,
  );
  const [chainByMessageId, setChainByMessageId] = useState<
    Record<string, string>
  >({});
  const [chainModalMessageId, setChainModalMessageId] = useState<string | null>(
    null,
  );
  const [chainModalError, setChainModalError] = useState<string | null>(null);
  const [quickPromptBusyKey, setQuickPromptBusyKey] = useState<string | null>(
    null,
  );
  const [traceModeEnabled, setTraceModeEnabled] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [, setCompletedTools] = useState<string[]>([]);
  const [searchingVerses, setSearchingVerses] = useState<string[]>([]);
  const [, setErroredTools] = useState<string[]>([]);
  const [mapPrepActive, setMapPrepActive] = useState(false);
  const [mapPrepCount, setMapPrepCount] = useState<number | null>(null);
  const [mapReadyMessageId, setMapReadyMessageId] = useState<string | null>(
    null,
  );
  const [mapSession, setMapSession] = useState<MobileMapSession | null>(null);
  const [activeVisualBundle, setActiveVisualBundle] =
    useState<VisualContextBundle | null>(null);
  const [randomTopicsLoading, setRandomTopicsLoading] = useState(false);
  const [randomPericopes, setRandomPericopes] = useState<RandomPericopeTopic[]>(
    [],
  );
  const [versePreviewReference, setVersePreviewReference] = useState<
    string | null
  >(null);
  const [versePreviewText, setVersePreviewText] = useState<string>("");
  const [versePreviewLoading, setVersePreviewLoading] = useState(false);
  const [versePreviewError, setVersePreviewError] = useState<string | null>(
    null,
  );
  const [versePreviewTraceLoading, setVersePreviewTraceLoading] =
    useState(false);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const handledPromptRef = useRef<string | null>(null);
  const streamAbortRef = useRef<globalThis.AbortController | null>(null);
  const streamDeltaBufferRef = useRef("");
  const streamDisplayedContentRef = useRef("");
  const streamAnimationFrameRef = useRef<number | null>(null);
  const streamAnimationRunningRef = useRef(false);
  const streamTargetMessageIdRef = useRef<string | null>(null);
  const fullMapRequestRef = useRef<{
    id: string;
    assistantMessageId: string;
    abortController: globalThis.AbortController;
  } | null>(null);
  const composerInputRef = useRef<TextInput | null>(null);
  const isEmptyState = messages.length === 0;
  const canSendDraft = draft.trim().length > 0;
  const showCenteredEmptyState = isEmptyState && !canSendDraft;
  const showEmptyThreadChips = showCenteredEmptyState;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardLift = keyboardVisible
    ? Math.max(8, keyboardHeight - insets.bottom)
    : 0;
  const statusPulse = useRef(new Animated.Value(1)).current;

  const history = useMemo<ChatHistoryMessage[]>(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.rawContent ?? message.content,
      })),
    [messages],
  );

  const quickPromptEntries = useMemo<QuickPromptEntry[]>(() => {
    const fallbackByKey = new Map(
      CHAT_QUICK_PROMPTS_FALLBACK.map((entry) => [entry.key, entry]),
    );
    const byKind = new Map(randomPericopes.map((entry) => [entry.kind, entry]));
    const orderedKinds: Array<"random" | "ot" | "nt"> = ["random", "ot", "nt"];

    return orderedKinds.map((kind) => {
      const fromApi = byKind.get(kind);
      if (fromApi) {
        return {
          key: kind,
          label:
            kind === "ot"
              ? "Old Testament"
              : kind === "nt"
                ? "New Testament"
                : "Surprise Me",
          displayText: fromApi.displayText,
          promptText: fromApi.promptText,
          title: fromApi.title || "Pericope",
        };
      }

      const fallback = fallbackByKey.get(kind);
      const prompt = fallback?.prompt ?? "Go deeper on a passage.";
      return {
        key: kind,
        label:
          kind === "ot"
            ? "Old Testament"
            : kind === "nt"
              ? "New Testament"
              : "Surprise Me",
        displayText: prompt,
        promptText: prompt,
        title:
          kind === "ot"
            ? "Old Testament passage"
            : kind === "nt"
              ? "New Testament passage"
              : "Random passage",
      };
    });
  }, [randomPericopes]);

  const cancelStreamTextAnimation = useCallback(() => {
    const frameId = streamAnimationFrameRef.current;
    if (frameId !== null) {
      globalThis.cancelAnimationFrame(frameId);
      streamAnimationFrameRef.current = null;
    }
    streamAnimationRunningRef.current = false;
  }, []);

  const resetStreamTextAnimation = useCallback(
    (targetMessageId: string | null) => {
      cancelStreamTextAnimation();
      streamTargetMessageIdRef.current = targetMessageId;
      streamDeltaBufferRef.current = "";
      streamDisplayedContentRef.current = "";
    },
    [cancelStreamTextAnimation],
  );

  const ensureStreamTextAnimating = useCallback(() => {
    if (streamAnimationRunningRef.current) {
      return;
    }

    streamAnimationRunningRef.current = true;
    const tick = () => {
      const targetMessageId = streamTargetMessageIdRef.current;
      if (!targetMessageId) {
        streamAnimationRunningRef.current = false;
        streamAnimationFrameRef.current = null;
        return;
      }

      const buffered = streamDeltaBufferRef.current;
      const displayed = streamDisplayedContentRef.current;
      if (buffered.length <= displayed.length) {
        streamAnimationRunningRef.current = false;
        streamAnimationFrameRef.current = null;
        return;
      }

      const charsToAdd = Math.min(
        STREAM_CHARS_PER_FRAME,
        buffered.length - displayed.length,
      );
      const nextContent = buffered.slice(0, displayed.length + charsToAdd);
      streamDisplayedContentRef.current = nextContent;

      setMessages((current) =>
        current.map((item) =>
          item.id === targetMessageId
            ? { ...item, content: nextContent }
            : item,
        ),
      );

      streamAnimationFrameRef.current = globalThis.requestAnimationFrame(tick);
    };

    streamAnimationFrameRef.current = globalThis.requestAnimationFrame(tick);
  }, []);

  const waitForStreamTextDrain = useCallback((targetMessageId: string) => {
    return new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const bufferedAtStart = Math.max(
        streamDeltaBufferRef.current.length,
        streamDisplayedContentRef.current.length,
      );
      const expectedMs =
        Math.ceil(
          (bufferedAtStart / Math.max(1, STREAM_CHARS_PER_FRAME * 60)) * 1000,
        ) + 220;
      const maxWaitMs = Math.min(10000, Math.max(1800, expectedMs));

      const check = () => {
        const stillTargeting =
          streamTargetMessageIdRef.current === targetMessageId;
        const bufferedLength = streamDeltaBufferRef.current.length;
        const displayedLength = streamDisplayedContentRef.current.length;
        const fullyDisplayed = displayedLength >= bufferedLength;
        const timedOut = Date.now() - startedAt >= maxWaitMs;

        if (!stillTargeting || fullyDisplayed || timedOut) {
          resolve();
          return;
        }

        globalThis.requestAnimationFrame(check);
      };

      check();
    });
  }, []);

  const cancelFullMapRequest = useCallback(() => {
    fullMapRequestRef.current?.abortController.abort();
    fullMapRequestRef.current = null;
    setFullMapPending(false);
    setMapPendingFullMessageId(null);
  }, []);

  const handleStopStreaming = useCallback(() => {
    cancelStreamTextAnimation();
    streamAbortRef.current?.abort();
    if (
      fullMapRequestRef.current &&
      fullMapRequestRef.current.assistantMessageId ===
        streamTargetMessageIdRef.current
    ) {
      cancelFullMapRequest();
    }
  }, [cancelFullMapRequest, cancelStreamTextAnimation]);

  useEffect(() => {
    return () => {
      cancelStreamTextAnimation();
      streamAbortRef.current?.abort();
      fullMapRequestRef.current?.abortController.abort();
    };
  }, [cancelStreamTextAnimation]);

  const startFullMapFetch = useCallback(
    async ({
      assistantMessageId,
      promptText,
    }: {
      assistantMessageId: string;
      promptText: string;
    }) => {
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      fullMapRequestRef.current?.abortController.abort();
      const abortController = new globalThis.AbortController();
      fullMapRequestRef.current = {
        id: requestId,
        assistantMessageId,
        abortController,
      };
      setFullMapPending(true);
      setMapPendingFullMessageId(assistantMessageId);

      try {
        const bundle = await fetchTraceBundle({
          apiBaseUrl: MOBILE_ENV.API_URL,
          text: promptText,
          accessToken: controller.session?.access_token,
          signal: abortController.signal,
        });
        if (!isVisualContextBundle(bundle)) {
          throw new Error("Map response was malformed.");
        }

        const pendingRequest = fullMapRequestRef.current;
        if (!pendingRequest || pendingRequest.id !== requestId) {
          return;
        }

        setActiveVisualBundle((current) => preferRicherBundle(current, bundle));
        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  mapBundle: preferRicherBundle(item.mapBundle, bundle),
                }
              : item,
          ),
        );
        setMapSession((current) => {
          if (!current) return current;
          const { session } = buildMapSessionPayload({
            bundle,
            existingSession: current,
            useQueuedConnection: false,
          });
          return session;
        });
        setMapPrepCount(bundle.nodes.length);
        setMapReadyMessageId(assistantMessageId);
      } catch (nextError) {
        if (nextError instanceof Error && nextError.name === "AbortError") {
          return;
        }
      } finally {
        const pendingRequest = fullMapRequestRef.current;
        if (pendingRequest && pendingRequest.id === requestId) {
          fullMapRequestRef.current = null;
          setFullMapPending(false);
          setMapPendingFullMessageId(null);
        }
      }
    },
    [controller.session?.access_token],
  );

  useEffect(() => {
    const shouldPulse =
      busy &&
      (mapPrepActive || searchingVerses.length > 0 || activeTools.length > 0);
    if (!shouldPulse) {
      statusPulse.stopAnimation();
      statusPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(statusPulse, {
          toValue: 0.82,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(statusPulse, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      statusPulse.stopAnimation();
      statusPulse.setValue(1);
    };
  }, [
    activeTools.length,
    busy,
    mapPrepActive,
    searchingVerses.length,
    statusPulse,
  ]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    composerInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardVisible(false);
    setKeyboardHeight(0);
  }, [nav.isActive]);

  useEffect(() => {
    if (!isEmptyState) return;
    if (randomPericopes.length > 0 || randomTopicsLoading) return;

    let active = true;
    setRandomTopicsLoading(true);

    Promise.all([
      fetchRandomPericope("random"),
      fetchRandomPericope("ot"),
      fetchRandomPericope("nt"),
    ])
      .then((topics) => {
        if (!active) return;
        setRandomPericopes(topics);
      })
      .catch(() => {
        if (!active) return;
        setRandomPericopes([]);
      })
      .finally(() => {
        if (!active) return;
        setRandomTopicsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isEmptyState, randomPericopes.length, randomTopicsLoading]);

  const handleSend = useCallback(
    async (overrideInput?: string | MobilePendingPrompt) => {
      if (busy) return;
      const normalizedOverride = overrideInput
        ? normalizeMobilePendingPrompt(overrideInput)
        : null;
      const displayText = (normalizedOverride?.displayText ?? draft).trim();
      const promptText = (normalizedOverride?.prompt ?? displayText).trim();
      if (!displayText || !promptText) return;
      const traceModeForRequest = traceModeEnabled;

      const endpoint = traceModeForRequest
        ? `${MOBILE_ENV.API_URL}/api/chat/stream`
        : `${MOBILE_ENV.API_URL}/api/bible-study`;
      const seededBundle = normalizedOverride?.visualBundle;
      const seededSession = normalizedOverride?.mapSession ?? null;
      const bundleForMap = seededBundle ?? activeVisualBundle ?? null;
      const hasActiveBundle = Boolean(bundleForMap);
      const references = extractReferences(promptText);
      const hasExplicitRef = references.length > 0;
      const offMapReferences =
        bundleForMap && hasExplicitRef
          ? references.filter(
              (ref) =>
                !buildReferenceLookup(bundleForMap).has(
                  normalizeReference(ref),
                ),
            )
          : [];
      const followUp = isContextualFollowUp(displayText, hasActiveBundle);
      const shouldReanchor =
        !hasActiveBundle ||
        (!followUp && (!hasExplicitRef || offMapReferences.length > 0));

      const promptMode =
        normalizedOverride?.mode ??
        (shouldReanchor || hasActiveBundle ? "go_deeper_short" : undefined);

      let mapSessionPayload: MobileMapSession | undefined;
      if (bundleForMap && !shouldReanchor) {
        const { session } = buildMapSessionPayload({
          bundle: bundleForMap,
          seedSession: seededSession,
          existingSession: mapSession,
          inputText: promptText,
          useQueuedConnection: false,
        });
        mapSessionPayload = session;
        setMapSession(session);
      } else if (shouldReanchor) {
        setMapSession(null);
        setActiveVisualBundle(null);
      }

      if (seededBundle) {
        setActiveVisualBundle(seededBundle);
      }

      const streamBundle = shouldReanchor
        ? undefined
        : bundleForMap || undefined;
      const mapMode = shouldReanchor ? "fast" : undefined;
      const showMapPrepForRequest = traceModeForRequest;
      const requestHistory = history;

      const userMessageId = `user-${Date.now()}`;
      const assistantMessageId = `assistant-${Date.now()}`;
      const abortController = new globalThis.AbortController();
      streamAbortRef.current = abortController;
      resetStreamTextAnimation(assistantMessageId);

      setError(null);
      setBusy(true);
      composerInputRef.current?.blur();
      Keyboard.dismiss();
      setKeyboardVisible(false);
      setKeyboardHeight(0);
      setDraft("");
      setSearchingVerses([]);
      setActiveTools([]);
      setCompletedTools([]);
      setErroredTools([]);
      if (shouldReanchor) {
        cancelFullMapRequest();
      }
      setMapPrepActive(showMapPrepForRequest);
      setMapPrepCount(showMapPrepForRequest ? 0 : null);
      setMapReadyMessageId(null);
      setMessages((current) => [
        ...current.map((item) =>
          item.role === "assistant" && item.nextBranches
            ? { ...item, nextBranches: undefined }
            : item,
        ),
        {
          id: userMessageId,
          role: "user",
          content: displayText,
          rawContent: promptText,
        },
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 0);
      if (shouldReanchor && traceModeForRequest) {
        void startFullMapFetch({
          assistantMessageId,
          promptText,
        });
      }

      try {
        const result = await streamBibleStudy({
          endpoint,
          prompt: promptText,
          history: requestHistory,
          promptMode,
          visualBundle: streamBundle,
          mapSession: mapSessionPayload,
          mapMode,
          accessToken: controller.session?.access_token,
          signal: abortController.signal,
          onDelta: (delta) => {
            if (!delta) return;
            streamDeltaBufferRef.current += delta;
            ensureStreamTextAnimating();
          },
          onVerseSearch: (verse) => {
            setSearchingVerses((current) => {
              return appendUnique(current, verse);
            });
          },
          onToolCall: (tool) => {
            setActiveTools((current) => appendUnique(current, tool));
            setCompletedTools((current) =>
              current.filter((entry) => entry !== tool),
            );
            setErroredTools((current) =>
              current.filter((entry) => entry !== tool),
            );
          },
          onToolResult: (tool) => {
            setActiveTools((current) =>
              current.filter((entry) => entry !== tool),
            );
            setCompletedTools((current) => appendUnique(current, tool));
          },
          onToolError: (tool) => {
            setActiveTools((current) =>
              current.filter((entry) => entry !== tool),
            );
            setErroredTools((current) => appendUnique(current, tool));
          },
          onMapData: (bundle) => {
            setActiveVisualBundle((current) => {
              if (current && current.rootId !== bundle.rootId) {
                setMapSession(null);
              }
              return preferRicherBundle(current, bundle);
            });
            setMapPrepCount(bundle.nodes.length);
            setMapReadyMessageId(assistantMessageId);
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantMessageId
                  ? {
                      ...item,
                      mapBundle: preferRicherBundle(item.mapBundle, bundle),
                    }
                  : item,
              ),
            );
            if (showMapPrepForRequest) {
              setMapPrepActive(false);
            }
          },
        });

        if (result.mapBundle) {
          const nextBundle = result.mapBundle;
          setActiveVisualBundle((current) => {
            if (current && current.rootId !== nextBundle.rootId) {
              setMapSession(null);
            }
            return preferRicherBundle(current, nextBundle);
          });
          setMapPrepCount(nextBundle.nodes.length);
          setMapReadyMessageId(assistantMessageId);
        }
        const completedSet = new Set(result.completedTools ?? []);
        const erroredSet = new Set(result.erroredTools ?? []);
        const finalActive = Array.from(
          new Set(result.activeTools ?? []),
        ).filter((tool) => !completedSet.has(tool) && !erroredSet.has(tool));
        setSearchingVerses(Array.from(new Set(result.searchingVerses ?? [])));
        setActiveTools(finalActive);
        setCompletedTools(Array.from(completedSet));
        setErroredTools(Array.from(erroredSet));
        await waitForStreamTextDrain(assistantMessageId);
        cancelStreamTextAnimation();
        const finalStreamContent =
          result.content || streamDeltaBufferRef.current;
        streamDeltaBufferRef.current = finalStreamContent;
        streamDisplayedContentRef.current = finalStreamContent;

        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: finalStreamContent || item.content,
                  citations: result.citations,
                  mapBundle: result.mapBundle
                    ? preferRicherBundle(item.mapBundle, result.mapBundle)
                    : item.mapBundle,
                  suggestTrace: result.suggestTrace,
                  connectionCount: result.connectionCount,
                  chainData: result.chainData ?? item.chainData,
                }
              : item,
          ),
        );
        if (result.errorMessage) {
          setError(result.errorMessage);
        }
        void hydrateNextBranchesForMessage({
          messageId: assistantMessageId,
          question: promptText,
          answer: finalStreamContent || "",
          citations: result.citations || [],
        });
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: true });
        }, 0);
      } catch (nextError) {
        cancelStreamTextAnimation();
        if (
          fullMapRequestRef.current &&
          fullMapRequestRef.current.assistantMessageId === assistantMessageId
        ) {
          cancelFullMapRequest();
        }
        if (nextError instanceof Error && nextError.name === "AbortError") {
          setMessages((current) =>
            current.filter(
              (item) =>
                item.id !== assistantMessageId ||
                item.content.trim().length > 0,
            ),
          );
          return;
        }
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
        setMessages((current) =>
          current.filter((item) => item.id !== assistantMessageId),
        );
      } finally {
        cancelStreamTextAnimation();
        streamTargetMessageIdRef.current = null;
        if (streamAbortRef.current === abortController) {
          streamAbortRef.current = null;
        }
        setBusy(false);
        setMapPrepActive(false);
        if (traceModeForRequest) {
          setTraceModeEnabled(false);
        }
      }
    },
    [
      activeVisualBundle,
      busy,
      cancelFullMapRequest,
      controller.session?.access_token,
      draft,
      ensureStreamTextAnimating,
      history,
      mapSession,
      resetStreamTextAnimation,
      startFullMapFetch,
      traceModeEnabled,
      cancelStreamTextAnimation,
      waitForStreamTextDrain,
    ],
  );

  useEffect(() => {
    if (nav.pendingPrompt) return;
    handledPromptRef.current = null;
  }, [nav.pendingPrompt]);

  useEffect(() => {
    if (!mapReadyMessageId) return;
    const timer = setTimeout(() => {
      setMapReadyMessageId(null);
    }, 4200);
    return () => {
      clearTimeout(timer);
    };
  }, [mapReadyMessageId]);

  useEffect(() => {
    if (!nav.pendingPrompt) return;
    const normalizedPrompt = normalizeMobilePendingPrompt(nav.pendingPrompt);
    const displayText = normalizedPrompt.displayText.trim();
    const promptText = normalizedPrompt.prompt.trim();
    if (!displayText || !promptText) {
      nav.clearPendingPrompt();
      return;
    }
    const signature = `${displayText}:${promptText}:${normalizedPrompt.mode ?? ""}:${Boolean(nav.autoSend)}`;
    if (handledPromptRef.current === signature) {
      nav.clearPendingPrompt();
      return;
    }
    handledPromptRef.current = signature;

    nav.clearPendingPrompt();
    composerInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardVisible(false);
    setKeyboardHeight(0);
    setDraft(displayText);
    if (normalizedPrompt.visualBundle) {
      setActiveVisualBundle(normalizedPrompt.visualBundle);
    }
    if (normalizedPrompt.mapSession) {
      setMapSession(normalizedPrompt.mapSession);
    }
    if (nav.autoSend) {
      void handleSend(normalizedPrompt);
    }
  }, [nav.pendingPrompt, nav.autoSend, nav.clearPendingPrompt, handleSend]);

  useEffect(() => {
    if (!versePreviewReference) return;
    const parsed = parseScriptureReference(versePreviewReference);
    if (!parsed) {
      setVersePreviewError("Could not load verse text.");
      setVersePreviewText("Could not load verse text");
      setVersePreviewLoading(false);
      return;
    }

    let cancelled = false;
    const loadStartedAt = Date.now();
    setVersePreviewLoading(true);
    setVersePreviewError(null);
    setVersePreviewText("");

    void (async () => {
      try {
        const localText = await getLocalVerseTextForReference(parsed);
        if (cancelled) return;
        if (localText) {
          setVersePreviewText(localText);
          setVersePreviewError(null);
          return;
        }

        const result = await fetchVerseText({
          apiBaseUrl: MOBILE_ENV.API_URL,
          reference: parsed.normalizedReference,
        });
        if (cancelled) return;
        const resolvedText = result.text?.trim();
        if (!resolvedText) {
          setVersePreviewText("Could not load verse text");
          setVersePreviewError("Could not load verse text.");
          return;
        }
        setVersePreviewText(resolvedText);
        setVersePreviewError(null);
      } catch (error) {
        if (cancelled) return;
        setVersePreviewText("Could not load verse text");
        setVersePreviewError(getVersePreviewErrorMessage(error));
      } finally {
        if (!cancelled) {
          await ensureMinLoaderDuration(
            loadStartedAt,
            MIN_VERSE_PREVIEW_LOADING_MS,
          );
        }
        if (!cancelled) {
          setVersePreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [versePreviewReference]);

  async function handleGenerateMap(message: ChatMessage) {
    if (mapBusyMessageId) return;
    setMapBusyMessageId(message.id);
    setError(null);
    try {
      const bundle = await fetchTraceBundle({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: message.rawContent ?? message.content,
        accessToken: controller.session?.access_token,
      });

      if (!isVisualContextBundle(bundle)) {
        throw new Error("Map response was malformed.");
      }

      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, mapBundle: bundle } : item,
        ),
      );
      setMapReadyMessageId(message.id);
      nav.openMapViewer(`Map (${bundle.nodes.length} verses)`, bundle);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setMapBusyMessageId(null);
    }
  }

  async function hydrateNextBranchesForMessage({
    messageId,
    question,
    answer,
    citations,
  }: {
    messageId: string;
    question: string;
    answer: string;
    citations: string[];
  }) {
    try {
      const branches = await fetchNextBranches({
        apiBaseUrl: MOBILE_ENV.API_URL,
        question,
        answer,
        citations,
        accessToken: controller.session?.access_token,
      });
      if (branches.length < 2) return;

      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                nextBranches: branches.map((branch) => ({
                  label: toSentenceCaseLabel(branch.label),
                  prompt: branch.prompt,
                })),
              }
            : item,
        ),
      );
    } catch {
      // Non-blocking UI enhancement: ignore branch generation failures.
    }
  }

  function resolveQuestionForAssistantMessage(messageId: string): string {
    const targetIndex = messages.findIndex((item) => item.id === messageId);
    if (targetIndex <= 0) return "";
    for (let index = targetIndex - 1; index >= 0; index -= 1) {
      const candidate = messages[index];
      if (candidate?.role === "user") {
        return (candidate.rawContent ?? candidate.content).trim();
      }
    }
    return "";
  }

  async function handleOpenChain(
    message: ChatMessage,
    options?: { forceRefresh?: boolean },
  ) {
    const forceRefresh = Boolean(options?.forceRefresh);
    if (
      !forceRefresh &&
      message.chainData &&
      Array.isArray(message.chainData.steps) &&
      message.chainData.steps.length > 0
    ) {
      setChainModalError(null);
      setChainModalMessageId(message.id);
      return;
    }
    const hasBundle = Boolean(message.mapBundle);
    if (!forceRefresh && hasBundle) {
      setChainModalError(null);
      setChainModalMessageId(message.id);
      return;
    }
    if (!forceRefresh && !hasBundle) {
      const cached = chainByMessageId[message.id];
      if (cached) {
        setChainModalError(null);
        setChainModalMessageId(message.id);
        return;
      }
    }

    if (chainBusyMessageId) return;
    setChainBusyMessageId(message.id);
    setChainModalError(null);
    setChainModalMessageId(message.id);

    try {
      if (!hasBundle || forceRefresh) {
        const bundle = await fetchTraceBundle({
          apiBaseUrl: MOBILE_ENV.API_URL,
          text: message.rawContent ?? message.content,
          accessToken: controller.session?.access_token,
        });
        if (isVisualContextBundle(bundle)) {
          setMessages((current) =>
            current.map((item) =>
              item.id === message.id ? { ...item, mapBundle: bundle } : item,
            ),
          );
          setChainModalError(null);
          return;
        }
      }

      const result = await fetchChainOfThought({
        apiBaseUrl: MOBILE_ENV.API_URL,
        question: resolveQuestionForAssistantMessage(message.id),
        answer: message.rawContent ?? message.content,
        accessToken: controller.session?.access_token,
      });
      const reasoning = result.reasoning?.trim();
      if (reasoning) {
        setChainByMessageId((current) => ({
          ...current,
          [message.id]: reasoning,
        }));
        setChainModalError(null);
        return;
      }
      throw new Error("No chain data returned.");
    } catch (nextError) {
      setChainModalError(
        nextError instanceof Error
          ? nextError.message
          : "Could not load chain of thought.",
      );
    } finally {
      setChainBusyMessageId(null);
    }
  }

  function closeChainModal() {
    setChainModalMessageId(null);
    setChainModalError(null);
  }

  async function handleQuickPrompt(entry: QuickPromptEntry) {
    if (busy) return;
    setQuickPromptBusyKey(entry.key);
    try {
      await handleSend({
        displayText: entry.displayText,
        prompt: entry.promptText,
        mode: "go_deeper_short",
      });
    } finally {
      setQuickPromptBusyKey(null);
    }
  }

  function handleResetSession() {
    handleStopStreaming();
    setMessages([]);
    setError(null);
    cancelFullMapRequest();
    setFullMapPending(false);
    setMapPendingFullMessageId(null);
    setMapSession(null);
    setActiveVisualBundle(null);
    setActiveTools([]);
    setCompletedTools([]);
    setSearchingVerses([]);
    setErroredTools([]);
    setMapPrepActive(false);
    setMapPrepCount(null);
    setMapReadyMessageId(null);
    setMapBusyMessageId(null);
    setDraft("");
    setChainBusyMessageId(null);
    setChainByMessageId({});
    setChainModalMessageId(null);
    setChainModalError(null);
  }

  function closeVersePreview() {
    setVersePreviewReference(null);
    setVersePreviewText("");
    setVersePreviewError(null);
    setVersePreviewLoading(false);
    setVersePreviewTraceLoading(false);
  }

  function openVersePreviewInReader() {
    if (!versePreviewReference) return;
    const parsed = parseScriptureReference(versePreviewReference);
    if (!parsed) return;
    if (parsed.verse !== undefined) {
      controller.queueReaderFocusTarget(
        parsed.book,
        parsed.chapter,
        parsed.verse,
      );
    }
    void controller.navigateReaderTo(parsed.book, parsed.chapter);
    nav.openReader(parsed.book, parsed.chapter);
    closeVersePreview();
  }

  async function handleTraceVersePreview() {
    if (!versePreviewReference || versePreviewTraceLoading) return;
    setVersePreviewTraceLoading(true);
    try {
      const bundle = await fetchTraceBundle({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: versePreviewReference,
        accessToken: controller.session?.access_token,
      });
      if (!isVisualContextBundle(bundle)) {
        throw new Error("Map response was malformed.");
      }
      nav.openMapViewer(versePreviewReference, bundle);
      closeVersePreview();
    } catch (nextError) {
      if (nextError instanceof Error && nextError.name === "AbortError") {
        return;
      }
      setVersePreviewError("Could not trace this verse.");
    } finally {
      setVersePreviewTraceLoading(false);
    }
  }

  const handleInlineReferencePress = useCallback((reference: string) => {
    if (!parseScriptureReference(reference)) return;
    setVersePreviewReference(reference);
  }, []);

  const chainModalMessage = chainModalMessageId
    ? messages.find((item) => item.id === chainModalMessageId) || null
    : null;
  const chainModalReasoning = chainModalMessageId
    ? chainByMessageId[chainModalMessageId] || ""
    : "";
  const chainLinks = useMemo(() => {
    if (chainModalMessage?.chainData) {
      const fromSse = buildChainLinksFromChainData(chainModalMessage.chainData);
      if (fromSse.length > 0) return fromSse;
    }
    if (chainModalMessage?.mapBundle) {
      const fromBundle = buildChainLinksFromBundle(chainModalMessage.mapBundle);
      if (fromBundle.length > 0) return fromBundle;
    }
    return buildChainLinksFromReasoning({
      reasoning: chainModalReasoning,
      message: chainModalMessage,
    });
  }, [chainModalMessage, chainModalReasoning]);
  const chainResourceItems = useMemo(() => {
    const orderedRefs: string[] = [];
    chainLinks.forEach((link, index) => {
      if (index === 0) {
        orderedRefs.push(link.from);
      }
      orderedRefs.push(link.to);
    });

    const dedupedRefs: string[] = [];
    const seen = new Set<string>();
    orderedRefs.forEach((reference) => {
      const key = normalizeReference(reference);
      if (seen.has(key)) return;
      seen.add(key);
      dedupedRefs.push(reference);
    });

    const verseTextByRef = new Map<string, string>();
    chainModalMessage?.mapBundle?.nodes?.forEach((node) => {
      const ref = `${node.book_name} ${node.chapter}:${node.verse}`;
      verseTextByRef.set(normalizeReference(ref), node.text || "");
    });

    return dedupedRefs.map((reference) => {
      const verseText = verseTextByRef.get(normalizeReference(reference)) || "";
      const snippet =
        verseText.trim().length > 0
          ? `${verseText.trim().slice(0, 128)}${verseText.trim().length > 128 ? "..." : ""}`
          : "Verse text preview unavailable.";
      return {
        reference,
        title: compactReferenceLabel(reference),
        snippet,
        tappable: Boolean(parseScriptureReference(reference)),
      };
    });
  }, [chainLinks, chainModalMessage?.mapBundle?.nodes]);

  function handleChainVersePress(reference: string, tappable: boolean) {
    if (!tappable) return;
    closeChainModal();
    handleInlineReferencePress(reference);
  }

  function handleNextBranchPress(
    message: ChatMessage,
    branch: NextBranchOption,
  ) {
    if (busy) return;
    setMessages((current) =>
      current.map((item) =>
        item.role === "assistant" && item.nextBranches
          ? { ...item, nextBranches: undefined }
          : item,
      ),
    );
    void handleSend({
      displayText: branch.label,
      prompt: branch.prompt,
      mode: "go_deeper_short",
      visualBundle: message.mapBundle ?? activeVisualBundle ?? undefined,
      mapSession: mapSession ?? undefined,
    });
  }

  const composerBlock = (
    <View
      style={[
        localStyles.chatComposerWrap,
        keyboardVisible ? localStyles.chatComposerWrapKeyboard : null,
        keyboardLift > 0 ? { marginBottom: keyboardLift + 10 } : null,
      ]}
    >
      {error ? (
        <View style={localStyles.errorBanner}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : null}
      {isEmptyState ? (
        <View style={localStyles.quickPromptRail}>
          {showEmptyThreadChips ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={localStyles.quickPromptRow}
              style={localStyles.quickPromptScroller}
            >
              {quickPromptEntries.map((entry) => (
                <PressableScale
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityLabel={entry.label}
                  disabled={busy || randomTopicsLoading}
                  onPress={() => void handleQuickPrompt(entry)}
                  pressedStyle={localStyles.quickPromptButtonPressed}
                  style={[
                    localStyles.quickPromptButton,
                    entry.key === "ot"
                      ? localStyles.quickPromptButtonOT
                      : entry.key === "nt"
                        ? localStyles.quickPromptButtonNT
                        : localStyles.quickPromptButtonRandom,
                    quickPromptBusyKey === entry.key
                      ? localStyles.quickPromptButtonBusy
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      localStyles.quickPromptLabel,
                      entry.key === "ot"
                        ? localStyles.quickPromptLabelOT
                        : entry.key === "nt"
                          ? localStyles.quickPromptLabelNT
                          : localStyles.quickPromptLabelRandom,
                    ]}
                  >
                    {entry.label}
                  </Text>
                  <Text numberOfLines={1} style={localStyles.quickPromptTopic}>
                    {quickPromptBusyKey === entry.key
                      ? "Sending..."
                      : entry.title}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
          ) : (
            <View style={localStyles.quickPromptRailPlaceholder} />
          )}
        </View>
      ) : null}
      <View style={localStyles.chatComposer}>
        <IconButton
          accessibilityLabel={
            traceModeEnabled ? "Trace mode enabled" : "Trace mode disabled"
          }
          onPress={() => setTraceModeEnabled((current) => !current)}
          shape="rounded"
          tone={traceModeEnabled ? "accent" : "default"}
          style={[
            localStyles.traceToggleButton,
            traceModeEnabled ? localStyles.traceToggleButtonActive : null,
          ]}
          icon={
            <Ionicons
              color={traceModeEnabled ? T.colors.accent : T.colors.textMuted}
              name="git-network-outline"
              size={16}
            />
          }
        />
        <TextInput
          ref={composerInputRef}
          autoFocus={false}
          keyboardAppearance="dark"
          multiline
          placeholder={
            traceModeEnabled
              ? "Ask and trace relationships..."
              : "Ask a Bible study question..."
          }
          placeholderTextColor={T.colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          style={localStyles.chatInput}
        />
        <IconButton
          accessibilityLabel={busy ? "Stop generating" : "Send message"}
          disabled={!busy && !canSendDraft}
          onPress={() => (busy ? handleStopStreaming() : void handleSend())}
          shape="rounded"
          tone={busy ? "danger" : canSendDraft ? "accent" : "default"}
          style={[
            localStyles.sendButton,
            !busy && !canSendDraft ? localStyles.sendButtonDisabled : null,
            !busy && canSendDraft ? localStyles.sendButtonReady : null,
            busy ? localStyles.sendButtonStop : null,
          ]}
          icon={
            <Ionicons
              color={
                busy
                  ? "rgba(254,202,202,0.95)"
                  : canSendDraft
                    ? T.colors.accent
                    : T.colors.textMuted
              }
              name={busy ? "stop" : "arrow-up"}
              size={14}
            />
          }
        />
      </View>
      {!isEmptyState ? (
        <ChipButton
          accessibilityLabel="Start a new session"
          disabled={busy}
          onPress={handleResetSession}
          label="New Session"
          style={localStyles.newSessionButton}
          labelStyle={localStyles.newSessionButtonLabel}
        />
      ) : null}
    </View>
  );

  return (
    <View style={localStyles.chatRoot}>
      {showCenteredEmptyState ? (
        <View
          style={[
            localStyles.emptyLayout,
            keyboardVisible ? localStyles.emptyLayoutKeyboard : null,
          ]}
        >
          <View style={localStyles.emptyState}></View>
          <View style={localStyles.emptyComposerSlot}>{composerBlock}</View>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            style={localStyles.chatList}
            contentContainerStyle={[
              localStyles.chatListContent,
              isEmptyState ? localStyles.chatListContentEmpty : null,
            ]}
            renderItem={({ item }) => {
              const isThinkingMessage =
                item.role === "assistant" &&
                busy &&
                item.content.trim().length === 0;
              const isStreamingAssistantMessage =
                item.role === "assistant" &&
                busy &&
                item.id === streamTargetMessageIdRef.current;
              const hasMapBundle = Boolean(item.mapBundle);
              const isMapReady = mapReadyMessageId === item.id;
              const isMapPendingFull = mapBusyMessageId === item.id;
              const isMapPendingRicher =
                mapPendingFullMessageId === item.id && fullMapPending;
              const mapVerseCount = item.mapBundle?.nodes.length ?? 0;
              const showMessageMapStatus =
                item.role === "assistant" &&
                (hasMapBundle ||
                  isMapPendingFull ||
                  isMapPendingRicher ||
                  typeof item.connectionCount === "number");
              return (
                <View
                  style={[
                    localStyles.messageRow,
                    item.role === "user"
                      ? localStyles.messageRowUser
                      : localStyles.messageRowAssistant,
                  ]}
                >
                  <View
                    style={[
                      localStyles.messageBubble,
                      item.role === "user"
                        ? localStyles.userBubble
                        : localStyles.assistantBubble,
                    ]}
                  >
                    {item.role !== "assistant" ? (
                      <Text style={localStyles.messageText}>
                        {item.content}
                      </Text>
                    ) : null}

                    {item.role === "assistant" && !isThinkingMessage ? (
                      <AssistantRichText
                        content={item.content || (busy ? "..." : "")}
                        onReferencePress={handleInlineReferencePress}
                      />
                    ) : null}

                    {isThinkingMessage ? (
                      <View style={localStyles.thinkingStateSlot}>
                        <ChatThinkingState
                          verses={[]}
                          tracedText="Connections across Scripture"
                          activeTools={[]}
                          completedTools={[]}
                        />
                      </View>
                    ) : null}

                    {item.citations &&
                    item.citations.length > 0 &&
                    !containsScriptureReference(item.content) ? (
                      <View style={localStyles.citationRow}>
                        {item.citations.slice(0, 6).map((citation) => (
                          <PressableScale
                            key={`${item.id}-${citation}`}
                            onPress={() => handleInlineReferencePress(citation)}
                            style={localStyles.citationChip}
                          >
                            <Text style={localStyles.citationChipLabel}>
                              {citation}
                            </Text>
                          </PressableScale>
                        ))}
                      </View>
                    ) : null}

                    {isStreamingAssistantMessage &&
                    (mapPrepActive || searchingVerses.length > 0) ? (
                      <Animated.View
                        style={[
                          localStyles.streamStatusRow,
                          { opacity: statusPulse },
                        ]}
                      >
                        <View style={localStyles.statusChipMapPrep}>
                          <Text style={localStyles.statusChipMapPrepLabel}>
                            Preparing map
                          </Text>
                        </View>
                        {(mapPrepCount !== null && mapPrepCount > 0) ||
                        searchingVerses.length > 0 ? (
                          <View style={localStyles.statusChip}>
                            <Text style={localStyles.statusChipLabel}>
                              {mapPrepCount !== null && mapPrepCount > 0
                                ? mapPrepCount
                                : searchingVerses.length}{" "}
                              verse
                              {(mapPrepCount !== null && mapPrepCount > 0
                                ? mapPrepCount
                                : searchingVerses.length) === 1
                                ? ""
                                : "s"}{" "}
                              found
                            </Text>
                          </View>
                        ) : null}
                      </Animated.View>
                    ) : null}

                    {item.role === "assistant" &&
                    item.content.trim().length > 0 &&
                    !isStreamingAssistantMessage ? (
                      <View>
                        <View style={localStyles.messageActionRow}>
                          <ActionButton
                            variant="secondary"
                            disabled={mapBusyMessageId === item.id}
                            label={
                              mapBusyMessageId === item.id
                                ? "Mapping..."
                                : isMapPendingRicher
                                  ? "Loading full map"
                                  : item.mapBundle
                                    ? "View map"
                                    : "Open map"
                            }
                            onPress={() => {
                              if (item.mapBundle) {
                                nav.openMapViewer(
                                  `Map (${item.mapBundle?.nodes.length ?? 0} verses)`,
                                  item.mapBundle,
                                );
                                return;
                              }
                              void handleGenerateMap(item);
                            }}
                            style={localStyles.compactAction}
                            labelStyle={localStyles.compactActionLabel}
                          />
                          <ActionButton
                            variant="ghost"
                            disabled={chainBusyMessageId === item.id}
                            label={
                              chainBusyMessageId === item.id
                                ? "Thinking..."
                                : "Chain"
                            }
                            onPress={() => void handleOpenChain(item)}
                            style={localStyles.compactAction}
                            labelStyle={localStyles.compactActionLabel}
                          />
                        </View>
                        {showMessageMapStatus ? (
                          <View style={localStyles.streamStatusRow}>
                            {isMapPendingFull ? (
                              <View style={localStyles.statusChipMapPrep}>
                                <Text
                                  style={localStyles.statusChipMapPrepLabel}
                                >
                                  Loading full map
                                </Text>
                              </View>
                            ) : null}
                            {isMapPendingRicher ? (
                              <View style={localStyles.statusChipMapPrep}>
                                <Text
                                  style={localStyles.statusChipMapPrepLabel}
                                >
                                  Loading full map
                                </Text>
                              </View>
                            ) : null}
                            {hasMapBundle ? (
                              <View
                                style={
                                  isMapReady
                                    ? [
                                        localStyles.statusChip,
                                        localStyles.statusChipDone,
                                      ]
                                    : localStyles.statusChip
                                }
                              >
                                <Text style={localStyles.statusChipLabel}>
                                  Map ready
                                </Text>
                              </View>
                            ) : null}
                            {typeof item.connectionCount === "number" ? (
                              <View style={localStyles.statusChip}>
                                <Text style={localStyles.statusChipLabel}>
                                  {item.connectionCount} connection
                                  {item.connectionCount === 1 ? "" : "s"}
                                </Text>
                              </View>
                            ) : null}
                            {hasMapBundle ? (
                              <Text style={localStyles.mapReadyMeta}>
                                {isMapPendingFull || isMapPendingRicher
                                  ? "Richer connections loading"
                                  : `Map ready - ${mapVerseCount} verse${mapVerseCount === 1 ? "" : "s"}`}
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                        {item.nextBranches && item.nextBranches.length > 0 ? (
                          <View style={localStyles.nextBranchList}>
                            {item.nextBranches
                              .slice(0, 2)
                              .map((branch, idx, arr) => (
                                <View key={`${item.id}-branch-${idx}`}>
                                  <PressableScale
                                    accessibilityRole="button"
                                    accessibilityLabel={branch.label}
                                    disabled={busy}
                                    onPress={() =>
                                      handleNextBranchPress(item, branch)
                                    }
                                    style={localStyles.nextBranchRow}
                                  >
                                    <Ionicons
                                      color={T.colors.text}
                                      name="return-down-forward-outline"
                                      size={14}
                                      style={localStyles.nextBranchArrowIcon}
                                    />
                                    <Text style={localStyles.nextBranchLabel}>
                                      {toSentenceCaseLabel(branch.label)}
                                    </Text>
                                  </PressableScale>
                                  {idx < arr.length - 1 ? (
                                    <View
                                      style={localStyles.nextBranchDivider}
                                    />
                                  ) : null}
                                </View>
                              ))}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            }}
          />
          {composerBlock}
        </>
      )}

      <BottomSheetSurface
        visible={Boolean(versePreviewReference)}
        onClose={closeVersePreview}
        title={versePreviewReference || "Verse"}
        snapPoints={["54%"]}
      >
        <View style={localStyles.referenceModalCard}>
          <View style={localStyles.referenceModalBody}>
            {versePreviewLoading ? (
              <LoadingDotsNative label="Loading verse..." />
            ) : null}
            {versePreviewError ? (
              <Text style={styles.error}>{versePreviewError}</Text>
            ) : null}
            {!versePreviewLoading && !versePreviewError ? (
              <Text style={localStyles.referenceModalVerseText}>
                {versePreviewText || "Could not load verse text"}
              </Text>
            ) : null}
          </View>

          <View style={localStyles.referenceModalActions}>
            <ActionButton
              label={versePreviewTraceLoading ? "Tracing..." : "Trace"}
              variant="primary"
              disabled={versePreviewTraceLoading}
              onPress={() => void handleTraceVersePreview()}
              style={localStyles.compactAction}
              labelStyle={localStyles.compactActionLabel}
            />
            <ActionButton
              label="Open in Bible"
              variant="secondary"
              onPress={openVersePreviewInReader}
              style={localStyles.compactAction}
              labelStyle={localStyles.compactActionLabel}
            />
          </View>
        </View>
      </BottomSheetSurface>

      <BottomSheetSurface
        visible={Boolean(chainModalMessageId)}
        onClose={closeChainModal}
        title="Verses Used"
        subtitle="Verses used in this response."
        snapPoints={["62%"]}
        enableDynamicSizing={false}
      >
        <View style={localStyles.chainModalCard}>
          <View style={localStyles.chainModalBody}>
            {chainBusyMessageId === chainModalMessageId ? (
              <LoadingDotsNative label="Building chain..." />
            ) : null}
            {chainModalError ? (
              <Text style={styles.error}>{chainModalError}</Text>
            ) : null}
            {chainResourceItems.length > 0 &&
            chainBusyMessageId !== chainModalMessageId ? (
              <BottomSheetScrollView style={localStyles.chainModalScroll}>
                <View style={localStyles.chainResourceList}>
                  {chainResourceItems.map((item, index) => (
                    <View key={`chain-resource-${index}-${item.reference}`}>
                      <PressableScale
                        disabled={!item.tappable}
                        onPress={() =>
                          handleChainVersePress(item.reference, item.tappable)
                        }
                        style={[
                          localStyles.chainResourceRow,
                          !item.tappable
                            ? localStyles.chainResourceRowMuted
                            : null,
                        ]}
                      >
                        <Text style={localStyles.chainResourceTitle}>
                          {item.title}
                        </Text>
                        <Text
                          numberOfLines={2}
                          style={localStyles.chainResourceSnippet}
                        >
                          {item.snippet}
                        </Text>
                      </PressableScale>
                      {index < chainResourceItems.length - 1 ? (
                        <View style={localStyles.chainResourceDivider} />
                      ) : null}
                    </View>
                  ))}
                </View>
              </BottomSheetScrollView>
            ) : null}
          </View>

          <View style={localStyles.chainModalActions}>
            {chainModalMessageId && chainModalError ? (
              <ActionButton
                label="Retry"
                variant="secondary"
                onPress={() => {
                  const target = messages.find(
                    (item) => item.id === chainModalMessageId,
                  );
                  if (target) {
                    void handleOpenChain(target, { forceRefresh: true });
                  }
                }}
                style={localStyles.compactAction}
                labelStyle={localStyles.compactActionLabel}
              />
            ) : null}
          </View>
        </View>
      </BottomSheetSurface>
    </View>
  );
}

function getMapEdgeColor(edgeType: string): string {
  switch (edgeType) {
    case "ROOTS":
      return "rgba(212, 175, 55, 0.82)";
    case "ECHOES":
      return "rgba(147, 197, 253, 0.72)";
    case "PROPHECY":
      return "rgba(103, 232, 249, 0.82)";
    case "TYPOLOGY":
      return "rgba(196, 181, 253, 0.78)";
    case "FULFILLMENT":
      return "rgba(74, 222, 128, 0.8)";
    case "CONTRAST":
      return "rgba(251, 146, 60, 0.75)";
    case "PROGRESSION":
      return "rgba(244, 114, 182, 0.75)";
    case "PATTERN":
      return "rgba(226, 232, 240, 0.68)";
    case "GENEALOGY":
      return "rgba(253, 224, 71, 0.72)";
    case "NARRATIVE":
      return "rgba(148, 163, 184, 0.66)";
    case "ALLUSION":
      return "rgba(125, 211, 252, 0.68)";
    default:
      return "rgba(212, 175, 55, 0.5)";
  }
}

function resolveConnectionChip(
  edgeType: VisualEdge["type"],
  metadata?: Record<string, unknown>,
) {
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
}

function getMapNodeFrame(node: VisualNode) {
  return getNarrativeMapNodeDimensions(
    node as NarrativeMapGraphNode,
    node.depth === 0,
  );
}

function getMapNodeLabel(node: VisualNode) {
  if (node.displayLabel?.trim()) return node.displayLabel.trim();
  const bookName = node.book_name || node.book_abbrev || "";
  return `${bookName} ${node.chapter}:${node.verse}`;
}

function getConnectionFamilyColor(styleType: MapConnectionFamily) {
  switch (styleType) {
    case "LEXICON":
      return "#FCD34D";
    case "ECHO":
      return "#A5B4FC";
    case "FULFILLMENT":
      return "#67E8F9";
    case "PATTERN":
      return "#C4B5FD";
    case "CROSS_REFERENCE":
      return "#86EFAC";
    case "GREY":
    default:
      return "#94A3B8";
  }
}

function getConnectionFamilyLabel(styleType: MapConnectionFamily) {
  switch (styleType) {
    case "LEXICON":
      return "Lexicon";
    case "ECHO":
      return "Echo";
    case "FULFILLMENT":
      return "Fulfillment";
    case "PATTERN":
      return "Pattern";
    case "CROSS_REFERENCE":
      return "Cross-Reference";
    case "GREY":
    default:
      return "Neutral";
  }
}

function getMapNodeSubtitle(node: VisualNode): string | null {
  if (node.displaySubLabel?.trim()) return node.displaySubLabel.trim();
  // pericopeTitle is rendered as an eyebrow inside the inspector body,
  // not as the sheet subtitle — avoids duplication
  return null;
}

function normalizeMapReferenceToken(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function makeMapVerseKey(book: string, chapter: number, verse: number) {
  return `${normalizeMapReferenceToken(book)}:${chapter}:${verse}`;
}

function getDedupedParallelPassages(node: VisualNode): MapParallelPassage[] {
  const primaryTokens = [node.book_name, node.book_abbrev]
    .filter(Boolean)
    .map((value) => normalizeMapReferenceToken(value));
  const primaryKey = makeMapVerseKey(
    node.book_name || node.book_abbrev || "",
    node.chapter,
    node.verse,
  );
  const seenKeys = new Set<string>();

  return (node.parallelPassages || []).filter((parallel) => {
    if (parallel.id === node.id) return false;
    const key = makeMapVerseKey(
      parallel.book_name || parallel.book_abbrev || "",
      parallel.chapter,
      parallel.verse,
    );
    if (key === primaryKey || seenKeys.has(key)) return false;

    const normalizedReference = parallel.reference
      .toLowerCase()
      .replace(/\s+/g, "");
    const sameVerseToken = `${node.chapter}:${node.verse}`;
    const sameReference =
      normalizedReference.includes(sameVerseToken) &&
      primaryTokens.some((token) => normalizedReference.includes(token));
    if (sameReference) return false;

    seenKeys.add(key);
    return true;
  });
}

function getParallelSimilarityTone(similarity: number) {
  if (similarity >= 0.95) {
    return {
      opacity: 1,
      referenceWeight: "700" as const,
    };
  }
  if (similarity >= 0.93) {
    return {
      opacity: 1,
      referenceWeight: "600" as const,
    };
  }
  return {
    opacity: 0.72,
    referenceWeight: "600" as const,
  };
}

function isLlmDiscoveredEdge(edge: VisualEdge): boolean {
  return edge.metadata?.source === "llm";
}

function getEdgeExplanation(edge: VisualEdge): string | null {
  const explanation = edge.metadata?.explanation;
  return typeof explanation === "string" && explanation.trim().length > 0
    ? explanation.trim()
    : null;
}

function getDiscoveryCandidateNodes(
  bundle: VisualContextBundle,
  analyzedVerseIds: Set<number>,
): VisualNode[] {
  const availableNodes = bundle.nodes.filter(
    (node) => !analyzedVerseIds.has(node.id),
  );
  if (availableNodes.length <= 12) {
    return availableNodes;
  }

  const selected = new Set<number>();
  const anchor = availableNodes.find((node) => node.depth === 0);
  if (anchor) selected.add(anchor.id);

  availableNodes
    .filter((node) => node.isSpine)
    .forEach((node) => selected.add(node.id));

  const centrality = new Map<number, number>();
  availableNodes.forEach((node) => {
    const connections = bundle.edges.filter(
      (edge) => edge.from === node.id || edge.to === node.id,
    ).length;
    centrality.set(node.id, connections);
  });

  const remaining = availableNodes
    .filter((node) => !selected.has(node.id))
    .sort((a, b) => {
      const aCentrality = centrality.get(a.id) || 0;
      const bCentrality = centrality.get(b.id) || 0;
      if (bCentrality !== aCentrality) {
        return bCentrality - aCentrality;
      }
      return a.depth - b.depth;
    })
    .slice(0, Math.max(12 - selected.size, 0));

  remaining.forEach((node) => selected.add(node.id));
  return availableNodes.filter((node) => selected.has(node.id)).slice(0, 12);
}

function mergeDiscoveredConnections(
  bundle: VisualContextBundle,
  connections: Array<{
    from: number;
    to: number;
    type: VisualEdge["type"];
    explanation: string;
    confidence: number;
  }>,
) {
  const existingKeys = new Set(
    bundle.edges.map((edge) => buildEdgeKey(edge.type, edge.from, edge.to)),
  );
  const discoveredEdges: VisualEdge[] = [];

  connections.forEach((connection) => {
    const key = buildEdgeKey(connection.type, connection.from, connection.to);
    if (existingKeys.has(key)) return;
    discoveredEdges.push({
      from: connection.from,
      to: connection.to,
      type: connection.type,
      weight: connection.confidence,
      metadata: {
        source: "llm",
        explanation: connection.explanation,
        confidence: connection.confidence,
      },
    });
    existingKeys.add(key);
  });

  if (discoveredEdges.length === 0) {
    return { bundle, addedCount: 0 };
  }

  return {
    bundle: {
      ...bundle,
      edges: [...bundle.edges, ...discoveredEdges],
    },
    addedCount: discoveredEdges.length,
  };
}

function getNodeBoundaryPoint(
  from: MapNodeLayout,
  to: MapNodeLayout,
  frame: { width: number; height: number },
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const halfWidth = frame.width / 2;
  const halfHeight = frame.height / 2;

  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
    return { x: from.x, y: from.y };
  }

  const scale = Math.min(
    halfWidth / Math.max(Math.abs(dx), 0.001),
    halfHeight / Math.max(Math.abs(dy), 0.001),
  );

  return {
    x: from.x + dx * scale,
    y: from.y + dy * scale,
  };
}

function buildMapEdgePath(from: MapNodeLayout, to: MapNodeLayout) {
  const fromFrame = getMapNodeFrame(from);
  const toFrame = getMapNodeFrame(to);
  const start = getNodeBoundaryPoint(from, to, fromFrame);
  const end = getNodeBoundaryPoint(to, from, toFrame);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const curveStrength = Math.min(140, Math.max(42, distance * 0.34));

  let control1 = { x: start.x, y: start.y };
  let control2 = { x: end.x, y: end.y };

  if (Math.abs(dx) >= Math.abs(dy)) {
    control1 = { x: start.x + curveStrength, y: start.y };
    control2 = { x: end.x - curveStrength, y: end.y };
  } else {
    const verticalDirection = dy >= 0 ? 1 : -1;
    control1 = { x: start.x, y: start.y + curveStrength * verticalDirection };
    control2 = { x: end.x, y: end.y - curveStrength * verticalDirection };
  }

  return {
    d: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
    start,
    end,
    control1,
    control2,
  };
}

function getCubicBezierPoint(
  t: number,
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
) {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x:
      mt2 * mt * start.x +
      3 * mt2 * t * control1.x +
      3 * mt * t2 * control2.x +
      t2 * t * end.x,
    y:
      mt2 * mt * start.y +
      3 * mt2 * t * control1.y +
      3 * mt * t2 * control2.y +
      t2 * t * end.y,
  };
}

function isSvgRuntimeAvailable() {
  if (Platform.OS === "web") return true;
  const getConfig = UIManager.getViewManagerConfig?.bind(UIManager);
  if (!getConfig) return false;
  return Boolean(
    getConfig("RNSVGSvgView") ||
      getConfig("RNSVGView") ||
      getConfig("RNSVGGroup"),
  );
}

function MapEdge({
  edge,
  from,
  to,
  dimmed,
  selected,
  onPress,
  entranceReady,
  staggerDelay,
}: {
  edge: MapRenderableEdge;
  from: MapNodeLayout;
  to: MapNodeLayout;
  dimmed: boolean;
  selected: boolean;
  onPress: () => void;
  entranceReady: boolean;
  staggerDelay: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!entranceReady) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), staggerDelay);
    return () => clearTimeout(timer);
  }, [entranceReady, staggerDelay]);

  const appearance = getMapEdgeAppearance(edge);
  const path = buildMapEdgePath(from, to);
  const entranceScale = visible ? 1 : 0;
  const strokeOpacity =
    (dimmed ? 0.03 : selected ? 1 : appearance.opacity) * entranceScale;
  const glowOpacity = (dimmed ? 0.06 : selected ? 0.5 : 0.2) * entranceScale;

  return (
    <>
      <SvgPath
        d={path.d}
        fill="none"
        stroke={appearance.glow}
        strokeLinecap="round"
        strokeWidth={selected ? appearance.width + 5 : appearance.width + 2.4}
        opacity={glowOpacity}
        pointerEvents="none"
      />
      <SvgPath
        accessibilityLabel={
          edge.isSynthetic
            ? undefined
            : `${edgeTypeToConceptLabel(edge.type)} between ${formatNodeReference(from)} and ${formatNodeReference(to)}`
        }
        d={path.d}
        fill="none"
        onPress={edge.isSynthetic ? undefined : onPress}
        stroke={appearance.stroke}
        strokeLinecap="round"
        strokeOpacity={strokeOpacity}
        strokeWidth={selected ? appearance.width + 1.25 : appearance.width}
      />
      {!edge.isSynthetic ? (
        <SvgPath
          d={path.d}
          fill="none"
          onPress={onPress}
          stroke="rgba(255,255,255,0.001)"
          strokeLinecap="round"
          strokeWidth={18}
        />
      ) : null}
    </>
  );
}

function MapEdgeFallback({
  edge,
  from,
  to,
  dimmed,
  selected,
  onPress,
  entranceReady,
  staggerDelay,
}: {
  edge: MapRenderableEdge;
  from: MapNodeLayout;
  to: MapNodeLayout;
  dimmed: boolean;
  selected: boolean;
  onPress: () => void;
  entranceReady: boolean;
  staggerDelay: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!entranceReady) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), staggerDelay);
    return () => clearTimeout(timer);
  }, [entranceReady, staggerDelay]);

  const appearance = getMapEdgeAppearance(edge);
  const path = buildMapEdgePath(from, to);
  const isInteractive = !edge.isSynthetic;
  const totalDistance = Math.sqrt(
    (path.end.x - path.start.x) * (path.end.x - path.start.x) +
      (path.end.y - path.start.y) * (path.end.y - path.start.y),
  );
  const segmentCount = Math.max(24, Math.ceil(totalDistance / 10));
  const segmentHeight = 24;
  const segmentOverlap = 8;
  const minX = Math.min(path.start.x, path.end.x) - 18;
  const minY = Math.min(path.start.y, path.end.y) - 28;
  const hitboxWidth = Math.abs(path.end.x - path.start.x) + 36;
  const hitboxHeight = Math.abs(path.end.y - path.start.y) + 56;
  const segments = Array.from({ length: segmentCount }, (_value, index) => {
    const startT = index / segmentCount;
    const endT = (index + 1) / segmentCount;
    const startPoint = getCubicBezierPoint(
      startT,
      path.start,
      path.control1,
      path.control2,
      path.end,
    );
    const endPoint = getCubicBezierPoint(
      endT,
      path.start,
      path.control1,
      path.control2,
      path.end,
    );
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const centerPoint = {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2,
    };
    const width = Math.max(length + segmentOverlap, 4);
    return {
      key: `${edge.id}-seg-${index}`,
      left: centerPoint.x - width / 2,
      top: centerPoint.y - segmentHeight / 2,
      width,
      height: segmentHeight,
      angleDeg,
    };
  });

  return (
    <Pressable
      accessibilityRole={isInteractive ? "button" : undefined}
      accessibilityLabel={
        isInteractive
          ? `${edgeTypeToConceptLabel(edge.type)} between ${formatNodeReference(from)} and ${formatNodeReference(to)}`
          : undefined
      }
      disabled={!isInteractive}
      onPress={isInteractive ? onPress : undefined}
      style={[
        localStyles.edgeFallbackHitbox,
        {
          left: minX,
          top: minY,
          width: hitboxWidth,
          height: hitboxHeight,
        },
      ]}
    >
      {segments.map((segment) => (
        <View
          key={segment.key}
          pointerEvents="none"
          style={[
            localStyles.edgeFallbackSegment,
            {
              left: segment.left - minX,
              top: segment.top - minY,
              width: segment.width,
              height: segment.height,
              transform: [{ rotate: `${segment.angleDeg}deg` }],
            },
          ]}
        >
          <View
            style={[
              localStyles.edgeFallbackGlow,
              {
                backgroundColor: appearance.glow,
                opacity:
                  (dimmed ? 0.05 : selected ? 0.34 : 0.16) * (visible ? 1 : 0),
              },
            ]}
          />
          <View
            style={[
              localStyles.edgeFallbackLine,
              {
                backgroundColor:
                  edge.isSynthetic || edge.styleType === "GREY"
                    ? "rgba(148,163,184,0.26)"
                    : typeof appearance.stroke === "string" &&
                        !appearance.stroke.startsWith("url(")
                      ? appearance.stroke
                      : "rgba(248,250,252,0.78)",
                opacity:
                  (dimmed ? 0.03 : selected ? 1 : appearance.opacity) *
                  (visible ? 1 : 0),
                height: selected ? appearance.width + 1.2 : appearance.width,
              },
            ]}
          />
        </View>
      ))}
    </Pressable>
  );
}

function AnimatedMapNode({
  depth,
  children,
}: {
  depth: number;
  children: ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const delay = Math.min(depth * 80, 800);
    const timer = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [-8, 0],
            }),
          },
          {
            scale: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.97, 1],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function MapViewerScreen({
  title,
  bundle,
  traceQuery,
}: {
  title?: string;
  bundle?: unknown;
  traceQuery?: string;
}) {
  const controller = useMobileApp();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const insets = useSafeAreaInsets();
  const layoutMode = useLayoutMode();
  const initialBundle = isVisualContextBundle(bundle) ? bundle : null;
  const [workingBundle, setWorkingBundle] =
    useState<VisualContextBundle | null>(initialBundle);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<number | null>(null);
  const [parallelSourceNode, setParallelSourceNode] =
    useState<MapNodeLayout | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<MapEdgeSelection | null>(
    null,
  );
  // Which topic's analysis is loaded (drives synopsis fetch)
  const [activeTopicStyle, setActiveTopicStyle] =
    useState<MapConnectionFamily | null>(null);
  // Which topic is visually highlighted (arrow/dot navigation — no fetch)
  const [highlightedTopicStyle, setHighlightedTopicStyle] =
    useState<MapConnectionFamily | null>(null);
  const [helpVisible, setHelpVisible] = useState(false);
  const [mapMenuVisible, setMapMenuVisible] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewportSize, setViewportSize] = useState<MapViewportSize>({
    width: 0,
    height: 0,
  });
  const [discovering, setDiscovering] = useState(false);
  const [discoveryStatus, setDiscoveryStatus] = useState<string | null>(null);
  const [, setDiscoveryError] = useState<string | null>(null);
  const [analyzedVerseIds, setAnalyzedVerseIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [edgeAnalysis, setEdgeAnalysis] = useState<MapEdgeAnalysis | null>(
    null,
  );
  const [edgeAnalysisLoading, setEdgeAnalysisLoading] = useState(false);
  const [edgeAnalysisError, setEdgeAnalysisError] = useState<string | null>(
    null,
  );
  const [showAllConnectionVerses, setShowAllConnectionVerses] = useState(false);
  const [edgeNoteDraft, setEdgeNoteDraft] = useState("");
  const [edgeTagsDraft, setEdgeTagsDraft] = useState("");
  const [edgeMetaSaved, setEdgeMetaSaved] = useState(false);
  const [mapVersePreviewRef, setMapVersePreviewRef] = useState<string | null>(
    null,
  );
  const [mapVersePreviewText, setMapVersePreviewText] = useState("");
  const [mapVersePreviewLoading, setMapVersePreviewLoading] = useState(false);
  const mapVersePreviewRequestIdRef = useRef(0);
  const autoDiscoveryRunRef = useRef(false);
  const [edgesAnimated, setEdgesAnimated] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaderDismissed, setMapLoaderDismissed] = useState(false);
  const mapMountTimeRef = useRef(Date.now());
  const mapLoaderFadeAnim = useRef(new Animated.Value(1)).current;
  const [awePulseActive, setAwePulseActive] = useState(false);
  const awePulseAnim = useRef(new Animated.Value(0)).current;
  const pendingViewportFitRef = useRef(true);
  const topicTitlesRequestRef = useRef(0);
  const edgeAnalysisCacheRef = useRef<Map<string, MapEdgeAnalysis>>(new Map());
  const panRef = useRef(pan);
  const scaleRef = useRef(scale);
  const viewportSizeRef = useRef(viewportSize);
  const gestureStateRef = useRef<{
    mode: "idle" | "pan" | "pinch";
    startPan: { x: number; y: number };
    startScale: number;
    startTouch: { x: number; y: number };
    startDistance: number;
    startMidpoint: { x: number; y: number };
  }>({
    mode: "idle",
    startPan: { x: 0, y: 0 },
    startScale: 1,
    startTouch: { x: 0, y: 0 },
    startDistance: 0,
    startMidpoint: { x: 0, y: 0 },
  });
  // Self-fetch: when navigated with traceQuery but no bundle, fetch it here
  const traceFetchedRef = useRef(false);
  useEffect(() => {
    if (traceFetchedRef.current || !traceQuery || initialBundle) return;
    traceFetchedRef.current = true;
    (async () => {
      try {
        const result = await fetchTraceBundle({
          apiBaseUrl: MOBILE_ENV.API_URL,
          text: traceQuery,
          accessToken: controller.session?.access_token,
        });
        if (isVisualContextBundle(result)) {
          setWorkingBundle(result);
        }
      } catch {
        // Fetch failed — map will show "unavailable" state
      }
    })();
  }, [traceQuery, initialBundle]);

  const activeBundle = useMemo(
    () => collapseDuplicateBundle(workingBundle),
    [workingBundle],
  );

  const derivedGraph = useMemo(
    () => (activeBundle ? deriveNarrativeMapGraph(activeBundle) : null),
    [activeBundle],
  );
  const mapNodes = derivedGraph?.nodes ?? [];
  const mapEdges = derivedGraph?.edges ?? [];
  const nodeLookup = useMemo(
    () => new Map(mapNodes.map((node) => [node.id, node])),
    [mapNodes],
  );
  const edgeLookup = useMemo(
    () => new Map(mapEdges.map((edge) => [edge.id, edge])),
    [mapEdges],
  );
  const connectionCounts = useMemo(() => {
    const counts = new Map<number, number>();
    mapEdges.forEach((edge) => {
      if (edge.isSynthetic || edge.styleType === "GREY") return;
      counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
      counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
    });
    return counts;
  }, [mapEdges]);
  const selectedNode = selectedNodeId ? nodeLookup.get(selectedNodeId) : null;
  const selectedNodeParallelPassages = useMemo(
    () => (selectedNode ? getDedupedParallelPassages(selectedNode) : []),
    [selectedNode],
  );
  const selectedParallelPassages = useMemo(
    () =>
      parallelSourceNode ? getDedupedParallelPassages(parallelSourceNode) : [],
    [parallelSourceNode],
  );
  const buildConnectionTopics = useCallback(
    (nodeId: number) => {
      if (!activeBundle) return null;
      const verse = nodeLookup.get(nodeId);
      if (!verse) return null;

      const incidentEdges = mapEdges.filter(
        (edge) =>
          (edge.from === nodeId || edge.to === nodeId) &&
          !edge.isSynthetic &&
          edge.styleType !== "GREY",
      );

      const groups = new Map<
        MapConnectionFamily,
        { edgeIds: Set<string>; verseIds: Set<number>; chips: Set<string> }
      >();

      incidentEdges.forEach((edge) => {
        const otherId = edge.from === nodeId ? edge.to : edge.from;
        if (!groups.has(edge.styleType)) {
          groups.set(edge.styleType, {
            edgeIds: new Set<string>(),
            verseIds: new Set<number>(),
            chips: new Set<string>(),
          });
        }
        const entry = groups.get(edge.styleType);
        entry?.edgeIds.add(edge.id);
        entry?.verseIds.add(otherId);
        const chip = resolveConnectionChip(
          edge.type,
          edge.metadata as Record<string, unknown> | undefined,
        );
        if (chip) entry?.chips.add(chip);
      });

      const topicGroups = Array.from(groups.entries())
        .map(([styleType, entry]) => ({
          styleType,
          label: getConnectionFamilyLabel(styleType),
          displayLabel: getConnectionFamilyLabel(styleType),
          labelSource: "canonical" as const,
          color: getConnectionFamilyColor(styleType),
          count: entry.verseIds.size,
          chips: Array.from(entry.chips),
          verseIds: Array.from(entry.verseIds),
          edgeIds: Array.from(entry.edgeIds),
        }))
        .sort((a, b) => b.count - a.count);

      return { verse, groups: topicGroups };
    },
    [activeBundle, mapEdges, nodeLookup],
  );
  const pickDefaultTopic = useCallback(
    (
      groups: MapConnectionTopicGroup[],
      preferredStyle?: MapConnectionFamily,
    ) => {
      if (preferredStyle) {
        const preferred = groups.find(
          (group) => group.styleType === preferredStyle,
        );
        if (preferred) return preferred;
      }
      if (groups.length === 0) return null;

      let bestGroup = groups[0];
      let bestWeight = -1;
      groups.forEach((group) => {
        const weight = Math.max(
          ...group.edgeIds.map((edgeId) => edgeLookup.get(edgeId)?.weight ?? 0),
          0,
        );
        if (weight > bestWeight) {
          bestWeight = weight;
          bestGroup = group;
        }
      });
      return bestGroup;
    },
    [edgeLookup],
  );
  const rootNode = useMemo(() => {
    if (!activeBundle) return null;
    return (
      nodeLookup.get(activeBundle.rootId) ||
      mapNodes.find((node) => node.depth === 0) ||
      mapNodes[0] ||
      null
    );
  }, [activeBundle, mapNodes, nodeLookup]);
  const spotlightState = useMemo(() => {
    if (selectedEdge) {
      const connectedNodeIds = new Set<number>(
        selectedEdge.connectedVerseIds &&
        selectedEdge.connectedVerseIds.length > 0
          ? selectedEdge.connectedVerseIds
          : [selectedEdge.from.id, selectedEdge.to.id],
      );
      connectedNodeIds.add(selectedEdge.from.id);
      connectedNodeIds.add(selectedEdge.to.id);
      if (selectedEdge.baseNode) {
        connectedNodeIds.add(selectedEdge.baseNode.id);
      }

      const connectedEdgeIds = new Set<string>(
        selectedEdge.topicGroups && selectedEdge.styleType
          ? (selectedEdge.topicGroups.find(
              (group) => group.styleType === selectedEdge.styleType,
            )?.edgeIds ?? [selectedEdge.edge.id])
          : [selectedEdge.edge.id],
      );
      connectedEdgeIds.add(selectedEdge.edge.id);

      return { nodeIds: connectedNodeIds, edgeIds: connectedEdgeIds };
    }

    if (focusedNodeId !== null) {
      const connectedNodeIds = new Set<number>([focusedNodeId]);
      const connectedEdgeIds = new Set<string>();
      mapEdges.forEach((edge) => {
        if (edge.from === focusedNodeId || edge.to === focusedNodeId) {
          connectedEdgeIds.add(edge.id);
          connectedNodeIds.add(edge.from);
          connectedNodeIds.add(edge.to);
        }
      });
      return { nodeIds: connectedNodeIds, edgeIds: connectedEdgeIds };
    }

    return null;
  }, [focusedNodeId, mapEdges, selectedEdge]);
  // activeTopicStyle = which topic's analysis is loaded (drives fetch)
  // highlightedTopicStyle = which topic is visually highlighted (arrow/dot nav, no fetch)
  const currentActiveStyle =
    activeTopicStyle ?? selectedEdge?.styleType ?? null;
  const currentHighlight = highlightedTopicStyle ?? currentActiveStyle;
  const selectedTopicGroup = useMemo(() => {
    if (!selectedEdge?.topicGroups || !currentActiveStyle) return null;
    return (
      selectedEdge.topicGroups.find(
        (group) => group.styleType === currentActiveStyle,
      ) ?? null
    );
  }, [selectedEdge, currentActiveStyle]);
  const selectedConnectionLabel = useMemo(() => {
    if (!selectedEdge) return "Connection";
    return currentActiveStyle
      ? getConnectionFamilyLabel(currentActiveStyle)
      : edgeTypeToConceptLabel(selectedEdge.edge.type);
  }, [selectedEdge, currentActiveStyle]);
  const selectedConnectionAccent = useMemo(() => {
    if (!selectedEdge) return "#F9F4EC";
    return selectedEdge.edge.isAnchorRay ? "#C5B358" : "#F9F4EC";
  }, [selectedEdge]);
  const selectedConnectionVerses = useMemo<MapVersePreview[]>(() => {
    if (!selectedEdge) return [];

    const seen = new Set<number>();
    const verseIds =
      selectedEdge.connectedVerseIds &&
      selectedEdge.connectedVerseIds.length > 0
        ? selectedEdge.connectedVerseIds
        : [selectedEdge.from.id, selectedEdge.to.id];
    const previews: MapVersePreview[] = [];

    verseIds.forEach((id) => {
      const node = nodeLookup.get(id);
      if (!node || seen.has(node.id)) return;
      seen.add(node.id);
      previews.push({
        id: node.id,
        reference: formatNodeReference(node),
        text: node.text,
        isBase: selectedEdge.baseNode?.id === node.id,
      });
    });

    [selectedEdge.baseNode, selectedEdge.from, selectedEdge.to].forEach(
      (node) => {
        if (!node || seen.has(node.id)) return;
        seen.add(node.id);
        previews.push({
          id: node.id,
          reference: formatNodeReference(node),
          text: node.text,
          isBase: selectedEdge.baseNode?.id === node.id,
        });
      },
    );

    return previews;
  }, [nodeLookup, selectedEdge]);
  const selectedConnectionTitle = useMemo(() => {
    if (!selectedEdge) return null;
    if (edgeAnalysis?.title?.trim()) return edgeAnalysis.title.trim();
    // Still loading — return null so the sheet shows a skeleton
    if (edgeAnalysisLoading) return null;
    // Analysis finished without a title — fall back
    const preferredTopicLabel =
      selectedTopicGroup?.displayLabel?.trim() ||
      selectedTopicGroup?.label?.trim();
    return preferredTopicLabel || selectedConnectionLabel;
  }, [
    edgeAnalysis?.title,
    edgeAnalysisLoading,
    selectedConnectionLabel,
    selectedEdge,
    selectedTopicGroup,
  ]);
  const visibleConnectionVerses = useMemo(
    () =>
      showAllConnectionVerses
        ? selectedConnectionVerses
        : selectedConnectionVerses.slice(0, 6),
    [selectedConnectionVerses, showAllConnectionVerses],
  );
  const hiddenConnectionVerseCount = useMemo(
    () =>
      showAllConnectionVerses
        ? 0
        : Math.max(
            0,
            selectedConnectionVerses.length - visibleConnectionVerses.length,
          ),
    [
      selectedConnectionVerses.length,
      showAllConnectionVerses,
      visibleConnectionVerses.length,
    ],
  );
  const activeInspector = useMemo<ActiveInspector>(() => {
    if (parallelSourceNode) {
      return {
        kind: "parallels",
        sourceNode: parallelSourceNode,
        title: "Parallel Accounts",
        subtitle: formatNodeReference(parallelSourceNode),
      };
    }
    if (selectedEdge) {
      return {
        kind: "edge",
        edge: selectedEdge,
        title: selectedConnectionTitle,
        subtitle: selectedEdge.baseNode
          ? formatNodeReference(selectedEdge.baseNode)
          : `${formatNodeReference(selectedEdge.from)} → ${formatNodeReference(selectedEdge.to)}`,
      };
    }
    if (selectedNode) {
      return {
        kind: "node",
        node: selectedNode,
        title: formatNodeReference(selectedNode),
        subtitle: getMapNodeSubtitle(selectedNode),
      };
    }
    return { kind: "none" };
  }, [parallelSourceNode, selectedConnectionTitle, selectedEdge, selectedNode]);
  const selectedLibraryConnection = useMemo(() => {
    if (!selectedEdge) return null;
    const targetConnectionType = (
      selectedEdge.styleType ?? selectedEdge.edge.type
    ).toLowerCase();
    const targetVerseIds = Array.from(
      new Set(
        (selectedEdge.connectedVerseIds &&
        selectedEdge.connectedVerseIds.length > 0
          ? selectedEdge.connectedVerseIds
          : [selectedEdge.from.id, selectedEdge.to.id]
        ).map((id) => Number(id)),
      ),
    ).sort((a, b) => a - b);
    const targetKey = targetVerseIds.join(",");

    return (
      controller.libraryConnections.find((item) => {
        const itemType = item.connectionType.trim().toLowerCase();
        if (itemType !== targetConnectionType) return false;
        const itemVerseIds = Array.from(
          new Set(
            (item.connectedVerseIds && item.connectedVerseIds.length > 0
              ? item.connectedVerseIds
              : [item.fromVerse.id, item.toVerse.id]
            ).map((id) => Number(id)),
          ),
        ).sort((a, b) => a - b);
        return itemVerseIds.join(",") === targetKey;
      }) ?? null
    );
  }, [controller.libraryConnections, selectedEdge]);
  const mapSaveTitle = useMemo(() => {
    if (title?.trim()) return title.trim();
    if (activeBundle?.pericopeContext?.title?.trim()) {
      return activeBundle.pericopeContext.title.trim();
    }
    if (rootNode) return formatNodeReference(rootNode);
    return "Saved map";
  }, [activeBundle, rootNode, title]);
  const activeInspectorTargetNode = useMemo(() => {
    switch (activeInspector.kind) {
      case "node":
        return activeInspector.node;
      case "parallels":
        return activeInspector.sourceNode;
      case "edge":
        return activeInspector.edge.baseNode ?? activeInspector.edge.from;
      default:
        return null;
    }
  }, [activeInspector]);
  const remainingVerseCount = useMemo(() => {
    if (!activeBundle) return 0;
    return activeBundle.nodes.filter((node) => !analyzedVerseIds.has(node.id))
      .length;
  }, [activeBundle, analyzedVerseIds]);
  const discoveryDisabled = useMemo(
    () =>
      !activeBundle ||
      discovering ||
      activeBundle.lens === "NARRATIVE" ||
      remainingVerseCount < 2,
    [activeBundle, discovering, remainingVerseCount],
  );
  const graphBounds = useMemo(() => getGraphBounds(mapNodes), [mapNodes]);
  const maxRenderedDepth = useMemo(
    () => derivedGraph?.maxDepth ?? 0,
    [derivedGraph],
  );
  const svgRuntimeAvailable = useMemo(() => isSvgRuntimeAvailable(), []);

  // Edge entrance animation: wait for nodes to settle, then fade edges in
  useEffect(() => {
    if (mapEdges.length === 0) {
      setEdgesAnimated(false);
      return;
    }
    setEdgesAnimated(false);
    const nodeEntranceTime = Math.min(maxRenderedDepth * 80 + 400, 1200);
    const timer = setTimeout(() => {
      setEdgesAnimated(true);
    }, nodeEntranceTime);
    return () => clearTimeout(timer);
  }, [mapEdges.length, maxRenderedDepth]);

  // Hide navigation header while loader is active for full-screen takeover
  useEffect(() => {
    navigation.setOptions({ headerShown: mapLoaderDismissed });
  }, [mapLoaderDismissed, navigation]);

  // Map-ready gate: hold the loader until the full pipeline completes —
  // bundle fetch → graph derive → auto-discovery → verse analysis.
  // Only then crossfade out so the user sees one seamless loading experience.
  // Discovery is skipped for NARRATIVE lens bundles
  const discoveryApplicable = activeBundle
    ? activeBundle.lens !== "NARRATIVE"
    : true;
  const discoveryDone = discoveryApplicable
    ? autoDiscoveryRunRef.current && !discovering
    : true;
  const pipelineComplete =
    !!derivedGraph && viewportSize.width > 0 && discoveryDone;

  useEffect(() => {
    if (mapReady || mapLoaderDismissed) return;
    if (!pipelineComplete) return;
    const minMs = 1400;
    const elapsed = Date.now() - mapMountTimeRef.current;
    const remaining = Math.max(0, minMs - elapsed);
    const timer = setTimeout(() => {
      setMapReady(true);
      Animated.timing(mapLoaderFadeAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => setMapLoaderDismissed(true));
    }, remaining);
    return () => clearTimeout(timer);
  }, [pipelineComplete, mapReady, mapLoaderDismissed]);

  // Awe-pulse: gold radial flash on graph completion
  useEffect(() => {
    if (!edgesAnimated) return;
    setAwePulseActive(true);
    awePulseAnim.setValue(0);
    Animated.timing(awePulseAnim, {
      toValue: 1,
      duration: 1200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setAwePulseActive(false));
  }, [edgesAnimated]);

  // Compute per-edge stagger delays (logarithmic, capped at 800ms)
  const edgeStaggerDelays = useMemo(() => {
    const delays = new Map<string, number>();
    mapEdges.forEach((edge, idx) => {
      const stagger = Math.round(Math.log(idx + 1) * 160);
      delays.set(edge.id, Math.min(stagger, 800));
    });
    return delays;
  }, [mapEdges]);

  const closeActiveInspector = useCallback(() => {
    if (parallelSourceNode) {
      setParallelSourceNode(null);
      return;
    }
    if (selectedEdge) {
      setSelectedEdge(null);
      setFocusedNodeId(null);
      setActiveTopicStyle(null);
      setHighlightedTopicStyle(null);
      return;
    }
    if (selectedNode) {
      setSelectedNodeId(null);
      if (!selectedEdge) {
        setFocusedNodeId(null);
      }
    }
  }, [parallelSourceNode, selectedEdge, selectedNode]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(MAP_ONBOARDING_STORAGE_KEY)
      .then((value) => {
        if (!active || value === "true") return;
        setOnboardingStep(0);
      })
      .catch(() => {
        if (!active) return;
        setOnboardingStep(0);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setWorkingBundle(initialBundle);
    setSelectedNodeId(null);
    setFocusedNodeId(null);
    setParallelSourceNode(null);
    setSelectedEdge(null);
    setDiscoveryStatus(null);
    setDiscoveryError(null);
    setAnalyzedVerseIds(new Set());
    setEdgeAnalysis(null);
    setEdgeAnalysisLoading(false);
    setEdgeAnalysisError(null);
    autoDiscoveryRunRef.current = false;
    pendingViewportFitRef.current = true;
  }, [initialBundle]);

  // Persist viewport state to AsyncStorage on unmount
  const viewportKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const rootId = activeBundle?.rootId;
    viewportKeyRef.current = rootId != null ? `${rootId}` : null;
  }, [activeBundle?.rootId]);

  useEffect(() => {
    return () => {
      const key = viewportKeyRef.current;
      if (!key) return;
      void AsyncStorage.setItem(
        MAP_VIEWPORT_STORAGE_KEY,
        JSON.stringify({ key, pan: panRef.current, scale: scaleRef.current }),
      );
    };
  }, []);

  // Restore saved viewport if revisiting the same root verse
  useEffect(() => {
    if (!activeBundle?.rootId) return;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(MAP_VIEWPORT_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as {
          key: string;
          pan: { x: number; y: number };
          scale: number;
        };
        if (saved.key !== `${activeBundle.rootId}`) return;
        setPan(saved.pan);
        setScale(saved.scale);
        pendingViewportFitRef.current = false;
      } catch {
        // ignore parse errors
      }
    })();
  }, [activeBundle?.rootId]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  const applyViewportState = useCallback(
    (nextScale: number, nextPan: { x: number; y: number }) => {
      const clampedScale = clampMapScale(nextScale);
      const clampedPan = clampPanToGraphBounds({
        pan: nextPan,
        scale: clampedScale,
        viewport: viewportSizeRef.current,
        bounds: graphBounds,
      });
      setScale(clampedScale);
      setPan(clampedPan);
      scaleRef.current = clampedScale;
      panRef.current = clampedPan;
    },
    [graphBounds],
  );

  const fitViewportToGraph = useCallback(() => {
    const nextViewport = buildFittedViewport({
      viewport: viewportSizeRef.current,
      bounds: graphBounds,
    });
    applyViewportState(nextViewport.scale, nextViewport.pan);
  }, [applyViewportState, graphBounds]);

  useEffect(() => {
    if (!pendingViewportFitRef.current) return;
    if (!activeBundle || mapNodes.length === 0) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
    fitViewportToGraph();
    pendingViewportFitRef.current = false;
  }, [
    activeBundle,
    fitViewportToGraph,
    mapNodes.length,
    viewportSize.height,
    viewportSize.width,
  ]);

  useEffect(() => {
    if (layoutMode !== "expanded") return;
    if (!activeInspectorTargetNode) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const nextPan = getPanForCenteredNode({
      node: activeInspectorTargetNode,
      scale: scaleRef.current,
      viewport: viewportSize,
      bounds: graphBounds,
    });
    applyViewportState(scaleRef.current, nextPan);
  }, [
    activeInspectorTargetNode,
    applyViewportState,
    graphBounds,
    layoutMode,
    viewportSize,
  ]);

  useEffect(() => {
    if (pendingViewportFitRef.current) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
    if (layoutMode === "expanded" && activeInspectorTargetNode) return;
    applyViewportState(scaleRef.current, panRef.current);
  }, [
    activeInspectorTargetNode,
    applyViewportState,
    layoutMode,
    viewportSize.height,
    viewportSize.width,
  ]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) =>
          event.nativeEvent.touches.length > 1,
        onStartShouldSetPanResponderCapture: (event) =>
          event.nativeEvent.touches.length > 1,
        onMoveShouldSetPanResponder: (event, gestureState) =>
          event.nativeEvent.touches.length > 1 ||
          Math.abs(gestureState.dx) > 6 ||
          Math.abs(gestureState.dy) > 6,
        onMoveShouldSetPanResponderCapture: (event, gestureState) =>
          event.nativeEvent.touches.length > 1 ||
          Math.abs(gestureState.dx) > 6 ||
          Math.abs(gestureState.dy) > 6,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          const touches = event.nativeEvent.touches;
          if (touches.length > 1) {
            gestureStateRef.current = {
              mode: "pinch",
              startPan: panRef.current,
              startScale: scaleRef.current,
              startTouch: measureTouchMidpoint(touches),
              startDistance: Math.max(measureTouchDistance(touches), 1),
              startMidpoint: measureTouchMidpoint(touches),
            };
            return;
          }
          // Use pageX/pageY for stable screen-space coordinates that don't
          // jump when the touch target changes mid-gesture.
          const touch = touches[0];
          if (!touch) return;
          gestureStateRef.current = {
            mode: "pan",
            startPan: panRef.current,
            startScale: scaleRef.current,
            startTouch: {
              x: touch.pageX,
              y: touch.pageY,
            },
            startDistance: 0,
            startMidpoint: {
              x: touch.pageX,
              y: touch.pageY,
            },
          };
        },
        onPanResponderMove: (event: GestureResponderEvent) => {
          const touches = event.nativeEvent.touches;
          if (touches.length > 1) {
            const midpoint = measureTouchMidpoint(touches);
            if (gestureStateRef.current.mode !== "pinch") {
              gestureStateRef.current = {
                mode: "pinch",
                startPan: panRef.current,
                startScale: scaleRef.current,
                startTouch: midpoint,
                startDistance: Math.max(measureTouchDistance(touches), 1),
                startMidpoint: midpoint,
              };
            }

            const nextScale = clampMapScale(
              gestureStateRef.current.startScale *
                (Math.max(measureTouchDistance(touches), 1) /
                  Math.max(gestureStateRef.current.startDistance, 1)),
            );
            const nextPan = getPanForScaledFocalPoint({
              currentPan: gestureStateRef.current.startPan,
              currentScale: gestureStateRef.current.startScale,
              nextScale,
              focalPoint: midpoint,
            });
            applyViewportState(nextScale, nextPan);
            return;
          }

          const touch = touches[0];
          if (!touch) return;
          if (gestureStateRef.current.mode !== "pan") {
            // Transitioning from pinch to pan — re-anchor using pageX/pageY
            gestureStateRef.current = {
              mode: "pan",
              startPan: panRef.current,
              startScale: scaleRef.current,
              startTouch: {
                x: touch.pageX,
                y: touch.pageY,
              },
              startDistance: 0,
              startMidpoint: {
                x: touch.pageX,
                y: touch.pageY,
              },
            };
          }

          applyViewportState(scaleRef.current, {
            x:
              gestureStateRef.current.startPan.x +
              (touch.pageX - gestureStateRef.current.startTouch.x),
            y:
              gestureStateRef.current.startPan.y +
              (touch.pageY - gestureStateRef.current.startTouch.y),
          });
        },
        onPanResponderRelease: (_event, gestureState) => {
          // If the user barely moved, treat as a background tap — clear spotlight
          if (
            gestureStateRef.current.mode === "pan" &&
            Math.abs(gestureState.dx) < 6 &&
            Math.abs(gestureState.dy) < 6
          ) {
            setFocusedNodeId(null);
            setSelectedNodeId(null);
            setSelectedEdge(null);
          }
          gestureStateRef.current.mode = "idle";
        },
        onPanResponderTerminate: () => {
          gestureStateRef.current.mode = "idle";
        },
      }),
    [applyViewportState],
  );

  // Stable identity for the selected edge — prevents re-firing when topic
  // titles resolve and update the selectedEdge object reference.
  // Uses currentActiveStyle so carousel topic changes trigger a new fetch.
  const selectedEdgeKey = selectedEdge
    ? `${selectedEdge.edge.id}:${currentActiveStyle}`
    : null;
  const selectedEdgeRef = useRef(selectedEdge);
  selectedEdgeRef.current = selectedEdge;
  const activeTopicStyleRef = useRef(currentActiveStyle);
  activeTopicStyleRef.current = currentActiveStyle;

  useEffect(() => {
    const edge = selectedEdgeRef.current;
    if (!edge || !activeBundle) {
      setEdgeAnalysis(null);
      setEdgeAnalysisLoading(false);
      setEdgeAnalysisError(null);
      return;
    }

    const buildVersePayload = (node: MapNodeLayout) => ({
      id: node.id,
      reference: formatNodeReference(node),
      text: node.text,
      ...(node.pericopeTitle
        ? {
            pericopeTitle: node.pericopeTitle,
            ...(node.pericopeType ? { pericopeType: node.pericopeType } : {}),
            ...(node.pericopeThemes?.length
              ? { pericopeThemes: node.pericopeThemes }
              : {}),
          }
        : {}),
    });
    const verses = [
      ...(edge.connectedVerseIds && edge.connectedVerseIds.length > 0
        ? edge.connectedVerseIds
            .map((id) => nodeLookup.get(id))
            .filter((node): node is MapNodeLayout => Boolean(node))
            .map(buildVersePayload)
        : [buildVersePayload(edge.from), buildVersePayload(edge.to)]),
    ];
    const activeConnectionType =
      activeTopicStyleRef.current ?? edge.styleType ?? edge.edge.type;
    const topicContext =
      edge.topicGroups && edge.topicGroups.length > 0
        ? edge.topicGroups
            .filter((group) => group.styleType !== edge.styleType)
            .map((group) => {
              const selectedVerseIds = new Set(verses.map((verse) => verse.id));
              const candidateVerseIds = new Set([
                edge.baseNode?.id ?? edge.from.id,
                ...group.verseIds,
              ]);
              let intersection = 0;
              candidateVerseIds.forEach((id) => {
                if (selectedVerseIds.has(id)) intersection += 1;
              });
              const union = new Set<number>([
                ...Array.from(selectedVerseIds),
                ...Array.from(candidateVerseIds),
              ]).size;
              return {
                styleType: group.styleType,
                label: group.displayLabel || group.label,
                overlap: union > 0 ? intersection / union : 0,
              };
            })
        : undefined;
    const requestKey = JSON.stringify({
      verseIds: verses.map((verse) => verse.id),
      connectionType: activeConnectionType,
      similarity: edge.edge.weight,
      isLlmDiscovered: isLlmDiscoveredEdge(edge.edge),
      topicContext,
    });
    const cached = edgeAnalysisCacheRef.current.get(requestKey);
    if (cached) {
      setEdgeAnalysis(cached);
      setEdgeAnalysisLoading(false);
      setEdgeAnalysisError(null);
      return;
    }

    let cancelled = false;
    setEdgeAnalysis(null);
    setEdgeAnalysisLoading(true);
    setEdgeAnalysisError(null);

    void fetchSemanticConnectionSynopsis({
      apiBaseUrl: MOBILE_ENV.API_URL,
      verseIds: verses.map((verse) => verse.id),
      verses,
      connectionType: activeConnectionType,
      similarity: edge.edge.weight,
      isLlmDiscovered: isLlmDiscoveredEdge(edge.edge),
      topicContext,
      accessToken: controller.session?.access_token,
    })
      .then((result) => {
        if (cancelled) return;
        const nextAnalysis = {
          title: result.title,
          synopsis: result.synopsis,
          verses: result.verses,
        };
        edgeAnalysisCacheRef.current.set(requestKey, nextAnalysis);
        setEdgeAnalysis(nextAnalysis);
      })
      .catch((error) => {
        if (cancelled) return;
        setEdgeAnalysisError(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => {
        if (cancelled) return;
        setEdgeAnalysisLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeBundle, controller.session?.access_token, selectedEdgeKey]);

  useEffect(() => {
    if (discovering || !discoveryStatus) return;
    const timer = setTimeout(() => {
      setDiscoveryStatus(null);
    }, 1800);
    return () => clearTimeout(timer);
  }, [discovering, discoveryStatus]);

  const dismissOnboarding = useCallback(() => {
    setOnboardingStep(null);
    void AsyncStorage.setItem(MAP_ONBOARDING_STORAGE_KEY, "true");
  }, []);

  const advanceOnboarding = useCallback(() => {
    setOnboardingStep((current) => {
      if (current === null) return null;
      if (current >= 2) {
        void AsyncStorage.setItem(MAP_ONBOARDING_STORAGE_KEY, "true");
        return null;
      }
      return current + 1;
    });
  }, []);

  const resetViewport = useCallback(() => {
    fitViewportToGraph();
  }, [fitViewportToGraph]);

  const handleViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    const previousViewport = viewportSizeRef.current;
    setViewportSize((current) => {
      if (current.width === width && current.height === height) {
        return current;
      }
      return { width, height };
    });
    if (
      width !== previousViewport.width ||
      height !== previousViewport.height
    ) {
      pendingViewportFitRef.current =
        previousViewport.width <= 0 || previousViewport.height <= 0;
    }
  }, []);

  const adjustViewportScale = useCallback(
    (delta: number) => {
      const targetScale = clampMapScale(scaleRef.current + delta);
      const focalPoint = {
        x: viewportSizeRef.current.width / 2,
        y: viewportSizeRef.current.height / 2,
      };
      const nextPan = getPanForScaledFocalPoint({
        currentPan: panRef.current,
        currentScale: scaleRef.current,
        nextScale: targetScale,
        focalPoint,
      });
      applyViewportState(targetScale, nextPan);
    },
    [applyViewportState],
  );

  const buildTopicTitlePayload = useCallback(
    (baseNode: MapNodeLayout, groups: MapConnectionTopicGroup[]) =>
      groups.map((group) => {
        const seen = new Set<number>();
        const verses = [baseNode.id, ...group.verseIds]
          .map((id) => nodeLookup.get(id))
          .filter((node): node is MapNodeLayout => Boolean(node))
          .filter((node) => {
            if (seen.has(node.id)) return false;
            seen.add(node.id);
            return true;
          })
          .slice(0, 4)
          .map((node) => ({
            reference: formatNodeReference(node),
            text: node.text,
          }));
        return {
          type: group.styleType,
          verses,
        };
      }),
    [nodeLookup],
  );

  useEffect(() => {
    setShowAllConnectionVerses(false);
    setEdgeMetaSaved(false);
    setEdgeNoteDraft(selectedLibraryConnection?.note || "");
    setEdgeTagsDraft(selectedLibraryConnection?.tags?.join(", ") || "");
  }, [
    selectedLibraryConnection,
    selectedEdge?.edge.id,
    selectedEdge?.styleType,
  ]);

  useEffect(() => {
    if (controller.libraryConnectionMutationError) {
      setEdgeMetaSaved(false);
    }
  }, [controller.libraryConnectionMutationError]);

  useEffect(() => {
    if (
      !selectedEdge?.baseNode ||
      !selectedEdge.topicGroups ||
      selectedEdge.topicGroups.length === 0
    ) {
      return;
    }
    const labelsReady = selectedEdge.topicGroups.every(
      (group) => group.labelSource === "llm",
    );
    if (labelsReady) return;

    let cancelled = false;
    const requestId = ++topicTitlesRequestRef.current;
    const topics = buildTopicTitlePayload(
      selectedEdge.baseNode,
      selectedEdge.topicGroups,
    );

    void fetchSemanticConnectionTopicTitles({
      apiBaseUrl: MOBILE_ENV.API_URL,
      topics,
      accessToken: controller.session?.access_token,
    })
      .then((titles) => {
        if (cancelled || requestId !== topicTitlesRequestRef.current) return;
        setSelectedEdge((current) => {
          if (
            !current ||
            current.baseNode?.id !== selectedEdge.baseNode?.id ||
            current.edge.id !== selectedEdge.edge.id ||
            !current.topicGroups
          ) {
            return current;
          }

          return {
            ...current,
            topicGroups: current.topicGroups.map((group) => {
              const resolved = titles[group.styleType]?.trim();
              if (!resolved) return group;
              return {
                ...group,
                label: resolved,
                displayLabel: resolved,
                labelSource: "llm",
              };
            }),
          };
        });
      })
      .catch(() => {
        if (cancelled) return;
      });

    return () => {
      cancelled = true;
    };
  }, [buildTopicTitlePayload, controller.session?.access_token, selectedEdge]);

  const openReaderForNode = useCallback(
    async (node: VisualNode) => {
      setSelectedNodeId(null);
      setParallelSourceNode(null);
      setSelectedEdge(null);
      controller.queueReaderFocusTarget(
        node.book_name,
        node.chapter,
        node.verse,
      );
      await controller.navigateReaderTo(node.book_name, node.chapter);
      navigation.navigate("Tabs", { mode: "Reader" } as never);
    },
    [controller, navigation],
  );

  // Verse preview: open a quick-read sheet instead of navigating to reader
  const openMapVersePreview = useCallback(
    (node: VisualNode) => {
      const ref = `${node.book_name} ${node.chapter}:${node.verse}`;
      const requestId = mapVersePreviewRequestIdRef.current + 1;
      mapVersePreviewRequestIdRef.current = requestId;
      setMapVersePreviewRef(ref);
      setMapVersePreviewText(node.text || "");
      setMapVersePreviewLoading(!node.text);
      if (!node.text) {
        fetchVerseText({
          apiBaseUrl: MOBILE_ENV.API_URL,
          reference: ref,
        })
          .then((result) => {
            if (requestId !== mapVersePreviewRequestIdRef.current) return;
            setMapVersePreviewText(
              result?.text || "Could not load verse text.",
            );
            setMapVersePreviewLoading(false);
          })
          .catch(() => {
            if (requestId !== mapVersePreviewRequestIdRef.current) return;
            setMapVersePreviewText("Could not load verse text.");
            setMapVersePreviewLoading(false);
          });
      }
    },
    [controller.session?.access_token],
  );

  const openReaderForParallelPassage = useCallback(
    async (parallel: MapParallelPassage) => {
      setParallelSourceNode(null);
      setSelectedNodeId(null);
      setSelectedEdge(null);
      controller.queueReaderFocusTarget(
        parallel.book_name,
        parallel.chapter,
        parallel.verse,
      );
      await controller.navigateReaderTo(parallel.book_name, parallel.chapter);
      navigation.navigate("Tabs", { mode: "Reader" } as never);
    },
    [controller, navigation],
  );

  const openChatForNode = useCallback(
    (node: VisualNode) => {
      const reference = formatNodeReference(node);
      const payload: MobilePendingPrompt = {
        displayText: reference,
        prompt: `${reference}\n\nHelp me understand this passage in the context of the current map.`,
        mode: "go_deeper_short",
        visualBundle: activeBundle ?? undefined,
      };
      setParallelSourceNode(null);
      setSelectedNodeId(null);
      navigation.navigate("Tabs", {
        mode: "Chat",
        prompt: payload,
        autoSend: true,
      } as never);
    },
    [activeBundle, navigation],
  );

  const openConnectionSelectionForTopic = useCallback(
    (
      baseNode: MapNodeLayout,
      topicGroup: MapConnectionTopicGroup,
      topicGroups: MapConnectionTopicGroup[],
    ) => {
      const primaryEdge =
        topicGroup.edgeIds
          .map((edgeId) => edgeLookup.get(edgeId))
          .filter((edge): edge is MapRenderableEdge => Boolean(edge))
          .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0] ?? null;
      if (!primaryEdge) {
        setFocusedNodeId((current) =>
          current === baseNode.id ? null : baseNode.id,
        );
        setSelectedNodeId(baseNode.id);
        return;
      }

      const parentId =
        baseNode.parentId ??
        (baseNode.depth === 1 ? activeBundle?.rootId : undefined);
      const parentEdge =
        typeof parentId === "number"
          ? (mapEdges.find(
              (edge) =>
                !edge.isSynthetic &&
                ((edge.from === baseNode.id && edge.to === parentId) ||
                  (edge.from === parentId && edge.to === baseNode.id)),
            ) ?? null)
          : null;
      const edgeOverride =
        parentEdge && parentEdge.styleType === topicGroup.styleType
          ? parentEdge
          : primaryEdge;
      const otherId =
        edgeOverride.from === baseNode.id ? edgeOverride.to : edgeOverride.from;
      const otherNode = nodeLookup.get(otherId) ?? baseNode;
      const connectedVerseIds = Array.from(
        new Set(
          activeBundle?.rootId === baseNode.id
            ? topicGroup.verseIds
            : [baseNode.id, ...topicGroup.verseIds],
        ),
      );

      setFocusedNodeId(baseNode.id);
      setSelectedNodeId(null);
      setParallelSourceNode(null);
      setSelectedEdge({
        edge: edgeOverride,
        from: baseNode,
        to: otherNode,
        baseNode,
        connectedVerseIds,
        topicGroups,
        styleType: topicGroup.styleType,
      });
    },
    [activeBundle?.rootId, edgeLookup, mapEdges, nodeLookup],
  );

  const openChatForEdge = useCallback(
    (selection: MapEdgeSelection) => {
      if (!activeBundle) return;
      const connectedVerseIds =
        selection.connectedVerseIds && selection.connectedVerseIds.length > 0
          ? selection.connectedVerseIds
          : [selection.from.id, selection.to.id];
      const fromReference = formatNodeReference(selection.from);
      const toReference = formatNodeReference(selection.to);
      const connectionLabel = selection.styleType
        ? getConnectionFamilyLabel(selection.styleType)
        : edgeTypeToConceptLabel(selection.edge.type);
      const payload: MobilePendingPrompt = {
        displayText: `${fromReference} -> ${toReference}`,
        prompt:
          connectedVerseIds.length > 2
            ? `Trace the ${connectionLabel.toLowerCase()} thread centered on ${selection.baseNode ? formatNodeReference(selection.baseNode) : fromReference}. Explain how these passages connect and why the pattern matters.`
            : `Trace the connection between ${fromReference} and ${toReference}. Explain the ${connectionLabel.toLowerCase()} relationship and why it matters.`,
        mode: "go_deeper_short",
        visualBundle: activeBundle,
        mapSession: buildLibraryMapSession({
          fromId: selection.from.id,
          toId: selection.to.id,
          connectionType: selection.styleType ?? selection.edge.type,
          verseIds: connectedVerseIds,
        }),
      };
      setParallelSourceNode(null);
      setSelectedEdge(null);
      navigation.navigate("Tabs", {
        mode: "Chat",
        prompt: payload,
        autoSend: true,
      } as never);
    },
    [activeBundle, navigation],
  );

  const runDiscovery = useCallback(
    async (mode: "auto" | "manual") => {
      if (!activeBundle || discovering || activeBundle.lens === "NARRATIVE") {
        return;
      }

      const candidateNodes = getDiscoveryCandidateNodes(
        activeBundle,
        analyzedVerseIds,
      );
      if (candidateNodes.length < 2) {
        if (mode === "manual") {
          setDiscoveryError("No additional verses are available to analyze.");
        }
        return;
      }

      setDiscovering(true);
      setDiscoveryError(null);
      setDiscoveryStatus("Selecting key verses...");
      try {
        const verseIds = candidateNodes.map((node) => node.id);
        setDiscoveryStatus("Analyzing verses...");
        const result = await discoverConnections({
          apiBaseUrl: MOBILE_ENV.API_URL,
          verseIds,
          accessToken: controller.session?.access_token,
        });

        setAnalyzedVerseIds((current) => {
          const next = new Set(current);
          verseIds.forEach((id) => next.add(id));
          return next;
        });

        setDiscoveryStatus("Mapping new connections...");
        const merged = mergeDiscoveredConnections(
          activeBundle,
          result.connections.map((connection) => ({
            from: connection.from,
            to: connection.to,
            type: connection.type,
            explanation: connection.explanation,
            confidence: connection.confidence,
          })),
        );

        if (merged.addedCount > 0) {
          setWorkingBundle(merged.bundle);
          setDiscoveryStatus(
            `Added ${merged.addedCount} connection${merged.addedCount === 1 ? "" : "s"}`,
          );
        } else {
          setDiscoveryStatus(
            result.fromCache
              ? "No new connections beyond cached discovery."
              : "No additional connections found.",
          );
        }
      } catch (error) {
        setDiscoveryError(
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        setDiscovering(false);
      }
    },
    [
      activeBundle,
      analyzedVerseIds,
      controller.session?.access_token,
      discovering,
    ],
  );

  // Auto-discover connections on first bundle load (mirrors web behavior)
  useEffect(() => {
    if (!activeBundle || discovering || autoDiscoveryRunRef.current) return;
    autoDiscoveryRunRef.current = true;
    void runDiscovery("auto");
  }, [activeBundle, discovering, runDiscovery]);

  const saveSelectedConnection = useCallback(async () => {
    if (!selectedEdge || !activeBundle) return;
    const connectionLabel = selectedEdge.styleType
      ? getConnectionFamilyLabel(selectedEdge.styleType)
      : edgeTypeToConceptLabel(selectedEdge.edge.type);

    const analysisVerses =
      edgeAnalysis?.verses && edgeAnalysis.verses.length > 0
        ? edgeAnalysis.verses
        : [
            {
              id: selectedEdge.from.id,
              reference: formatNodeReference(selectedEdge.from),
              text: selectedEdge.from.text,
            },
            {
              id: selectedEdge.to.id,
              reference: formatNodeReference(selectedEdge.to),
              text: selectedEdge.to.text,
            },
          ];

    await controller.handleCreateLibraryConnectionFromMap({
      bundle: activeBundle,
      fromVerse: {
        id: selectedEdge.from.id,
        reference: formatNodeReference(selectedEdge.from),
        text: selectedEdge.from.text,
      },
      toVerse: {
        id: selectedEdge.to.id,
        reference: formatNodeReference(selectedEdge.to),
        text: selectedEdge.to.text,
      },
      connectionType: selectedEdge.styleType ?? selectedEdge.edge.type,
      similarity: selectedEdge.edge.weight,
      synopsis:
        edgeAnalysis?.synopsis ||
        getEdgeExplanation(selectedEdge.edge) ||
        `Trace the connection between ${formatNodeReference(selectedEdge.from)} and ${formatNodeReference(selectedEdge.to)}.`,
      explanation: getEdgeExplanation(selectedEdge.edge) || undefined,
      connectedVerseIds:
        selectedEdge.connectedVerseIds &&
        selectedEdge.connectedVerseIds.length > 0
          ? selectedEdge.connectedVerseIds
          : analysisVerses.map((verse) => verse.id),
      connectedVerses: analysisVerses,
      goDeeperPrompt:
        selectedEdge.connectedVerseIds &&
        selectedEdge.connectedVerseIds.length > 2
          ? `Trace the ${connectionLabel.toLowerCase()} thread centered on ${selectedEdge.baseNode ? formatNodeReference(selectedEdge.baseNode) : formatNodeReference(selectedEdge.from)}. Explain how these connected passages build the idea and why it matters.`
          : `Trace the connection between ${formatNodeReference(selectedEdge.from)} and ${formatNodeReference(selectedEdge.to)}. Explain the ${connectionLabel.toLowerCase()} relationship and why it matters.`,
    });
  }, [activeBundle, controller, edgeAnalysis, selectedEdge]);

  const saveSelectedConnectionMeta = useCallback(async () => {
    if (!selectedLibraryConnection) return;
    setEdgeMetaSaved(false);
    await controller.handleSaveLibraryConnectionMeta(
      selectedLibraryConnection.id,
      {
        note: edgeNoteDraft,
        tags: edgeTagsDraft,
      },
    );
    setEdgeMetaSaved(true);
  }, [controller, edgeNoteDraft, edgeTagsDraft, selectedLibraryConnection]);

  const handleMapNodePress = useCallback(
    (node: MapNodeLayout) => {
      setParallelSourceNode(null);

      // If this node is already focused (spotlight active), second tap opens
      // the inspector — matching web's click-to-inspect after hover-to-spotlight.
      if (focusedNodeId === node.id) {
        // Already spotlighted — open the inspector
        if (
          selectedEdge &&
          selectedEdge.baseNode?.id === node.id &&
          selectedEdge.topicGroups &&
          selectedEdge.topicGroups.length > 0
        ) {
          // Edge inspector already open for this node — toggle to node inspector
          setSelectedEdge(null);
          setSelectedNodeId(node.id);
          return;
        }

        const topicData = buildConnectionTopics(node.id);
        if (topicData && topicData.groups.length > 0) {
          const preferredStyle =
            typeof node.semanticConnectionType === "string"
              ? node.semanticConnectionType
              : undefined;
          const defaultTopic = pickDefaultTopic(
            topicData.groups,
            preferredStyle,
          );
          if (defaultTopic) {
            openConnectionSelectionForTopic(
              topicData.verse,
              defaultTopic,
              topicData.groups,
            );
            return;
          }
        }

        // No connection data — open node inspector
        setSelectedEdge(null);
        setSelectedNodeId(node.id);
        return;
      }

      // First tap — spotlight the node (highlight its connections, dim others).
      // Clear any open inspector so the user sees the spotlight cleanly.
      setSelectedEdge(null);
      setSelectedNodeId(null);
      setFocusedNodeId(node.id);
    },
    [
      buildConnectionTopics,
      focusedNodeId,
      openConnectionSelectionForTopic,
      pickDefaultTopic,
      selectedEdge,
    ],
  );

  useEffect(() => {
    if (!activeBundle || discovering || autoDiscoveryRunRef.current) return;
    if (activeBundle.lens === "NARRATIVE") return;
    autoDiscoveryRunRef.current = true;
    void runDiscovery("auto");
  }, [activeBundle, discovering, runDiscovery]);

  const isExpandedLayout = layoutMode === "expanded";
  const resolvedInspector =
    activeInspector.kind === "none" ? null : activeInspector;
  const inspectorVisible = resolvedInspector !== null;
  const activeInspectorVariant =
    activeInspector.kind === "parallels"
      ? "parallels"
      : activeInspector.kind === "edge"
        ? "edge"
        : "node";
  const nodeInspectorContent = selectedNode ? (
    <View style={localStyles.mapSheetBody}>
      {/* Pericope eyebrow — lightweight narrative context above synopsis */}
      {selectedNode.pericopeTitle ? (
        <View style={localStyles.mapPericopeEyebrow}>
          <Text style={localStyles.mapPericopeEyebrowText} numberOfLines={1}>
            {selectedNode.pericopeTitle}
          </Text>
          {selectedNode.pericopeThemes?.length ? (
            <Text style={localStyles.mapPericopeThemes} numberOfLines={1}>
              {selectedNode.pericopeThemes.slice(0, 3).join(" · ")}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={localStyles.mapMetaChipRow}>
        <Text style={localStyles.mapMetaChip}>Depth {selectedNode.depth}</Text>
        {selectedNodeParallelPassages.length ? (
          <Text style={localStyles.mapMetaChip}>
            {selectedNodeParallelPassages.length} accounts
          </Text>
        ) : null}
      </View>
      {selectedNodeParallelPassages.length > 0 ? (
        <View style={localStyles.mapParallelCard}>
          <View style={localStyles.mapParallelHeader}>
            <Text style={localStyles.mapParallelTitle}>Parallel accounts</Text>
            <Text style={localStyles.mapParallelCount}>
              {selectedNodeParallelPassages.length}
            </Text>
          </View>
          <View style={localStyles.mapParallelPreviewList}>
            {selectedNodeParallelPassages.slice(0, 2).map((parallel) => (
              <View
                key={`parallel-preview-${parallel.id}`}
                style={localStyles.mapParallelPreviewRow}
              >
                <Text style={localStyles.mapParallelPreviewReference}>
                  {parallel.reference}
                </Text>
                <Text style={localStyles.mapParallelPreviewMeta}>
                  {Math.round(parallel.similarity * 100)}% match
                </Text>
              </View>
            ))}
          </View>
          <ActionButton
            variant="ghost"
            label="View all accounts"
            onPress={() => {
              setParallelSourceNode(selectedNode);
              setSelectedNodeId(null);
            }}
            style={localStyles.mapParallelButton}
          />
        </View>
      ) : null}
      {isExpandedLayout ? (
        <Text style={styles.connectionSynopsis}>{selectedNode.text}</Text>
      ) : (
        <ScrollView style={localStyles.nodeDetailScroll}>
          <Text style={styles.connectionSynopsis}>{selectedNode.text}</Text>
        </ScrollView>
      )}
      <View style={localStyles.mapSheetActionsRow}>
        <ActionButton
          variant="primary"
          label="Reader"
          onPress={() => void openReaderForNode(selectedNode)}
          style={localStyles.mapSheetActionBtn}
        />
        <ActionButton
          variant="secondary"
          label="Chat"
          onPress={() => openChatForNode(selectedNode)}
          style={localStyles.mapSheetActionBtn}
        />
      </View>
    </View>
  ) : null;
  const parallelsInspectorContent = parallelSourceNode ? (
    <View style={localStyles.mapSheetBody}>
      <View style={localStyles.mapParallelSection}>
        <Text style={localStyles.mapSectionEyebrow}>Primary</Text>
        <Text style={localStyles.mapParallelPrimaryReference}>
          {formatNodeReference(parallelSourceNode)}
        </Text>
        <Text style={localStyles.mapDetailCalloutText}>
          {parallelSourceNode.text}
        </Text>
      </View>
      <Text style={localStyles.mapSectionEyebrow}>Also Found In</Text>
      {isExpandedLayout ? (
        <View style={localStyles.mapParallelList}>
          {selectedParallelPassages.map((parallel) => {
            const tone = getParallelSimilarityTone(parallel.similarity);
            return (
              <Pressable
                key={`parallel-${parallel.id}`}
                onPress={() => void openReaderForParallelPassage(parallel)}
                style={[localStyles.mapParallelRow, { opacity: tone.opacity }]}
              >
                <View style={localStyles.mapParallelRowHeader}>
                  <Text
                    style={[
                      localStyles.mapParallelRowReference,
                      { fontWeight: tone.referenceWeight },
                    ]}
                  >
                    {parallel.reference}
                  </Text>
                  <Text style={localStyles.mapParallelRowSimilarity}>
                    {Math.round(parallel.similarity * 100)}%
                  </Text>
                </View>
                <Text numberOfLines={1} style={localStyles.mapParallelRowText}>
                  {parallel.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <ScrollView style={localStyles.mapParallelScroll}>
          <View style={localStyles.mapParallelList}>
            {selectedParallelPassages.map((parallel) => {
              const tone = getParallelSimilarityTone(parallel.similarity);
              return (
                <Pressable
                  key={`parallel-${parallel.id}`}
                  onPress={() => void openReaderForParallelPassage(parallel)}
                  style={[
                    localStyles.mapParallelRow,
                    { opacity: tone.opacity },
                  ]}
                >
                  <View style={localStyles.mapParallelRowHeader}>
                    <Text
                      style={[
                        localStyles.mapParallelRowReference,
                        { fontWeight: tone.referenceWeight },
                      ]}
                    >
                      {parallel.reference}
                    </Text>
                    <Text style={localStyles.mapParallelRowSimilarity}>
                      {Math.round(parallel.similarity * 100)}%
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={localStyles.mapParallelRowText}
                  >
                    {parallel.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      )}
      <Text style={localStyles.mapParallelFooterHint}>
        Tap a passage to open.
      </Text>
    </View>
  ) : null;
  const edgeInspectorBody = selectedEdge ? (
    <View style={localStyles.mapSheetBody}>
      {/* Pericope eyebrow — narrative context from the base node */}
      {selectedEdge.baseNode?.pericopeTitle ? (
        <View style={localStyles.mapPericopeEyebrow}>
          <Text style={localStyles.mapPericopeEyebrowText} numberOfLines={1}>
            {selectedEdge.baseNode.pericopeTitle}
          </Text>
          {selectedEdge.baseNode.pericopeThemes?.length ? (
            <Text style={localStyles.mapPericopeThemes} numberOfLines={1}>
              {selectedEdge.baseNode.pericopeThemes.slice(0, 3).join(" · ")}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={localStyles.mapVerseChipRow}>
        {visibleConnectionVerses.map((verse) => (
          <PressableScale
            key={`edge-verse-chip-${verse.id}`}
            onPress={() => {
              const node = nodeLookup.get(verse.id);
              if (!node) return;
              openMapVersePreview(node);
            }}
            style={[
              localStyles.mapVerseChip,
              verse.isBase ? localStyles.mapVerseChipActive : null,
              {
                borderColor: `${selectedConnectionAccent}33`,
                backgroundColor: `${selectedConnectionAccent}14`,
              },
            ]}
          >
            <Text
              style={[
                localStyles.mapVerseChipLabel,
                { color: selectedConnectionAccent },
              ]}
            >
              {verse.reference}
            </Text>
          </PressableScale>
        ))}
        {hiddenConnectionVerseCount > 0 ? (
          <PressableScale
            onPress={() => setShowAllConnectionVerses(true)}
            style={localStyles.mapVerseChipShowAll}
          >
            <Text style={localStyles.mapVerseChipShowAllLabel}>
              Show all {selectedConnectionVerses.length}
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {selectedConnectionVerses.length > 6 && showAllConnectionVerses ? (
        <Pressable
          onPress={() => setShowAllConnectionVerses(false)}
          style={localStyles.mapShowFewerButton}
        >
          <Text style={localStyles.mapShowFewerLabel}>Show fewer verses</Text>
        </Pressable>
      ) : null}
      {getEdgeExplanation(selectedEdge.edge) ? (
        <Text style={localStyles.mapSourceNoteText}>
          {getEdgeExplanation(selectedEdge.edge)}
        </Text>
      ) : null}
      <View style={localStyles.mapAnalysisCard}>
        {edgeAnalysisLoading ? (
          <View style={localStyles.mapAnalysisLoadingBlock}>
            <View style={localStyles.mapAnalysisDotRow}>
              <View style={localStyles.mapAnalysisDot} />
              <View style={localStyles.mapAnalysisDot} />
              <View style={localStyles.mapAnalysisDot} />
              <Text style={localStyles.mapAnalysisLoadingText}>
                Analyzing connection
              </Text>
            </View>
            <View style={localStyles.mapAnalysisSkeletonBlock}>
              <View style={localStyles.mapAnalysisSkeletonLine} />
              <View
                style={[
                  localStyles.mapAnalysisSkeletonLine,
                  localStyles.mapAnalysisSkeletonLineWide,
                ]}
              />
              <View
                style={[
                  localStyles.mapAnalysisSkeletonLine,
                  localStyles.mapAnalysisSkeletonLineShort,
                ]}
              />
            </View>
          </View>
        ) : edgeAnalysisError ? (
          <Text style={localStyles.mapSummaryError}>{edgeAnalysisError}</Text>
        ) : edgeAnalysis ? (
          <Text style={localStyles.mapAnalysisText}>
            {edgeAnalysis.synopsis}
          </Text>
        ) : (
          <Text style={localStyles.mapAnalysisText}>
            Connection analysis is unavailable for this edge.
          </Text>
        )}
      </View>
      {selectedEdge.topicGroups && selectedEdge.topicGroups.length > 1 ? (
        <View style={localStyles.mapTopicNavigatorRow}>
          <Text style={localStyles.mapTopicNavigatorLabel}>
            More connections
          </Text>
          <View style={localStyles.mapTopicDotRow}>
            {selectedEdge.topicGroups.map((group) => {
              const isHighlighted = group.styleType === currentHighlight;
              return (
                <Pressable
                  key={`topic-dot-${group.styleType}`}
                  onPress={() => setHighlightedTopicStyle(group.styleType)}
                  style={[
                    localStyles.mapTopicDot,
                    {
                      borderColor: `${selectedConnectionAccent}88`,
                      backgroundColor: isHighlighted
                        ? selectedConnectionAccent
                        : "transparent",
                      opacity: isHighlighted ? 1 : 0.4,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
      ) : null}
      {selectedTopicGroup &&
      selectedEdge.topicGroups &&
      selectedEdge.topicGroups.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={localStyles.mapTopicChipRow}
          onScroll={(e) => {
            const groups = selectedEdge.topicGroups;
            if (!groups || groups.length <= 1) return;
            const offsetX = e.nativeEvent.contentOffset.x;
            const viewWidth = e.nativeEvent.layoutMeasurement.width;
            const contentWidth = e.nativeEvent.contentSize.width;
            // Map scroll position to chip index proportionally
            const maxScroll = Math.max(1, contentWidth - viewWidth);
            const progress = Math.min(1, Math.max(0, offsetX / maxScroll));
            const idx = Math.round(progress * (groups.length - 1));
            const group = groups[idx];
            if (group && group.styleType !== currentHighlight) {
              setHighlightedTopicStyle(group.styleType);
            }
          }}
          scrollEventThrottle={64}
        >
          {(selectedEdge.topicGroups || [selectedTopicGroup]).map((group) => {
            const isHighlighted = group.styleType === currentHighlight;
            const labelReady = group.labelSource === "llm";
            return (
              <PressableScale
                key={`topic-compact-${group.styleType}`}
                onPress={() => {
                  if (!labelReady) return;
                  // Tap loads the analysis for this topic
                  setActiveTopicStyle(group.styleType);
                  setHighlightedTopicStyle(group.styleType);
                }}
                style={[
                  localStyles.mapTopicChip,
                  isHighlighted ? localStyles.mapTopicChipActive : null,
                ]}
              >
                {labelReady ? (
                  <Text
                    style={[
                      localStyles.mapTopicChipLabel,
                      {
                        color: isHighlighted
                          ? selectedConnectionAccent
                          : T.colors.textMuted,
                      },
                    ]}
                  >
                    {(group.displayLabel || group.label).trim()}
                  </Text>
                ) : (
                  <View
                    style={{
                      width: 72,
                      height: 12,
                      borderRadius: 4,
                      backgroundColor: "rgba(255,255,255,0.07)",
                    }}
                  />
                )}
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}
      {controller.libraryConnectionMutationError ? (
        <Text style={localStyles.mapSummaryError}>
          {controller.libraryConnectionMutationError}
        </Text>
      ) : null}
      <View style={localStyles.mapSheetActionsRow}>
        <ActionButton
          variant="primary"
          label="Go deeper"
          onPress={() => openChatForEdge(selectedEdge)}
          style={localStyles.mapSheetActionBtn}
        />
        {selectedLibraryConnection ? null : (
          <ActionButton
            variant="secondary"
            disabled={
              edgeAnalysisLoading || controller.libraryConnectionMutationBusy
            }
            label={
              controller.libraryConnectionMutationBusy ? "Saving..." : "Save"
            }
            onPress={() => void saveSelectedConnection()}
            style={localStyles.mapSheetActionBtn}
          />
        )}
      </View>
      {selectedLibraryConnection ? (
        <View style={localStyles.mapLibraryMetaSection}>
          <Text style={localStyles.mapLibraryMetaTitle}>Notes and tags</Text>
          <TextInput
            multiline
            numberOfLines={3}
            placeholder="Add a note about why this matters..."
            placeholderTextColor="rgba(161,161,170,0.7)"
            style={localStyles.mapMetaInput}
            value={edgeNoteDraft}
            onChangeText={(value) => {
              setEdgeMetaSaved(false);
              setEdgeNoteDraft(value);
            }}
          />
          <TextInput
            placeholder="Tags (comma-separated)"
            placeholderTextColor="rgba(161,161,170,0.7)"
            style={localStyles.mapMetaInput}
            value={edgeTagsDraft}
            onChangeText={(value) => {
              setEdgeMetaSaved(false);
              setEdgeTagsDraft(value);
            }}
          />
          <View style={localStyles.mapLibraryMetaActions}>
            <ActionButton
              variant="secondary"
              disabled={controller.libraryConnectionMutationBusy}
              label={
                controller.libraryConnectionMutationBusy
                  ? "Saving..."
                  : edgeMetaSaved
                    ? "Saved"
                    : "Save notes"
              }
              onPress={() => void saveSelectedConnectionMeta()}
            />
          </View>
        </View>
      ) : null}
    </View>
  ) : null;
  const activeInspectorContent =
    activeInspector.kind === "node" ? (
      nodeInspectorContent
    ) : activeInspector.kind === "parallels" ? (
      parallelsInspectorContent
    ) : activeInspector.kind === "edge" ? (
      isExpandedLayout ? (
        <ScrollView
          style={localStyles.mapInspectorScrollView}
          contentContainerStyle={localStyles.mapInspectorScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {edgeInspectorBody}
        </ScrollView>
      ) : (
        edgeInspectorBody
      )
    ) : null;

  if (!activeBundle) {
    // If a trace query is in-flight, show the full-screen loader
    if (traceQuery && !mapLoaderDismissed) {
      return (
        <View
          style={[
            localStyles.mapScreenRoot,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              justifyContent: "center",
              alignItems: "center",
            },
          ]}
        >
          <View style={localStyles.mapLoaderContent}>
            <ChatThinkingState verses={[]} tracedText={title} />
          </View>
        </View>
      );
    }
    return (
      <View style={styles.tabScreen}>
        <SurfaceCard>
          <Text style={styles.emptyTitle}>Map unavailable</Text>
          <Text style={styles.emptySubtitle}>
            Open a map from Chat or Library to view an interactive graph.
          </Text>
        </SurfaceCard>
      </View>
    );
  }

  return (
    <View style={localStyles.mapScreenRoot}>
      <View
        style={[
          localStyles.mapWorkspace,
          isExpandedLayout && inspectorVisible
            ? localStyles.mapWorkspaceExpanded
            : null,
        ]}
      >
        <View style={localStyles.mapViewportPane}>
          <View
            style={localStyles.mapViewportFull}
            onLayout={handleViewportLayout}
            {...panResponder.panHandlers}
          >
            <View
              style={[
                localStyles.mapCanvasTransform,
                {
                  transform: [{ translateX: pan.x }, { translateY: pan.y }],
                },
              ]}
              pointerEvents="box-none"
            >
              <View
                style={[localStyles.mapCanvas, { transform: [{ scale }] }]}
                pointerEvents="box-none"
              >
                {svgRuntimeAvailable ? (
                  <Svg
                    height={MAP_CANVAS_SIZE}
                    pointerEvents="box-none"
                    style={localStyles.mapSvgLayer}
                    width={MAP_CANVAS_SIZE}
                  >
                    <Defs>
                      <LinearGradient
                        id="mobileMapSyntheticEdge"
                        x1="0%"
                        x2="100%"
                        y1="0%"
                        y2="0%"
                      >
                        <Stop offset="0%" stopColor="rgba(71,85,105,0.12)" />
                        <Stop offset="50%" stopColor="rgba(148,163,184,0.3)" />
                        <Stop offset="100%" stopColor="rgba(71,85,105,0.12)" />
                      </LinearGradient>
                      <Pattern
                        id="mobileMapDotPattern"
                        width={20}
                        height={20}
                        patternUnits="userSpaceOnUse"
                      >
                        <Circle
                          cx={10}
                          cy={10}
                          r={0.8}
                          fill="rgba(255,255,255,0.03)"
                        />
                      </Pattern>
                    </Defs>
                    <Rect
                      x={0}
                      y={0}
                      width={MAP_CANVAS_SIZE}
                      height={MAP_CANVAS_SIZE}
                      fill="url(#mobileMapDotPattern)"
                    />
                    {Array.from({ length: Math.max(maxRenderedDepth, 0) }).map(
                      (_value, index) => (
                        <Circle
                          key={`ring-${index + 1}`}
                          cx={MAP_CENTER}
                          cy={MAP_CENTER}
                          fill="none"
                          r={MAP_RING_BASE_RADIUS + index * MAP_RING_STEP}
                          stroke="rgba(255,255,255,0.035)"
                          strokeDasharray="6 10"
                          strokeWidth={1}
                        />
                      ),
                    )}
                    {mapEdges.map((edge) => {
                      const from = nodeLookup.get(edge.from);
                      const to = nodeLookup.get(edge.to);
                      if (!from || !to) return null;
                      const isSelected = selectedEdge?.edge.id === edge.id;
                      const isDimmed = spotlightState
                        ? !spotlightState.edgeIds.has(edge.id)
                        : false;
                      return (
                        <MapEdge
                          key={edge.id}
                          edge={edge}
                          from={from}
                          dimmed={isDimmed}
                          entranceReady={edgesAnimated}
                          staggerDelay={edgeStaggerDelays.get(edge.id) ?? 0}
                          onPress={() => {
                            if (edge.isSynthetic) return;
                            setParallelSourceNode(null);
                            setSelectedNodeId(null);
                            setFocusedNodeId(from.id);
                            setSelectedEdge({
                              edge,
                              from,
                              to,
                              connectedVerseIds: [from.id, to.id],
                              styleType: edge.styleType,
                            });
                          }}
                          selected={isSelected}
                          to={to}
                        />
                      );
                    })}
                  </Svg>
                ) : (
                  <>
                    {Array.from({ length: Math.max(maxRenderedDepth, 0) }).map(
                      (_value, index) => (
                        <View
                          key={`ring-${index + 1}`}
                          pointerEvents="none"
                          style={[
                            localStyles.mapDepthRingFallback,
                            {
                              width:
                                (MAP_RING_BASE_RADIUS + index * MAP_RING_STEP) *
                                2,
                              height:
                                (MAP_RING_BASE_RADIUS + index * MAP_RING_STEP) *
                                2,
                              left:
                                MAP_CENTER -
                                (MAP_RING_BASE_RADIUS + index * MAP_RING_STEP),
                              top:
                                MAP_CENTER -
                                (MAP_RING_BASE_RADIUS + index * MAP_RING_STEP),
                            },
                          ]}
                        />
                      ),
                    )}
                    {mapEdges.map((edge) => {
                      const from = nodeLookup.get(edge.from);
                      const to = nodeLookup.get(edge.to);
                      if (!from || !to) return null;
                      const isSelected = selectedEdge?.edge.id === edge.id;
                      const isDimmed = spotlightState
                        ? !spotlightState.edgeIds.has(edge.id)
                        : false;
                      return (
                        <MapEdgeFallback
                          key={edge.id}
                          edge={edge}
                          from={from}
                          dimmed={isDimmed}
                          entranceReady={edgesAnimated}
                          staggerDelay={edgeStaggerDelays.get(edge.id) ?? 0}
                          onPress={() => {
                            if (edge.isSynthetic) return;
                            setParallelSourceNode(null);
                            setSelectedNodeId(null);
                            setFocusedNodeId(from.id);
                            setSelectedEdge({
                              edge,
                              from,
                              to,
                              connectedVerseIds: [from.id, to.id],
                              styleType: edge.styleType,
                            });
                          }}
                          selected={isSelected}
                          to={to}
                        />
                      );
                    })}
                  </>
                )}

                {mapNodes.map((node) => {
                  const isSelected = node.id === selectedNodeId;
                  const isFocused = node.id === focusedNodeId;
                  const isDimmed = spotlightState
                    ? !spotlightState.nodeIds.has(node.id)
                    : false;
                  const frame = getMapNodeFrame(node);
                  const semanticAccent =
                    !node.isAnchor && node.semanticConnectionType
                      ? getConnectionFamilyColor(node.semanticConnectionType)
                      : null;
                  const nodeConnCount = connectionCounts.get(node.id) ?? 0;
                  const showHubBadge =
                    !isDimmed && !node.isAnchor && nodeConnCount >= 3;
                  const hubBoost = !node.isAnchor
                    ? Math.min(Math.max(nodeConnCount - 2, 0), 10)
                    : 0;
                  const hubScale = 1 + hubBoost * 0.045;
                  const parallelCount = getDedupedParallelPassages(node).length;
                  return (
                    <AnimatedMapNode key={node.id} depth={node.depth ?? 1}>
                      <Pressable
                        onPress={() => handleMapNodePress(node)}
                        style={[
                          localStyles.mapNode,
                          isSelected ? localStyles.mapNodeSelected : null,
                          node.depth === 0 ? localStyles.mapNodeAnchor : null,
                          isFocused ? localStyles.mapNodeFocused : null,
                          isDimmed ? localStyles.mapNodeDimmed : null,
                          // Semantic accent is applied subtly via the glow ring overlay
                          // (below), NOT as a direct border color — matches web behavior
                          null,
                          {
                            width: frame.width * hubScale,
                            minHeight: frame.height * hubScale,
                            left: node.x - (frame.width * hubScale) / 2,
                            top: node.y - (frame.height * hubScale) / 2,
                          },
                        ]}
                      >
                        {/* Glass highlight shimmer — top edge */}
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            top: 2,
                            left: 12,
                            right: 12,
                            height: 1,
                            borderRadius: 1,
                            backgroundColor: node.isAnchor
                              ? "rgba(197,179,88,0.6)"
                              : "rgba(255,255,255,0.12)",
                            opacity: isDimmed ? 0.2 : 0.9,
                          }}
                        />
                        {/* Outer glow ring overlay */}
                        {!isDimmed && (
                          <View
                            pointerEvents="none"
                            style={{
                              position: "absolute",
                              top: -2,
                              left: -2,
                              right: -2,
                              bottom: -2,
                              borderRadius: 14,
                              borderWidth: 1,
                              borderColor: semanticAccent
                                ? `${semanticAccent}2E`
                                : node.isAnchor
                                  ? "rgba(197,179,88,0.18)"
                                  : "rgba(203,213,225,0.18)",
                              shadowColor:
                                semanticAccent ||
                                (node.isAnchor ? "#C5B358" : "#CBD5E1"),
                              shadowOpacity: node.isAnchor ? 0.22 : 0.19,
                              shadowRadius: 8,
                              shadowOffset: { width: 0, height: 0 },
                            }}
                          />
                        )}
                        {/* Inner top-edge inset highlight */}
                        <View
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            height: 1,
                            backgroundColor: "rgba(255,255,255,0.10)",
                            borderTopLeftRadius: 12,
                            borderTopRightRadius: 12,
                            opacity: isDimmed ? 0.2 : 1,
                          }}
                        />
                        {/* Hub badge — connection count */}
                        {showHubBadge ? (
                          <View style={localStyles.mapNodeHubBadge}>
                            <Text style={localStyles.mapNodeHubBadgeText}>
                              {nodeConnCount}
                            </Text>
                          </View>
                        ) : null}
                        {/* Parallel passages badge */}
                        {parallelCount > 0 && !isDimmed ? (
                          <Pressable
                            hitSlop={8}
                            onPress={() => {
                              setSelectedNodeId(null);
                              setSelectedEdge(null);
                              setFocusedNodeId(node.id);
                              setParallelSourceNode(node);
                            }}
                            style={localStyles.mapNodeParallelBadge}
                          >
                            <Text style={localStyles.mapNodeParallelBadgeText}>
                              +{parallelCount}
                            </Text>
                          </Pressable>
                        ) : null}
                        <Text
                          numberOfLines={node.depth === 0 ? 2 : 1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                          style={[
                            localStyles.mapNodeText,
                            node.depth === 0
                              ? localStyles.mapNodeTextAnchor
                              : null,
                          ]}
                        >
                          {getMapNodeLabel(node)}
                        </Text>
                        {getMapNodeSubtitle(node) ? (
                          <Text
                            numberOfLines={1}
                            style={localStyles.mapNodeSubtext}
                          >
                            {getMapNodeSubtitle(node)}
                          </Text>
                        ) : null}
                      </Pressable>
                    </AnimatedMapNode>
                  );
                })}
              </View>
            </View>

            {/* Awe-pulse: gold radial flash on graph completion */}
            {awePulseActive && (
              <Animated.View
                pointerEvents="none"
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: "rgba(212,175,55,0.10)",
                  borderRadius: 24,
                  opacity: awePulseAnim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0, 1, 0],
                  }),
                  transform: [
                    {
                      scale: awePulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.6, 1.8],
                      }),
                    },
                  ],
                }}
              />
            )}

            {/* Top-right: intentionally empty — save/help moved to menu */}

            <View style={localStyles.mapActionClusterBottomRight}>
              <IconButton
                accessibilityLabel="Zoom out"
                shape="rounded"
                icon={
                  <Ionicons
                    color={T.colors.textMuted}
                    name="remove"
                    size={18}
                  />
                }
                onPress={() => adjustViewportScale(-0.18)}
              />
              <IconButton
                accessibilityLabel="Zoom in"
                shape="rounded"
                icon={
                  <Ionicons color={T.colors.textMuted} name="add" size={18} />
                }
                onPress={() => adjustViewportScale(0.18)}
              />
              <IconButton
                accessibilityLabel="Reset map view"
                shape="rounded"
                icon={
                  <Ionicons
                    color={T.colors.textMuted}
                    name="scan-outline"
                    size={18}
                  />
                }
                onPress={resetViewport}
              />
            </View>

            <View style={localStyles.mapActionClusterBottomLeft}>
              <IconButton
                accessibilityLabel="Map actions"
                shape="rounded"
                icon={
                  <Ionicons
                    color={T.colors.textMuted}
                    name="ellipsis-horizontal"
                    size={20}
                  />
                }
                onPress={() => setMapMenuVisible(true)}
              />
            </View>

            {discovering || discoveryStatus ? (
              <View
                pointerEvents="none"
                style={localStyles.mapDiscoveryOverlay}
              >
                <View style={localStyles.mapDiscoveryCard}>
                  <Text style={localStyles.mapDiscoveryEyebrow}>
                    Discovery pipeline
                  </Text>
                  <Text style={localStyles.mapDiscoveryText}>
                    {discoveryStatus || "Analyzing verses..."}
                  </Text>
                  {discovering ? (
                    <LoadingDotsNative
                      color={T.colors.accent}
                      label="Working"
                      labelStyle={localStyles.mapDiscoveryDotsLabel}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}

            {onboardingStep !== null ? (
              <View style={localStyles.mapOnboardingOverlay}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Skip map onboarding"
                  onPress={dismissOnboarding}
                  style={localStyles.mapOnboardingScrim}
                />
                <View style={localStyles.mapOnboardingCard}>
                  <View style={localStyles.mapOnboardingDots}>
                    {[0, 1, 2].map((step) => (
                      <View
                        key={step}
                        style={[
                          localStyles.mapOnboardingDot,
                          step === onboardingStep
                            ? localStyles.mapOnboardingDotActive
                            : null,
                        ]}
                      />
                    ))}
                  </View>
                  <Text style={localStyles.mapOnboardingTitle}>
                    {onboardingStep === 0
                      ? "Anchor verse"
                      : onboardingStep === 1
                        ? "Trace the branches"
                        : "Inspect the links"}
                  </Text>
                  <Text style={localStyles.mapOnboardingText}>
                    {onboardingStep === 0
                      ? "The highlighted center node is the anchor verse. The rest of the map radiates from that passage."
                      : onboardingStep === 1
                        ? "Colored edges express different relationship families. Follow the branches to see how the idea unfolds."
                        : "Tap any node or edge to inspect the passage, then continue the study in Reader or Chat."}
                  </Text>
                  <View style={localStyles.mapOnboardingActions}>
                    <ActionButton
                      label="Skip"
                      variant="ghost"
                      onPress={dismissOnboarding}
                      style={localStyles.mapOnboardingButton}
                    />
                    <ActionButton
                      label={onboardingStep >= 2 ? "Done" : "Next"}
                      variant="primary"
                      onPress={advanceOnboarding}
                      style={localStyles.mapOnboardingButton}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </View>
        {isExpandedLayout && inspectorVisible ? (
          <MapInspectorSurface
            mode={layoutMode}
            variant={activeInspectorVariant}
            visible={inspectorVisible}
            onClose={closeActiveInspector}
            title={resolvedInspector?.title}
            subtitle={resolvedInspector?.subtitle ?? null}
            titleLoading={
              activeInspector.kind === "edge" && edgeAnalysisLoading
            }
          >
            {activeInspectorContent}
          </MapInspectorSurface>
        ) : null}
      </View>
      {!isExpandedLayout && inspectorVisible ? (
        <MapInspectorSurface
          mode={layoutMode}
          variant={activeInspectorVariant}
          visible={inspectorVisible}
          onClose={closeActiveInspector}
          title={resolvedInspector?.title}
          subtitle={resolvedInspector?.subtitle ?? null}
        >
          {activeInspectorContent}
        </MapInspectorSurface>
      ) : null}

      <BottomSheetSurface
        visible={mapMenuVisible}
        onClose={() => setMapMenuVisible(false)}
        snapPoints={["28%"]}
      >
        <View style={localStyles.mapMenuBody}>
          <Pressable
            style={localStyles.mapMenuItem}
            onPress={() => {
              setMapMenuVisible(false);
              void runDiscovery("manual");
            }}
            disabled={discoveryDisabled}
          >
            <Ionicons
              color={discoveryDisabled ? T.colors.textMuted : T.colors.accent}
              name="sparkles-outline"
              size={20}
            />
            <Text
              style={[
                localStyles.mapMenuItemLabel,
                discoveryDisabled ? localStyles.mapMenuItemDisabled : null,
              ]}
            >
              {discovering ? "Discovering..." : "Discover More"}
            </Text>
          </Pressable>
          <Pressable
            style={localStyles.mapMenuItem}
            disabled={controller.libraryMapMutationBusy}
            onPress={() => {
              setMapMenuVisible(false);
              void controller.handleSaveLibraryMapFromBundle(
                activeBundle,
                mapSaveTitle,
              );
            }}
          >
            <Ionicons
              color={T.colors.accent}
              name="bookmark-outline"
              size={20}
            />
            <Text style={localStyles.mapMenuItemLabel}>Save Map</Text>
          </Pressable>
          <Pressable
            style={localStyles.mapMenuItem}
            onPress={() => {
              setMapMenuVisible(false);
              setHelpVisible(true);
            }}
          >
            <Ionicons
              color={T.colors.textMuted}
              name="help-circle-outline"
              size={20}
            />
            <Text style={localStyles.mapMenuItemLabel}>Help</Text>
          </Pressable>
        </View>
      </BottomSheetSurface>

      <BottomSheetSurface
        visible={Boolean(mapVersePreviewRef)}
        onClose={() => {
          mapVersePreviewRequestIdRef.current += 1;
          setMapVersePreviewRef(null);
          setMapVersePreviewText("");
          setMapVersePreviewLoading(false);
        }}
        title={mapVersePreviewRef || "Verse"}
        snapPoints={["32%"]}
      >
        <View style={localStyles.mapSheetBody}>
          {mapVersePreviewLoading ? (
            <LoadingDotsNative label="Loading verse..." />
          ) : (
            <Text style={localStyles.mapVersePreviewText}>
              {mapVersePreviewText || "Could not load verse text."}
            </Text>
          )}
          <View style={localStyles.mapSheetActionsRow}>
            <ActionButton
              label="Open in Bible"
              variant="secondary"
              onPress={() => {
                const ref = mapVersePreviewRef;
                mapVersePreviewRequestIdRef.current += 1;
                setMapVersePreviewRef(null);
                if (!ref) return;
                const parsed = parseScriptureReference(ref);
                if (!parsed) return;
                controller.queueReaderFocusTarget(
                  parsed.book,
                  parsed.chapter,
                  parsed.verse ?? 1,
                );
                void controller.navigateReaderTo(parsed.book, parsed.chapter);
                navigation.navigate("Tabs", { mode: "Reader" } as never);
              }}
              style={localStyles.mapSheetActionBtn}
            />
          </View>
        </View>
      </BottomSheetSurface>

      <BottomSheetSurface
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        title="Map help"
        subtitle="How to read the native map"
        snapPoints={["48%"]}
      >
        <View style={localStyles.mapSheetBody}>
          <Text style={localStyles.mapHelpHeading}>What the colors mean</Text>
          <View style={localStyles.mapLegendList}>
            {[
              ["ROOTS", "Anchor and root links"],
              ["ECHOES", "Echoed themes"],
              ["PROPHECY", "Prophetic movement"],
              ["FULFILLMENT", "Promise to fulfillment"],
            ].map(([type, description]) => (
              <View key={type} style={localStyles.mapLegendRow}>
                <View
                  style={[
                    localStyles.mapLegendSwatch,
                    { backgroundColor: getMapEdgeColor(type) },
                  ]}
                />
                <View style={localStyles.mapLegendCopy}>
                  <Text style={localStyles.mapLegendTitle}>{type}</Text>
                  <Text style={localStyles.mapLegendText}>{description}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={localStyles.mapHelpHeading}>Interaction model</Text>
          <Text style={localStyles.mapHelpParagraph}>
            Drag with one finger to pan. Pinch to zoom. Use the floating
            controls to refit the map if you lose your place. Tap nodes to
            inspect passages. Tap edges to study the relationship itself. Use
            Discover More to pull in deeper connections from the same map.
          </Text>
        </View>
      </BottomSheetSurface>

      {/* Full-screen loader overlay — shown until map is fully ready */}
      {!mapLoaderDismissed ? (
        <Animated.View
          pointerEvents={mapReady ? "none" : "auto"}
          style={[
            localStyles.mapLoaderOverlay,
            {
              opacity: mapLoaderFadeAnim,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <View style={localStyles.mapLoaderContent}>
            <ChatThinkingState
              verses={mapNodes
                .filter((n) => n.depth !== 0)
                .map((n) => getMapNodeLabel(n))}
              tracedText={title}
              activeTools={discovering ? ["discover_connections"] : []}
              completedTools={
                autoDiscoveryRunRef.current && !discovering
                  ? ["discover_connections"]
                  : derivedGraph
                    ? ["trace_bundle"]
                    : []
              }
            />
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  chatRoot: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  emptyLayout: {
    flex: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 72,
    paddingBottom: 20,
    gap: 14,
  },
  emptyLayoutKeyboard: {
    paddingBottom: 8,
  },
  emptyComposerSlot: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    marginTop: "auto",
  },
  chatList: {
    flex: 1,
  },
  chatListContent: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 14,
  },
  chatListContentEmpty: {
    justifyContent: "flex-end",
  },
  messageRow: {
    width: "100%",
  },
  messageRowUser: {
    alignItems: "flex-end",
    paddingLeft: 28,
  },
  messageRowAssistant: {
    alignItems: "flex-start",
    paddingRight: 10,
  },
  messageBubble: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    maxWidth: "90%",
  },
  userBubble: {
    backgroundColor: "rgba(38,38,41,0.8)",
    borderColor: "rgba(255,255,255,0.07)",
  },
  assistantBubble: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 0,
    maxWidth: "100%",
  },
  messageText: {
    color: T.colors.text,
    fontSize: 15,
    lineHeight: 23,
  },
  assistantBlocks: {
    gap: 12,
  },
  assistantHeading: {
    color: "rgba(232,232,232,0.95)",
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  assistantBulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  assistantBulletMarker: {
    color: T.colors.accent,
    fontSize: 13,
    lineHeight: 24,
    fontWeight: "700",
  },
  assistantBulletText: {
    flex: 1,
    color: T.colors.text,
    fontSize: 15,
    lineHeight: 24,
  },
  inlineReference: {
    color: T.colors.accent,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  referenceModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  referenceModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  referenceModalCard: {
    borderTopLeftRadius: T.radius.lg,
    borderTopRightRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.ink,
    padding: T.spacing.md,
    gap: T.spacing.sm,
    maxHeight: "72%",
  },
  referenceModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: T.spacing.sm,
  },
  referenceModalTitle: {
    flex: 1,
    color: T.colors.accent,
    fontSize: T.typography.caption,
    fontWeight: "700",
  },
  referenceModalCloseButton: {
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  referenceModalCloseLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  referenceModalBody: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: T.spacing.sm,
    minHeight: 120,
    gap: T.spacing.xs,
  },
  referenceModalLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.spacing.sm,
  },
  referenceModalVerseText: {
    color: T.colors.text,
    fontSize: T.typography.body,
    lineHeight: 27,
    fontFamily: T.fonts.serif,
  },
  referenceModalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.spacing.sm,
  },
  chainModalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: T.spacing.md,
  },
  chainModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  chainModalCard: {
    width: "100%",
    maxWidth: 560,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.ink,
    padding: T.spacing.md,
    gap: T.spacing.sm,
    maxHeight: "76%",
  },
  chainModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: T.spacing.sm,
  },
  chainModalTitle: {
    flex: 1,
    color: T.colors.accent,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  chainModalHint: {
    color: T.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  chainModalBody: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: T.spacing.sm,
    minHeight: 140,
  },
  chainModalScroll: {
    maxHeight: 360,
  },
  chainResourceList: {
    gap: 0,
  },
  chainResourceRow: {
    borderRadius: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
    gap: 4,
  },
  chainResourceRowMuted: {
    opacity: 0.8,
  },
  chainResourceTitle: {
    color: T.colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  chainResourceSnippet: {
    color: T.colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  chainResourceDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginVertical: 2,
  },
  chainModalText: {
    color: T.colors.text,
    fontSize: T.typography.body,
    lineHeight: 24,
  },
  chainModalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: T.spacing.sm,
  },
  citationRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  citationChip: {
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(24,24,27,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  citationChipLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },
  messageActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingTop: 4,
  },
  nextBranchList: {
    marginTop: 8,
    gap: 0,
  },
  nextBranchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
  },
  nextBranchArrowIcon: {
    marginTop: 2,
  },
  nextBranchLabel: {
    flex: 1,
    color: T.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  nextBranchDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  thinkingStateSlot: {
    width: "100%",
    maxWidth: 360,
  },
  compactAction: {
    flex: 0,
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  compactActionLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 10,
    maxWidth: 540,
    alignSelf: "center",
  },
  emptyStateTitle: {
    color: T.colors.text,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "700",
    fontFamily: T.fonts.serif,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  emptyStateSubtitle: {
    color: T.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 520,
  },
  chatComposerWrap: {
    backgroundColor: T.colors.canvas,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 9,
  },
  chatComposerWrapKeyboard: {
    marginBottom: 0,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: T.colors.danger,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.dangerSoft,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 6,
  },
  streamStatusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
  },
  statusChip: {
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.35)",
    backgroundColor: "rgba(212,175,55,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusChipError: {
    borderColor: "rgba(239,68,68,0.5)",
    backgroundColor: "rgba(239,68,68,0.14)",
  },
  statusChipDone: {
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.14)",
  },
  statusChipMapPrep: {
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(34,211,238,0.3)",
    backgroundColor: "rgba(6,182,212,0.14)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusChipLabel: {
    color: T.colors.textMuted,
    fontSize: 10.5,
    fontWeight: "600",
  },
  statusChipMapPrepLabel: {
    color: "rgba(207,250,254,0.92)",
    fontSize: 10.5,
    fontWeight: "600",
  },
  mapReadyMeta: {
    color: T.colors.textMuted,
    fontSize: 10.5,
    fontWeight: "600",
  },
  chatComposer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(82,82,91,0.52)",
    borderRadius: 16,
    backgroundColor: "rgba(38,38,41,0.5)",
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 9,
  },
  traceToggleButton: {
    width: T.touchTarget.min,
    height: T.touchTarget.min,
    borderRadius: T.radius.md,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(24,24,27,0.84)",
  },
  traceToggleButtonActive: {
    borderColor: "rgba(212,175,55,0.45)",
    backgroundColor: "rgba(212,175,55,0.16)",
  },
  chatInput: {
    flex: 1,
    maxHeight: 160,
    minHeight: 40,
    color: T.colors.text,
    fontSize: 15,
    lineHeight: 23,
    paddingVertical: 0,
  },
  sendButton: {
    minHeight: T.touchTarget.min,
    minWidth: T.touchTarget.min,
    borderRadius: T.radius.md,
    borderColor: "transparent",
    backgroundColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  sendButtonReady: {
    backgroundColor: "rgba(212,175,55,0.12)",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonStop: {
    borderColor: "rgba(239,68,68,0.3)",
    backgroundColor: "rgba(239,68,68,0.1)",
  },
  sendButtonLabel: {
    color: T.colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  quickPromptRail: {
    marginBottom: 2,
  },
  quickPromptScroller: {
    width: "100%",
  },
  quickPromptRailPlaceholder: {
    minHeight: 48,
  },
  quickPromptRow: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 2,
    paddingRight: 18,
  },
  quickPromptButton: {
    minHeight: 48,
    width: 164,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  quickPromptButtonRandom: {
    borderColor: "rgba(203, 213, 225, 0.32)",
    backgroundColor: "rgba(100, 116, 139, 0.14)",
  },
  quickPromptButtonOT: {
    borderColor: "rgba(252, 211, 77, 0.34)",
    backgroundColor: "rgba(245, 158, 11, 0.16)",
  },
  quickPromptButtonNT: {
    borderColor: "rgba(216, 180, 254, 0.34)",
    backgroundColor: "rgba(168, 85, 247, 0.14)",
  },
  quickPromptButtonPressed: {
    borderColor: "rgba(255, 255, 255, 0.32)",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  quickPromptButtonBusy: {
    opacity: 0.82,
  },
  quickPromptLabel: {
    fontSize: T.typography.caption,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    color: "rgba(212, 212, 216, 0.72)",
  },
  quickPromptLabelRandom: {
    color: "#CBD5E1",
  },
  quickPromptLabelOT: {
    color: "#FCD34D",
  },
  quickPromptLabelNT: {
    color: "#D8B4FE",
  },
  quickPromptTopic: {
    color: T.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    width: "100%",
  },
  quickPromptLoading: {
    color: T.colors.textMuted,
    fontSize: 10,
    textAlign: "center",
  },
  newSessionButton: {
    alignSelf: "center",
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newSessionButtonLabel: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    fontWeight: "700",
  },
  mapScreenRoot: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  mapLoaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: T.colors.canvas,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 50,
  },
  mapLoaderContent: {
    width: "85%",
    maxWidth: 360,
  },
  mapWorkspace: {
    flex: 1,
  },
  mapWorkspaceExpanded: {
    flexDirection: "row",
  },
  mapViewportPane: {
    flex: 1,
    minWidth: 0,
  },
  mapViewportFull: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#09090B",
  },
  mapCanvasTransform: {
    position: "absolute",
    left: 0,
    top: 0,
    width: MAP_CANVAS_SIZE,
    height: MAP_CANVAS_SIZE,
  },
  mapCanvas: {
    width: MAP_CANVAS_SIZE,
    height: MAP_CANVAS_SIZE,
  },
  mapSvgLayer: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  mapDepthRingFallback: {
    position: "absolute",
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.035)",
    borderStyle: "dashed",
  },
  mapNode: {
    position: "absolute",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(22,22,28,0.92)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
  },
  mapNodeHubBadge: {
    position: "absolute",
    top: -8,
    left: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(10,10,12,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    zIndex: 2,
  },
  mapNodeHubBadgeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    fontWeight: "700",
  },
  mapNodeParallelBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(10,10,12,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    zIndex: 2,
  },
  mapNodeParallelBadgeText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    fontWeight: "700",
  },
  edgeFallbackHitbox: {
    position: "absolute",
    overflow: "visible",
  },
  edgeFallbackSegment: {
    position: "absolute",
    justifyContent: "center",
  },
  edgeFallbackGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 8,
    height: 8,
    borderRadius: 999,
  },
  edgeFallbackLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 11,
    borderRadius: 999,
  },
  mapNodeSelected: {
    borderColor: T.colors.accent,
    backgroundColor: "rgba(35,30,15,0.95)",
    shadowColor: T.colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  mapNodeFocused: {
    borderColor: "rgba(249,244,236,0.42)",
    backgroundColor: "rgba(255,255,255,0.08)",
    shadowColor: "#F9F4EC",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    transform: [{ scale: 1.02 }],
  },
  mapNodeDimmed: {
    opacity: 0.15,
  },
  mapNodeAnchor: {
    borderColor: "rgba(197,179,88,0.35)",
    backgroundColor: "rgba(30,28,18,0.94)",
    shadowColor: "#C5B358",
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 },
  },
  mapNodeText: {
    color: T.colors.text,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    width: "100%",
  },
  mapNodeTextAnchor: {
    color: T.colors.accentStrong,
  },
  mapNodeSubtext: {
    color: T.colors.textMuted,
    fontSize: 10,
    textAlign: "center",
    width: "100%",
  },
  mapSummaryError: {
    color: T.colors.danger,
    fontSize: 11,
    lineHeight: 15,
    paddingTop: 2,
  },
  mapActionClusterBottomRight: {
    position: "absolute",
    right: 16,
    bottom: 22,
    gap: 8,
  },
  mapActionClusterBottomLeft: {
    position: "absolute",
    left: 16,
    bottom: 22,
  },
  mapDiscoveryOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  mapDiscoveryCard: {
    width: "100%",
    maxWidth: 280,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.24)",
    backgroundColor: "rgba(9,9,11,0.92)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    alignItems: "center",
  },
  mapDiscoveryEyebrow: {
    color: T.colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  mapDiscoveryText: {
    color: T.colors.text,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    fontWeight: "600",
  },
  mapDiscoveryDotsLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  mapOnboardingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  mapOnboardingScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  mapOnboardingCard: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(24,24,27,0.96)",
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 10,
  },
  mapOnboardingDots: {
    flexDirection: "row",
    gap: 6,
  },
  mapOnboardingDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  mapOnboardingDotActive: {
    width: 18,
    backgroundColor: T.colors.accent,
  },
  mapOnboardingTitle: {
    color: T.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  mapOnboardingText: {
    color: T.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  mapOnboardingActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 4,
  },
  mapOnboardingButton: {
    flex: 1,
  },
  mapSheetBody: {
    gap: T.spacing.sm,
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.sm,
  },
  mapMenuBody: {
    paddingHorizontal: T.spacing.lg,
    gap: 4,
  },
  mapMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  mapMenuItemLabel: {
    color: T.colors.text,
    fontSize: 15,
    fontWeight: "600",
    fontFamily: T.fonts.sans,
  },
  mapMenuItemDisabled: {
    opacity: 0.4,
  },
  mapVersePreviewText: {
    color: T.colors.text,
    fontSize: T.typography.body,
    lineHeight: 27,
    fontFamily: T.fonts.serif,
  },
  mapMetaChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mapMetaChip: {
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    overflow: "hidden",
  },
  mapLlmBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
    backgroundColor: "rgba(212,175,55,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  mapLlmBadgeText: {
    color: "rgba(212,175,55,0.9)",
    fontSize: 10,
    fontWeight: "700",
  },
  mapTopicChipRow: {
    gap: 8,
    paddingRight: 8,
  },
  mapTopicChip: {
    borderRadius: T.radius.md,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
    minWidth: 112,
  },
  mapTopicChipActive: {
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  mapTopicChipLabel: {
    color: T.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  mapVerseChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mapVerseChip: {
    borderRadius: T.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapVerseChipActive: {
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  mapVerseChipLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  mapVerseChipShowAll: {
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapVerseChipShowAllLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  mapShowFewerButton: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  mapShowFewerLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
  },
  mapDetailCallout: {
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
    backgroundColor: "rgba(212,175,55,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  mapDetailCalloutTitle: {
    color: T.colors.accentStrong,
    fontSize: 13,
    fontWeight: "700",
  },
  mapDetailCalloutText: {
    color: T.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  mapSectionEyebrow: {
    color: "rgba(245,240,230,0.45)",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.9,
  },
  mapParallelCard: {
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  mapParallelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  mapParallelTitle: {
    color: T.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  mapParallelCount: {
    color: T.colors.accent,
    fontSize: 12,
    fontWeight: "700",
  },
  mapParallelPreviewList: {
    gap: 8,
  },
  mapParallelPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  mapParallelPreviewReference: {
    flex: 1,
    color: T.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  mapParallelPreviewMeta: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  mapParallelButton: {
    alignSelf: "flex-start",
  },
  mapParallelSection: {
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  mapParallelPrimaryReference: {
    color: T.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  mapParallelScroll: {
    maxHeight: 260,
  },
  mapParallelList: {
    gap: 10,
  },
  mapParallelRow: {
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  mapParallelRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  mapParallelRowReference: {
    flex: 1,
    color: T.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  mapParallelRowSimilarity: {
    color: T.colors.accent,
    fontSize: 11,
    fontWeight: "700",
  },
  mapParallelRowText: {
    color: T.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  mapParallelFooterHint: {
    color: "rgba(245,240,230,0.42)",
    fontSize: 10,
    lineHeight: 14,
  },
  nodeDetailScroll: {
    maxHeight: 180,
  },
  mapSheetActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  mapSheetActionBtn: {
    flex: 1,
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  mapPericopeEyebrow: {
    gap: 2,
  },
  mapPericopeEyebrowText: {
    color: "rgba(245,240,230,0.55)",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    fontFamily: T.fonts.sans,
  },
  mapPericopeThemes: {
    color: "rgba(245,240,230,0.32)",
    fontSize: 10,
    fontFamily: T.fonts.sans,
    letterSpacing: 0.2,
  },
  mapInspectorScrollView: {
    flex: 1,
  },
  mapInspectorScrollContent: {
    paddingBottom: T.spacing.lg,
  },
  mapSourceNoteText: {
    color: T.colors.textMuted,
    fontSize: 11,
    lineHeight: 17,
  },
  mapAnalysisCard: {
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  mapAnalysisTitle: {
    color: T.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  mapAnalysisHeading: {
    color: T.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  mapAnalysisText: {
    color: T.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  mapAnalysisLoadingBlock: {
    gap: 10,
  },
  mapAnalysisDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mapAnalysisDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: T.colors.accent,
  },
  mapAnalysisLoadingText: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginLeft: 2,
  },
  mapAnalysisSkeletonBlock: {
    gap: 6,
  },
  mapAnalysisSkeletonLine: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    width: "100%",
  },
  mapAnalysisSkeletonLineWide: {
    width: "88%",
  },
  mapAnalysisSkeletonLineShort: {
    width: "72%",
  },
  mapTopicNavigatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mapTopicNavigatorLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  mapTopicDotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  mapTopicDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  mapLibraryMetaSection: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 10,
    gap: 8,
  },
  mapLibraryMetaTitle: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  mapMetaInput: {
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    color: T.colors.text,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlignVertical: "top",
  },
  mapLibraryMetaActions: {
    flexDirection: "row",
  },
  mapAnalysisLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mapAnalysisScroll: {
    maxHeight: 180,
  },
  mapAnalysisVerseList: {
    gap: 10,
    paddingTop: 10,
  },
  mapAnalysisVerseRow: {
    gap: 4,
  },
  mapAnalysisVerseReference: {
    color: T.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  mapAnalysisVerseText: {
    color: T.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  mapHelpHeading: {
    color: T.colors.text,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  mapLegendList: {
    gap: 10,
  },
  mapLegendRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  mapLegendSwatch: {
    width: 18,
    height: 3,
    borderRadius: 999,
    marginTop: 8,
  },
  mapLegendCopy: {
    flex: 1,
    gap: 2,
  },
  mapLegendTitle: {
    color: T.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  mapLegendText: {
    color: T.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  mapHelpParagraph: {
    color: T.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
