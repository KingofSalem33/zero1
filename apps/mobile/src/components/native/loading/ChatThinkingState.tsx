import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useReducedMotion } from "../../../hooks/useReducedMotion";
import { T } from "../../../theme/mobileStyles";
import { LoadingDotsNative } from "./LoadingDotsNative";

interface ChatThinkingStateProps {
  verses: string[];
  tracedText?: string;
  activeTools?: string[];
  completedTools?: string[];
}

const NODE_POSITIONS: Array<{ x: number; y: number }> = [
  { x: 50, y: 50 },
  { x: 26, y: 32 },
  { x: 74, y: 28 },
  { x: 78, y: 62 },
  { x: 22, y: 68 },
  { x: 50, y: 18 },
  { x: 50, y: 82 },
  { x: 14, y: 50 },
  { x: 86, y: 50 },
  { x: 34, y: 14 },
  { x: 66, y: 86 },
  { x: 85, y: 22 },
];

const EDGE_TARGETS: number[] = [-1, 0, 0, 0, 0, 1, 3, 4, 2, 5, 6, 8];
const GRAPH_PADDING_X = 18;
const GRAPH_PADDING_Y = 14;

type Phase = "searching" | "tracing" | "building";

function derivePhase(
  verses: string[],
  activeTools: string[],
  completedTools: string[],
): Phase {
  const totalTools = activeTools.length + completedTools.length;
  if (verses.length > 3 && totalTools > 0 && completedTools.length > 0) {
    return "building";
  }
  if (verses.length > 0) {
    return "tracing";
  }
  return "searching";
}

function extractBookName(ref: string): string {
  const match = ref.match(/^(\d?\s?[A-Za-z]+(?:\s(?:of\s)?[A-Za-z]+)*)\s+\d/);
  return match ? match[1] : ref;
}

function getUniqueBooks(verses: string[]): string[] {
  const seen = new Set<string>();
  const books: string[] = [];
  for (const verse of verses) {
    const book = extractBookName(verse);
    if (seen.has(book)) continue;
    seen.add(book);
    books.push(book);
  }
  return books;
}

function buildContextualMessage(
  phase: Phase,
  verses: string[],
  books: string[],
): string {
  if (phase === "searching") return "Searching Scripture";
  if (phase === "building") {
    if (books.length > 2) return `Weaving ${books.length} books into the map`;
    return "Building the narrative map";
  }
  const count = verses.length;
  const latestBook = books[books.length - 1];
  if (books.length >= 3) return `Threads found across ${books.length} books`;
  if (count === 1 && latestBook) return `Tracing through ${latestBook}`;
  if (latestBook) return `Found ${count} connections in ${latestBook}`;
  return "Tracing connections";
}

function projectNodeToGraph(
  node: { x: number; y: number },
  graphSize: { width: number; height: number },
): { x: number; y: number } {
  const innerWidth = Math.max(graphSize.width - GRAPH_PADDING_X * 2, 1);
  const innerHeight = Math.max(graphSize.height - GRAPH_PADDING_Y * 2, 1);
  return {
    x: GRAPH_PADDING_X + (node.x / 100) * innerWidth,
    y: GRAPH_PADDING_Y + (node.y / 100) * innerHeight,
  };
}

export function ChatThinkingState({
  verses,
  tracedText,
  activeTools = [],
  completedTools = [],
}: ChatThinkingStateProps) {
  const reduceMotion = useReducedMotion();
  const [idleNodeCount, setIdleNodeCount] = useState(1);
  const [graphSize, setGraphSize] = useState({ width: 300, height: 150 });
  const [trackWidth, setTrackWidth] = useState(0);
  const shimmerX = useRef(new Animated.Value(-80)).current;
  const latestNodePulse = useRef(new Animated.Value(0)).current;

  const phase = derivePhase(verses, activeTools, completedTools);
  const books = useMemo(() => getUniqueBooks(verses), [verses]);
  const contextualMessage = useMemo(
    () => buildContextualMessage(phase, verses, books),
    [books, phase, verses],
  );
  const displayText = useMemo(() => {
    const source = tracedText?.trim() || "Connections across Scripture";
    if (source.length > 60) return `${source.slice(0, 57)}...`;
    return source;
  }, [tracedText]);
  const visibleNodeCount = useMemo(() => {
    const minNodes = verses.length === 0 ? idleNodeCount : 0;
    return Math.min(Math.max(verses.length, minNodes), NODE_POSITIONS.length);
  }, [idleNodeCount, verses.length]);

  const edges = useMemo(() => {
    const next: Array<{
      x: number;
      y: number;
      length: number;
      angleDeg: number;
      key: string;
    }> = [];
    for (let i = 1; i < visibleNodeCount; i += 1) {
      const fromIndex = EDGE_TARGETS[i] ?? 0;
      if (fromIndex < 0 || fromIndex >= visibleNodeCount) continue;
      const from = projectNodeToGraph(NODE_POSITIONS[fromIndex], graphSize);
      const to = projectNodeToGraph(NODE_POSITIONS[i], graphSize);
      const fromX = from.x;
      const fromY = from.y;
      const toX = to.x;
      const toY = to.y;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2;
      next.push({
        x: midX - length / 2,
        y: midY - 0.5,
        length,
        angleDeg,
        key: `edge-${i}-${fromIndex}`,
      });
    }
    return next;
  }, [graphSize.height, graphSize.width, visibleNodeCount]);

  useEffect(() => {
    if (verses.length > 0) return;
    if (reduceMotion) return;
    const timer = setInterval(() => {
      setIdleNodeCount((current) => (current >= 6 ? 1 : current + 1));
    }, 320);
    return () => clearInterval(timer);
  }, [reduceMotion, verses.length]);

  useEffect(() => {
    if (reduceMotion || trackWidth <= 0) return;
    const loop = Animated.loop(
      Animated.timing(shimmerX, {
        toValue: trackWidth + 80,
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    shimmerX.setValue(-80);
    loop.start();
    return () => {
      loop.stop();
      shimmerX.stopAnimation();
    };
  }, [reduceMotion, shimmerX, trackWidth]);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(latestNodePulse, {
          toValue: 1,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(latestNodePulse, {
          toValue: 0,
          duration: 760,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      latestNodePulse.stopAnimation();
    };
  }, [latestNodePulse, reduceMotion]);

  function handleGraphLayout(event: LayoutChangeEvent) {
    const width = Math.max(event.nativeEvent.layout.width, 1);
    const height = Math.max(event.nativeEvent.layout.height, 1);
    setGraphSize({ width, height });
  }

  return (
    <View style={localStyles.wrap}>
      <View style={localStyles.header}>
        <Text style={localStyles.eyebrow}>Seeking</Text>
        <Text style={localStyles.title} numberOfLines={1}>
          {displayText}
        </Text>
      </View>

      <LoadingDotsNative
        label={contextualMessage}
        labelStyle={localStyles.label}
      />

      <View style={localStyles.graphWrap} onLayout={handleGraphLayout}>
        {edges.map((edge) => (
          <View
            key={edge.key}
            style={[
              localStyles.edge,
              {
                left: edge.x,
                top: edge.y,
                width: edge.length,
                transform: [{ rotate: `${edge.angleDeg}deg` }],
              },
            ]}
          />
        ))}

        {NODE_POSITIONS.map((node, index) => {
          const projected = projectNodeToGraph(node, graphSize);
          const left = projected.x - 4;
          const top = projected.y - 2;
          const discovered = index < visibleNodeCount;
          const isLatest =
            discovered && index === visibleNodeCount - 1 && index > 0;
          return (
            <View key={`node-${index}`}>
              <View
                style={[
                  localStyles.nodeBg,
                  {
                    left,
                    top,
                  },
                ]}
              />
              {discovered ? (
                <View
                  style={[
                    localStyles.nodeFg,
                    {
                      left,
                      top,
                      opacity: reduceMotion ? 0.8 : 1,
                    },
                  ]}
                />
              ) : null}
              {isLatest ? (
                <Animated.View
                  style={[
                    localStyles.nodePulse,
                    {
                      left: left - 1.5,
                      top: top - 1.5,
                      opacity: latestNodePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.25, 0.55],
                      }),
                      transform: [
                        {
                          scale: latestNodePulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.12],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={localStyles.bottomRow}>
        <Text style={localStyles.metaLabel}>
          {verses.length > 0
            ? `${verses.length} verse${verses.length === 1 ? "" : "s"} connected`
            : "Discovering verses"}
        </Text>
        {verses.length > 0 ? (
          <Text style={localStyles.latestVerse} numberOfLines={1}>
            {verses[verses.length - 1]}
          </Text>
        ) : null}
      </View>

      <View
        style={localStyles.progressTrack}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            localStyles.progressGlow,
            reduceMotion
              ? {
                  left: 0,
                  width: "40%",
                }
              : {
                  transform: [{ translateX: shimmerX }],
                },
          ]}
        />
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  wrap: {
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(24,24,27,0.45)",
  },
  header: {
    gap: 2,
  },
  eyebrow: {
    color: "rgba(161,161,170,0.74)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "600",
  },
  title: {
    color: "rgba(212,175,55,0.96)",
    fontSize: 12.5,
    fontWeight: "700",
  },
  label: {
    color: "rgba(161, 161, 170, 0.95)",
    fontWeight: "500",
  },
  graphWrap: {
    width: "100%",
    height: 148,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    backgroundColor: "rgba(9,9,11,0.22)",
    overflow: "hidden",
  },
  edge: {
    position: "absolute",
    height: 1,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  nodeBg: {
    position: "absolute",
    width: 8,
    height: 4,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  nodeFg: {
    position: "absolute",
    width: 8,
    height: 4,
    borderRadius: 1.5,
    borderWidth: 0.7,
    borderColor: "rgba(212,175,55,0.68)",
    backgroundColor: "transparent",
  },
  nodePulse: {
    position: "absolute",
    width: 11,
    height: 7,
    borderRadius: 2,
    borderWidth: 0.8,
    borderColor: "rgba(212,175,55,0.36)",
    backgroundColor: "transparent",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  metaLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
  },
  latestVerse: {
    flexShrink: 1,
    color: "rgba(212,175,55,0.78)",
    fontSize: 10.5,
    fontWeight: "600",
    textAlign: "right",
  },
  progressTrack: {
    height: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  progressGlow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: "rgba(212,175,55,0.45)",
  },
});
