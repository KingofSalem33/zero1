import {
  Animated,
  Easing,
  FlatList,
  Keyboard,
  type GestureResponderEvent,
  type PanResponderGestureState,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { resolveBibleBookName, type BibleBookName } from "@zero1/shared";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../components/native/ActionButton";
import { ChatThinkingState } from "../components/native/loading/ChatThinkingState";
import { LoadingDotsNative } from "../components/native/loading/LoadingDotsNative";
import { PressableScale } from "../components/native/PressableScale";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { fetchTraceBundle, fetchVerseText } from "../lib/api";
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
}

interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

interface MapNodeLayout extends VisualNode {
  x: number;
  y: number;
}

interface ParsedBibleStudyResult {
  content: string;
  citations: string[];
  suggestTrace?: boolean;
  connectionCount?: number;
  mapBundle?: VisualContextBundle;
  searchingVerses?: string[];
  activeTools?: string[];
  completedTools?: string[];
  erroredTools?: string[];
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

const MAP_CANVAS_SIZE = 1200;
const MAP_CENTER = MAP_CANVAS_SIZE / 2;
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

function toMapNodeLayouts(bundle: VisualContextBundle): MapNodeLayout[] {
  const byDepth = new Map<number, VisualNode[]>();
  bundle.nodes.forEach((node) => {
    const depth = Number.isFinite(node.depth) ? node.depth : 0;
    const list = byDepth.get(depth) ?? [];
    list.push(node);
    byDepth.set(depth, list);
  });

  const maxDepth = Math.max(...Array.from(byDepth.keys()), 0);
  const radiusStep = maxDepth > 0 ? 140 : 0;
  const positioned: MapNodeLayout[] = [];

  Array.from(byDepth.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([depth, nodes]) => {
      if (depth === 0 || nodes.length === 1) {
        nodes.forEach((node) => {
          positioned.push({
            ...node,
            x: MAP_CENTER,
            y: MAP_CENTER,
          });
        });
        return;
      }

      const radius = depth * radiusStep;
      nodes.forEach((node, index) => {
        const angle = (2 * Math.PI * index) / nodes.length - Math.PI / 2;
        positioned.push({
          ...node,
          x: MAP_CENTER + radius * Math.cos(angle),
          y: MAP_CENTER + radius * Math.sin(angle),
        });
      });
    });

  return positioned;
}

function parseSsePayload(raw: string): ParsedBibleStudyResult {
  const lines = raw.split(/\r?\n/);
  let currentEvent = "";
  let content = "";
  let citations: string[] = [];
  let suggestTrace = false;
  let connectionCount: number | undefined;
  let mapBundle: VisualContextBundle | undefined;
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
        } catch {
          // Ignore malformed SSE event and continue streaming.
        }
      }
    }

    return {
      content,
      citations,
      suggestTrace,
      connectionCount,
      mapBundle,
      searchingVerses,
      activeTools,
      completedTools,
      erroredTools,
    };
  }

  const raw = await response.text();
  const parsed = parseSsePayload(raw);
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
    openMapViewer: (title?: string, bundle?: unknown) => void;
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
  const [mapBusyMessageId, setMapBusyMessageId] = useState<string | null>(null);
  const [quickPromptBusyKey, setQuickPromptBusyKey] = useState<string | null>(
    null,
  );
  const [traceModeEnabled, setTraceModeEnabled] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [, setCompletedTools] = useState<string[]>([]);
  const [searchingVerses, setSearchingVerses] = useState<string[]>([]);
  const [, setErroredTools] = useState<string[]>([]);
  const [mapPrepActive, setMapPrepActive] = useState(false);
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
  const composerInputRef = useRef<TextInput | null>(null);
  const isEmptyState = messages.length === 0;
  const canSendDraft = draft.trim().length > 0;
  const showEmptyThreadChips = isEmptyState && !canSendDraft;
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

  const handleStopStreaming = useCallback(() => {
    cancelStreamTextAnimation();
    streamAbortRef.current?.abort();
  }, [cancelStreamTextAnimation]);

  useEffect(() => {
    return () => {
      cancelStreamTextAnimation();
      streamAbortRef.current?.abort();
    };
  }, [cancelStreamTextAnimation]);

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
    if (nav.isActive) {
      const timerA = setTimeout(() => {
        composerInputRef.current?.focus();
      }, 40);
      const timerB = setTimeout(() => {
        if (!composerInputRef.current?.isFocused()) {
          composerInputRef.current?.focus();
        }
      }, 220);
      return () => {
        clearTimeout(timerA);
        clearTimeout(timerB);
      };
    }

    composerInputRef.current?.blur();
    Keyboard.dismiss();
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
      setMapPrepActive(showMapPrepForRequest);
      setMessages((current) => [
        ...current,
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
              return bundle;
            });
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantMessageId
                  ? { ...item, mapBundle: bundle }
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
            return nextBundle;
          });
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
                  mapBundle: result.mapBundle ?? item.mapBundle,
                  suggestTrace: result.suggestTrace,
                  connectionCount: result.connectionCount,
                }
              : item,
          ),
        );
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: true });
        }, 0);
      } catch (nextError) {
        cancelStreamTextAnimation();
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
      controller.session?.access_token,
      draft,
      ensureStreamTextAnimating,
      history,
      mapSession,
      resetStreamTextAnimation,
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
      nav.openMapViewer(`Map (${bundle.nodes.length} verses)`, bundle);
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setMapBusyMessageId(null);
    }
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
    setMapSession(null);
    setActiveVisualBundle(null);
    setActiveTools([]);
    setCompletedTools([]);
    setSearchingVerses([]);
    setErroredTools([]);
    setDraft("");
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
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={
            traceModeEnabled ? "Trace mode enabled" : "Trace mode disabled"
          }
          onPress={() => setTraceModeEnabled((current) => !current)}
          style={[
            localStyles.traceToggleButton,
            traceModeEnabled ? localStyles.traceToggleButtonActive : null,
          ]}
        >
          <Ionicons
            color={traceModeEnabled ? T.colors.accent : T.colors.textMuted}
            name="git-network-outline"
            size={16}
          />
        </PressableScale>
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
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={busy ? "Stop generating" : "Send message"}
          disabled={!busy && !canSendDraft}
          onPress={() => (busy ? handleStopStreaming() : void handleSend())}
          style={[
            localStyles.sendButton,
            !busy && !canSendDraft ? localStyles.sendButtonDisabled : null,
            !busy && canSendDraft ? localStyles.sendButtonReady : null,
            busy ? localStyles.sendButtonStop : null,
          ]}
        >
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
        </PressableScale>
      </View>
      {!isEmptyState ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Start a new session"
          disabled={busy}
          onPress={handleResetSession}
          style={localStyles.newSessionButton}
        >
          <Text style={localStyles.newSessionButtonLabel}>New Session</Text>
        </PressableScale>
      ) : null}
    </View>
  );

  return (
    <View style={localStyles.chatRoot}>
      {isEmptyState ? (
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
            contentContainerStyle={localStyles.chatListContent}
            renderItem={({ item }) => {
              const isThinkingMessage =
                item.role === "assistant" &&
                busy &&
                item.content.trim().length === 0;
              const isStreamingAssistantMessage =
                item.role === "assistant" &&
                busy &&
                item.id === streamTargetMessageIdRef.current;
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

                    {item.role === "assistant" &&
                    item.content.trim().length > 0 &&
                    !isStreamingAssistantMessage ? (
                      <View style={localStyles.messageActionRow}>
                        <ActionButton
                          variant="secondary"
                          disabled={mapBusyMessageId === item.id}
                          label={
                            mapBusyMessageId === item.id
                              ? "Mapping..."
                              : "Open map"
                          }
                          onPress={() => void handleGenerateMap(item)}
                          style={localStyles.compactAction}
                          labelStyle={localStyles.compactActionLabel}
                        />
                        {item.mapBundle ? (
                          <ActionButton
                            variant="ghost"
                            label="View map"
                            onPress={() =>
                              nav.openMapViewer(
                                `Map (${item.mapBundle?.nodes.length ?? 0} verses)`,
                                item.mapBundle,
                              )
                            }
                            style={localStyles.compactAction}
                            labelStyle={localStyles.compactActionLabel}
                          />
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

      <Modal
        visible={Boolean(versePreviewReference)}
        animationType="fade"
        transparent
        onRequestClose={closeVersePreview}
      >
        <View style={localStyles.referenceModalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close verse preview"
            onPress={closeVersePreview}
            style={localStyles.referenceModalBackdrop}
          />
          <View style={localStyles.referenceModalCard}>
            <View style={localStyles.referenceModalHeader}>
              <Text style={localStyles.referenceModalTitle}>
                {versePreviewReference || "Verse"}
              </Text>
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Close verse preview"
                onPress={closeVersePreview}
                style={localStyles.referenceModalCloseButton}
              >
                <Text style={localStyles.referenceModalCloseLabel}>Close</Text>
              </PressableScale>
            </View>

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
                label="View"
                variant="secondary"
                onPress={openVersePreviewInReader}
                style={localStyles.compactAction}
                labelStyle={localStyles.compactActionLabel}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MapEdge({ from, to }: { from: MapNodeLayout; to: MapNodeLayout }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  return (
    <View
      style={[
        localStyles.edge,
        {
          left: from.x,
          top: from.y,
          width: length,
          transform: [{ rotate: `${angleDeg}deg` }],
        },
      ]}
    />
  );
}

export function MapViewerScreen({
  title,
  bundle,
}: {
  title?: string;
  bundle?: unknown;
}) {
  const controller = useMobileApp();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const visualBundle = isVisualContextBundle(bundle) ? bundle : null;
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  const mapNodes = useMemo(
    () => (visualBundle ? toMapNodeLayouts(visualBundle) : []),
    [visualBundle],
  );
  const nodeLookup = useMemo(
    () => new Map(mapNodes.map((node) => [node.id, node])),
    [mapNodes],
  );
  const selectedNode = selectedNodeId ? nodeLookup.get(selectedNodeId) : null;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (
          _event: GestureResponderEvent,
          _gestureState: PanResponderGestureState,
        ) => {
          panStartRef.current = pan;
        },
        onPanResponderMove: (
          _event: GestureResponderEvent,
          gestureState: PanResponderGestureState,
        ) => {
          setPan({
            x: panStartRef.current.x + gestureState.dx,
            y: panStartRef.current.y + gestureState.dy,
          });
        },
      }),
    [pan],
  );

  if (!visualBundle) {
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
    <View style={styles.tabScreen}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>{title || "Map"}</Text>
        <Text style={styles.panelSubtitle}>
          {visualBundle.nodes.length} verses, {visualBundle.edges.length}{" "}
          connections
        </Text>
        <View style={styles.row}>
          <ActionButton
            variant="ghost"
            label="Zoom -"
            onPress={() => setScale((current) => Math.max(0.5, current - 0.15))}
          />
          <ActionButton
            variant="ghost"
            label="Zoom +"
            onPress={() => setScale((current) => Math.min(2.5, current + 0.15))}
          />
          <ActionButton
            variant="secondary"
            label="Reset"
            onPress={() => {
              setScale(1);
              setPan({ x: 0, y: 0 });
            }}
          />
        </View>
      </SurfaceCard>

      <View style={localStyles.mapViewport} {...panResponder.panHandlers}>
        <View
          style={[
            localStyles.mapCanvas,
            {
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { scale },
              ],
            },
          ]}
        >
          {visualBundle.edges.map((edge, index) => {
            const from = nodeLookup.get(edge.from);
            const to = nodeLookup.get(edge.to);
            if (!from || !to) return null;
            return (
              <MapEdge
                key={`${edge.from}-${edge.to}-${index}`}
                from={from}
                to={to}
              />
            );
          })}

          {mapNodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            return (
              <Pressable
                key={node.id}
                onPress={() => setSelectedNodeId(node.id)}
                style={[
                  localStyles.mapNode,
                  isSelected ? localStyles.mapNodeSelected : null,
                  {
                    left: node.x - 24,
                    top: node.y - 24,
                  },
                ]}
              >
                <Text style={localStyles.mapNodeText}>
                  {node.book_name.slice(0, 3)} {node.chapter}:{node.verse}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {selectedNode ? (
        <SurfaceCard>
          <Text style={styles.panelTitle}>
            {selectedNode.book_name} {selectedNode.chapter}:{selectedNode.verse}
          </Text>
          <ScrollView style={localStyles.nodeDetailScroll}>
            <Text style={styles.connectionSynopsis}>{selectedNode.text}</Text>
          </ScrollView>
          <View style={styles.row}>
            <ActionButton
              variant="primary"
              label="Open in reader"
              onPress={() => {
                void controller.navigateReaderTo(
                  selectedNode.book_name,
                  selectedNode.chapter,
                );
                navigation.navigate("Tabs", { mode: "Reader" } as never);
              }}
            />
          </View>
        </SurfaceCard>
      ) : (
        <SurfaceCard>
          <Text style={styles.caption}>
            Tap a node to inspect verse details.
          </Text>
        </SurfaceCard>
      )}
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
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(12,12,14,0.58)",
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: 32,
    minWidth: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  sendButtonReady: {
    backgroundColor: "rgba(212,175,55,0.12)",
  },
  sendButtonDisabled: {
    opacity: 0.42,
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
    minHeight: 42,
    width: 164,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
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
    fontSize: 9,
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
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "500",
    width: "100%",
  },
  quickPromptLoading: {
    color: T.colors.textMuted,
    fontSize: 10,
    textAlign: "center",
  },
  newSessionButton: {
    alignSelf: "center",
    minHeight: 30,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  newSessionButtonLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  mapViewport: {
    flex: 1,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.lg,
    backgroundColor: "rgba(9, 9, 11, 0.75)",
    overflow: "hidden",
  },
  mapCanvas: {
    width: MAP_CANVAS_SIZE,
    height: MAP_CANVAS_SIZE,
  },
  mapNode: {
    position: "absolute",
    width: 48,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  mapNodeSelected: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  mapNodeText: {
    color: T.colors.text,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  edge: {
    position: "absolute",
    height: 1,
    backgroundColor: "rgba(212, 175, 55, 0.35)",
  },
  nodeDetailScroll: {
    maxHeight: 140,
  },
});
