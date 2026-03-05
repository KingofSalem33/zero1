import {
  ActivityIndicator,
  FlatList,
  type GestureResponderEvent,
  type PanResponderGestureState,
  Modal,
  PanResponder,
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
import { ActionButton } from "../components/native/ActionButton";
import { PressableScale } from "../components/native/PressableScale";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { fetchTraceBundle, fetchVerseText } from "../lib/api";
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
const REFERENCE_PARTS_REGEX =
  /((?:\[)?(?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?(?:\])?)/g;
const REFERENCE_MATCH_REGEX =
  /^(?:\[)?((?:\d\s)?[A-Z][a-z]+(?:\s(?:of\s)?[A-Z][a-z]+)*\s\d+:\d+(?:-\d+)?)(?:\])?$/;
const CHAT_QUICK_PROMPTS = [
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
  const book = parsed[1].trim();
  const chapter = Number(parsed[2]);
  const verse = Number(parsed[3]);
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

  const streamReader = response.body?.getReader?.();
  if (streamReader) {
    const decoder = new globalThis.TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let content = "";
    let citations: string[] = [];

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
          if (currentEvent === "done" && Array.isArray(parsed.citations)) {
            citations = parsed.citations.filter(
              (entry): entry is string => typeof entry === "string",
            );
          }
        } catch {
          // Ignore malformed SSE event and continue streaming.
        }
      }
    }

    return { content, citations };
  }

  const raw = await response.text();
  const parsed = parseSsePayload(raw);
  if (parsed.content) {
    onDelta(parsed.content);
  }
  return parsed;
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
  const [quickPromptBusyKey, setQuickPromptBusyKey] = useState<string | null>(
    null,
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
  const isEmptyState = messages.length === 0;

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
      setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: true });
      }, 0);

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

  useEffect(() => {
    if (!versePreviewReference) return;
    const parsed = parseScriptureReference(versePreviewReference);
    if (!parsed) {
      setVersePreviewError("Reference format was invalid.");
      setVersePreviewText("");
      setVersePreviewLoading(false);
      return;
    }

    let cancelled = false;
    setVersePreviewLoading(true);
    setVersePreviewError(null);
    setVersePreviewText("");

    fetchVerseText({
      apiBaseUrl: MOBILE_ENV.API_URL,
      reference: parsed.normalizedReference,
    })
      .then((result) => {
        if (cancelled) return;
        setVersePreviewText(result.text || "");
      })
      .catch((nextError) => {
        if (cancelled) return;
        setVersePreviewError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
      })
      .finally(() => {
        if (cancelled) return;
        setVersePreviewLoading(false);
      });

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

  async function handleQuickPrompt(prompt: string, key: string) {
    if (busy) return;
    setQuickPromptBusyKey(key);
    try {
      await handleSend(prompt);
    } finally {
      setQuickPromptBusyKey(null);
    }
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
      setVersePreviewError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setVersePreviewTraceLoading(false);
    }
  }

  const handleInlineReferencePress = useCallback((reference: string) => {
    if (!parseScriptureReference(reference)) return;
    setVersePreviewReference(reference);
  }, []);

  return (
    <View style={localStyles.chatRoot}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        style={localStyles.chatList}
        contentContainerStyle={localStyles.chatListContent}
        renderItem={({ item }) => (
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
                <Text style={localStyles.messageText}>{item.content}</Text>
              ) : null}

              {item.role === "assistant" ? (
                <AssistantRichText
                  content={item.content || (busy ? "..." : "")}
                  onReferencePress={handleInlineReferencePress}
                />
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

              {item.role === "assistant" && item.content.trim().length > 0 ? (
                <View style={localStyles.messageActionRow}>
                  <ActionButton
                    variant="secondary"
                    disabled={mapBusyMessageId === item.id}
                    label={
                      mapBusyMessageId === item.id ? "Mapping..." : "Open map"
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
        )}
        ListEmptyComponent={
          <View style={localStyles.emptyState}>
            <Text style={localStyles.emptyStateTitle}>
              Start a conversation
            </Text>
            <Text style={localStyles.emptyStateSubtitle}>
              Ask about a verse, doctrine, or relationship between passages.
            </Text>
          </View>
        }
      />

      <View style={localStyles.chatComposerWrap}>
        {error ? (
          <View style={localStyles.errorBanner}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
        <View style={localStyles.chatComposer}>
          <TextInput
            multiline
            placeholder="Ask a Bible study question..."
            placeholderTextColor={T.colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            style={localStyles.chatInput}
          />
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={busy ? "Sending message" : "Send message"}
            disabled={busy || !draft.trim()}
            onPress={() => void handleSend()}
            style={[
              localStyles.sendButton,
              busy || !draft.trim() ? localStyles.sendButtonDisabled : null,
            ]}
          >
            <Text style={localStyles.sendButtonLabel}>
              {busy ? "..." : "Send"}
            </Text>
          </PressableScale>
        </View>

        <View style={localStyles.quickPromptRow}>
          {CHAT_QUICK_PROMPTS.map((entry) => (
            <PressableScale
              key={entry.key}
              accessibilityRole="button"
              accessibilityLabel={entry.label}
              disabled={busy}
              onPress={() => void handleQuickPrompt(entry.prompt, entry.key)}
              style={[
                localStyles.quickPromptButton,
                quickPromptBusyKey === entry.key
                  ? localStyles.quickPromptButtonBusy
                  : null,
              ]}
            >
              <Text style={localStyles.quickPromptLabel}>
                {quickPromptBusyKey === entry.key ? "Sending..." : entry.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        {!isEmptyState ? (
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Start a new session"
            disabled={busy}
            onPress={() => {
              setMessages([]);
              setError(null);
            }}
            style={localStyles.newSessionButton}
          >
            <Text style={localStyles.newSessionButtonLabel}>New Session</Text>
          </PressableScale>
        ) : null}
      </View>

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
                <View style={localStyles.referenceModalLoadingRow}>
                  <ActivityIndicator color={T.colors.accent} />
                  <Text style={styles.caption}>Loading verse...</Text>
                </View>
              ) : null}
              {versePreviewError ? (
                <Text style={styles.error}>{versePreviewError}</Text>
              ) : null}
              {!versePreviewLoading && !versePreviewError ? (
                <Text style={localStyles.referenceModalVerseText}>
                  {versePreviewText || "Verse text unavailable."}
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
  chatList: {
    flex: 1,
  },
  chatListContent: {
    flexGrow: 1,
    paddingHorizontal: T.spacing.md,
    paddingTop: T.spacing.sm,
    paddingBottom: T.spacing.md,
    gap: T.spacing.sm,
  },
  messageRow: {
    width: "100%",
  },
  messageRowUser: {
    alignItems: "flex-end",
  },
  messageRowAssistant: {
    alignItems: "flex-start",
  },
  messageBubble: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: T.spacing.sm,
    gap: 6,
    maxWidth: "92%",
  },
  userBubble: {
    backgroundColor: T.colors.surfaceRaised,
    borderColor: "rgba(255,255,255,0.1)",
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
    fontSize: T.typography.body,
    lineHeight: 25,
  },
  assistantBlocks: {
    gap: 10,
  },
  assistantHeading: {
    color: "rgba(232,232,232,0.95)",
    fontSize: 19,
    lineHeight: 26,
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
    fontSize: T.typography.body,
    lineHeight: 25,
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
    borderColor: T.colors.border,
    backgroundColor: "rgba(39,39,42,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  citationChipLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
  },
  messageActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 2,
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
    paddingTop: 10,
    paddingHorizontal: 4,
    gap: 8,
  },
  emptyStateTitle: {
    color: T.colors.text,
    fontSize: T.typography.subheading,
    fontWeight: "700",
  },
  emptyStateSubtitle: {
    color: T.colors.textMuted,
    fontSize: T.typography.bodySm,
    lineHeight: 21,
  },
  chatComposerWrap: {
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    backgroundColor: "rgba(12,12,14,0.97)",
    paddingHorizontal: T.spacing.md,
    paddingTop: T.spacing.sm,
    paddingBottom: T.spacing.sm,
    gap: 8,
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: T.colors.danger,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.dangerSoft,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 6,
  },
  chatComposer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: T.radius.lg,
    backgroundColor: "rgba(39,39,42,0.45)",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 8,
  },
  chatInput: {
    flex: 1,
    maxHeight: 124,
    minHeight: 26,
    color: T.colors.text,
    fontSize: T.typography.body,
    lineHeight: 22,
    paddingVertical: 0,
  },
  sendButton: {
    minHeight: 32,
    minWidth: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonLabel: {
    color: T.colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  quickPromptRow: {
    flexDirection: "row",
    gap: 6,
  },
  quickPromptButton: {
    flex: 1,
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(39,39,42,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickPromptButtonBusy: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  quickPromptLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
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
