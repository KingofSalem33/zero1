import {
  FlatList,
  type GestureResponderEvent,
  type PanResponderGestureState,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useNavigation,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import { ActionButton } from "../components/native/ActionButton";
import { PressableScale } from "../components/native/PressableScale";
import { SearchInput } from "../components/native/SearchInput";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { fetchTraceBundle } from "../lib/api";
import { MOBILE_ENV } from "../lib/env";
import {
  type VisualContextBundle,
  type VisualNode,
  isVisualContextBundle,
} from "../types/visualization";
import { styles, T } from "../theme/mobileStyles";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  mapBundle?: VisualContextBundle;
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
}

const MAP_CANVAS_SIZE = 1200;
const MAP_CENTER = MAP_CANVAS_SIZE / 2;

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
      if (currentEvent === "done" && Array.isArray(parsed.citations)) {
        citations = parsed.citations.filter(
          (entry): entry is string => typeof entry === "string",
        );
      }
    } catch {
      // Ignore malformed SSE line and continue parsing.
    }
  }

  return { content, citations };
}

async function streamBibleStudy({
  prompt,
  history,
  accessToken,
  onDelta,
}: {
  prompt: string;
  history: ChatHistoryMessage[];
  accessToken?: string;
  onDelta: (delta: string) => void;
}): Promise<ParsedBibleStudyResult> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${MOBILE_ENV.API_URL}/api/bible-study`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: prompt,
      history,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed (${response.status})`);
  }

  const raw = await response.text();
  const parsed = parseSsePayload(raw);
  if (parsed.content) {
    onDelta(parsed.content);
  }
  return parsed;
}

export function ChatScreen({
  nav,
}: {
  nav: {
    openMapViewer: (title?: string, bundle?: unknown) => void;
    openReader: (book: string, chapter: number) => void;
    pendingPrompt?: string;
    autoSend?: boolean;
    clearPendingPrompt: () => void;
  };
}) {
  const controller = useMobileApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapBusyMessageId, setMapBusyMessageId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const handledPromptRef = useRef<string | null>(null);

  const history = useMemo<ChatHistoryMessage[]>(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  );

  const handleSend = useCallback(
    async (explicitPrompt?: string) => {
      const prompt = (explicitPrompt ?? draft).trim();
      if (!prompt || busy) return;

      const userMessageId = `user-${Date.now()}`;
      const assistantMessageId = `assistant-${Date.now()}`;
      setError(null);
      setBusy(true);
      setDraft("");
      setMessages((current) => [
        ...current,
        { id: userMessageId, role: "user", content: prompt },
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      try {
        const result = await streamBibleStudy({
          prompt,
          history,
          accessToken: controller.session?.access_token,
          onDelta: (delta) => {
            setMessages((current) =>
              current.map((item) =>
                item.id === assistantMessageId
                  ? { ...item, content: `${item.content}${delta}` }
                  : item,
              ),
            );
          },
        });

        setMessages((current) =>
          current.map((item) =>
            item.id === assistantMessageId
              ? {
                  ...item,
                  content: result.content,
                  citations: result.citations,
                }
              : item,
          ),
        );
        setTimeout(() => {
          listRef.current?.scrollToEnd({ animated: true });
        }, 0);
      } catch (nextError) {
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
        setMessages((current) =>
          current.filter((item) => item.id !== assistantMessageId),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, controller.session?.access_token, draft, history],
  );

  useEffect(() => {
    const prompt = nav.pendingPrompt?.trim();
    if (!prompt) return;
    const signature = `${prompt}:${Boolean(nav.autoSend)}`;
    if (handledPromptRef.current === signature) return;
    handledPromptRef.current = signature;
    nav.clearPendingPrompt();
    setDraft(prompt);
    if (nav.autoSend) {
      void handleSend(prompt);
    }
  }, [nav.pendingPrompt, nav.autoSend, handleSend]);

  async function handleGenerateMap(message: ChatMessage) {
    if (mapBusyMessageId) return;
    setMapBusyMessageId(message.id);
    setError(null);
    try {
      const bundle = await fetchTraceBundle({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: message.content,
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

  return (
    <View style={styles.tabScreen}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>Chat</Text>
        <Text style={styles.panelSubtitle}>
          Ask questions, deepen study, and open relationship maps from answers.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </SurfaceCard>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View
            style={[
              localStyles.messageBubble,
              item.role === "user"
                ? localStyles.userBubble
                : localStyles.assistantBubble,
            ]}
          >
            <Text style={localStyles.messageRole}>
              {item.role === "user" ? "You" : "Zero1"}
            </Text>
            <Text style={localStyles.messageText}>
              {item.content || (busy && item.role === "assistant" ? "..." : "")}
            </Text>

            {item.citations && item.citations.length > 0 ? (
              <View style={styles.suggestionRow}>
                {item.citations.slice(0, 6).map((citation) => (
                  <PressableScale
                    key={`${item.id}-${citation}`}
                    onPress={() => {
                      const parts = citation.match(/^(.+)\s+(\d+):(\d+)$/);
                      if (!parts) return;
                      void controller.navigateReaderTo(
                        parts[1],
                        Number(parts[2]),
                      );
                      nav.openReader(parts[1], Number(parts[2]));
                    }}
                    style={styles.suggestionChip}
                  >
                    <Text style={styles.suggestionChipLabel}>{citation}</Text>
                  </PressableScale>
                ))}
              </View>
            ) : null}

            {item.role === "assistant" && item.content.trim().length > 0 ? (
              <View style={styles.row}>
                <ActionButton
                  variant="secondary"
                  disabled={mapBusyMessageId === item.id}
                  label={
                    mapBusyMessageId === item.id ? "Mapping..." : "Open map"
                  }
                  onPress={() => void handleGenerateMap(item)}
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
                  />
                ) : null}
              </View>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <SurfaceCard>
            <Text style={styles.emptyTitle}>Start a conversation</Text>
            <Text style={styles.emptySubtitle}>
              Ask about a verse, doctrine, or relationship between passages.
            </Text>
          </SurfaceCard>
        }
      />

      <SurfaceCard>
        <SearchInput
          multiline
          placeholder="Ask a Bible study question..."
          value={draft}
          onChangeText={setDraft}
        />
        <View style={styles.row}>
          <ActionButton
            label={busy ? "Sending..." : "Send"}
            variant="primary"
            disabled={busy || !draft.trim()}
            onPress={() => void handleSend()}
          />
          <ActionButton
            label="Clear"
            variant="secondary"
            disabled={busy || messages.length === 0}
            onPress={() => {
              setMessages([]);
              setError(null);
            }}
          />
        </View>
      </SurfaceCard>
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
                navigation.navigate("Tabs", { screen: "Reader" });
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
  messageBubble: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.lg,
    padding: T.spacing.md,
    gap: T.spacing.xs,
  },
  userBubble: {
    backgroundColor: T.colors.surface,
  },
  assistantBubble: {
    backgroundColor: T.colors.surfaceRaised,
  },
  messageRole: {
    color: T.colors.accent,
    fontSize: T.typography.caption,
    fontWeight: "700",
  },
  messageText: {
    color: T.colors.text,
    fontSize: T.typography.body,
    lineHeight: 24,
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
