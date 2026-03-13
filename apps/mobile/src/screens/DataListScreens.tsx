import {
  Alert,
  Animated,
  FlatList,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  Easing,
} from "react-native";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Directions,
  FlingGestureHandler,
  State,
} from "react-native-gesture-handler";
import { ActionButton } from "../components/native/ActionButton";
import { BottomSheetSurface } from "../components/native/BottomSheetSurface";
import { ChipButton } from "../components/native/ChipButton";
import { EmptyState } from "../components/native/EmptyState";
import { NoteEditorModal } from "../components/native/NoteEditorModal";
import {
  BookmarkCardSkeleton,
  ConnectionCardSkeleton,
  HighlightCardSkeleton,
  LibraryMapSkeleton,
} from "../components/native/loading/LibrarySkeletons";
import { PressableScale } from "../components/native/PressableScale";
import { SearchInput } from "../components/native/SearchInput";
import { StatCard } from "../components/native/StatCard";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";
import {
  BookmarkCard,
  ConnectionCard,
  HighlightCard,
  LibraryMapCard,
  formatRelativeDate,
} from "./common/EntityCards";
import type {
  LibraryConnectionItem,
  LibraryMapItem,
  MobileHighlightItem,
} from "../lib/api";
import type { MobileGoDeeperPayload } from "../types/chat";

function includesQuery(
  fields: Array<string | null | undefined>,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  const haystack = fields
    .map((value) => value ?? "")
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalizedQuery);
}

type LibraryMode = "connections" | "maps" | "highlights";

const LIBRARY_MODES: Array<{ key: LibraryMode; label: string }> = [
  { key: "connections", label: "Connections" },
  { key: "maps", label: "Maps" },
  { key: "highlights", label: "Highlights" },
];

const LIBRARY_MODE_EMPTY_HINTS: Record<LibraryMode, string> = {
  connections: "Save a connection from discovery or chat to build this tab.",
  maps: "Save a map from Chat or Connection detail to build this tab.",
  highlights: "Use New highlight to create one, then pull down to sync.",
};

const LIBRARY_MODE_ORDER = LIBRARY_MODES.map((mode) => mode.key);
const LIBRARY_MODE_SWIPE_COOLDOWN_MS = 240;
const LIBRARY_HEADER_HIDE_SCROLL_DISTANCE = 34;
const LIBRARY_HEADER_TOGGLE_ANIMATION_MS = 180;

function formatHighlightShareText(item: MobileHighlightItem): string {
  return [
    item.referenceLabel,
    item.text,
    `Color: ${item.color}`,
    item.note?.trim() ? `Note: ${item.note.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatConnectionShareText(item: LibraryConnectionItem): string {
  return [
    `${item.fromVerse.reference} -> ${item.toVerse.reference}`,
    item.synopsis,
    item.explanation?.trim() ? item.explanation.trim() : null,
    item.note?.trim() ? `Note: ${item.note.trim()}` : null,
    item.tags.length > 0 ? `Tags: ${item.tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function useScrollHideHeader(resetKey: string) {
  const [headerVisible, setHeaderVisible] = useState(true);
  const [headerMeasuredHeight, setHeaderMeasuredHeight] = useState(88);
  const lastScrollYRef = useRef(0);
  const headerScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const headerScrollDeltaRef = useRef(0);
  const headerVisibilityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(headerVisibilityAnim, {
      toValue: headerVisible ? 1 : 0,
      duration: LIBRARY_HEADER_TOGGLE_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [headerVisible, headerVisibilityAnim]);

  useEffect(() => {
    setHeaderVisible(true);
    lastScrollYRef.current = 0;
    headerScrollDirectionRef.current = 0;
    headerScrollDeltaRef.current = 0;
  }, [resetKey]);

  function handleScroll(yOffset: number) {
    const clampedY = Math.max(0, yOffset);
    const deltaY = clampedY - lastScrollYRef.current;
    const deltaAbs = Math.abs(deltaY);
    lastScrollYRef.current = clampedY;

    if (deltaAbs < 0.5) {
      return;
    }

    if (clampedY <= 0) {
      if (!headerVisible) {
        setHeaderVisible(true);
      }
      headerScrollDirectionRef.current = 0;
      headerScrollDeltaRef.current = 0;
      return;
    }

    const direction: -1 | 1 = deltaY > 0 ? 1 : -1;
    if (headerScrollDirectionRef.current !== direction) {
      headerScrollDirectionRef.current = direction;
      headerScrollDeltaRef.current = 0;
    }

    headerScrollDeltaRef.current += deltaAbs;
    if (
      direction === 1 &&
      headerVisible &&
      headerScrollDeltaRef.current >= LIBRARY_HEADER_HIDE_SCROLL_DISTANCE
    ) {
      setHeaderVisible(false);
      headerScrollDeltaRef.current = 0;
      return;
    }

    if (
      direction === -1 &&
      !headerVisible &&
      headerScrollDeltaRef.current >= LIBRARY_HEADER_HIDE_SCROLL_DISTANCE
    ) {
      setHeaderVisible(true);
      headerScrollDeltaRef.current = 0;
    }
  }

  const animatedStyle = {
    opacity: headerVisibilityAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
    transform: [
      {
        translateY: headerVisibilityAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [-headerMeasuredHeight, 0],
        }),
      },
    ],
    marginBottom: headerVisibilityAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [-headerMeasuredHeight, 0],
    }),
  } as const;

  function handleLayout(measuredHeight: number) {
    if (measuredHeight > 0 && measuredHeight !== headerMeasuredHeight) {
      setHeaderMeasuredHeight(measuredHeight);
    }
  }

  return {
    animatedStyle,
    handleLayout,
    handleScroll,
  };
}

function buildHighlightsInsightPayload(
  highlights: MobileHighlightItem[],
): MobileGoDeeperPayload {
  const refs = highlights
    .slice(0, 20)
    .map((item) => {
      const note = item.note?.trim();
      return `- ${item.referenceLabel} (${item.color})${note ? ` "${note}"` : ""}`;
    })
    .join("\n");

  return {
    displayText: `Analyze my ${highlights.length} highlights`,
    prompt:
      `Analyze my Bible highlights and share insights. Here are my highlighted passages:\n\n${refs}\n\n` +
      "Please identify:\n" +
      "1. Recurring themes or patterns across these highlights\n" +
      "2. How these passages connect theologically\n" +
      "3. A short devotional reflection based on what I have been drawn to\n\n" +
      "Keep the tone scholarly but warm.",
    mode: "exegesis_long",
  };
}

function LibraryModeTabs({
  activeMode,
  onChange,
}: {
  activeMode: LibraryMode;
  onChange: (mode: LibraryMode) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.libraryModeTabsRow}
    >
      {LIBRARY_MODES.map((mode) => {
        const active = mode.key === activeMode;
        return (
          <ChipButton
            key={mode.key}
            onPress={() => onChange(mode.key)}
            selected={active}
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Open ${mode.label}`}
            label={mode.label}
            style={styles.libraryModeTab}
            labelStyle={[
              styles.libraryModeTabLabel,
              active ? styles.libraryModeTabLabelActive : null,
            ]}
          />
        );
      })}
    </ScrollView>
  );
}

function LibrarySheet({
  visible,
  title,
  subtitle,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <BottomSheetSurface
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      snapPoints={["68%"]}
    >
      <ScrollView
        contentContainerStyle={styles.librarySheetScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </BottomSheetSurface>
  );
}

function ConnectionDetailSheet({
  item,
  visible,
  mutationBusy,
  mutationError,
  onClose,
  onSave,
  onDelete,
}: {
  item: LibraryConnectionItem | null;
  visible: boolean;
  mutationBusy: boolean;
  mutationError: string | null;
  onClose: () => void;
  onSave: (note: string) => void | Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [noteDraft, setNoteDraft] = useState("");
  const [noteEditorVisible, setNoteEditorVisible] = useState(false);

  useEffect(() => {
    if (!item) return;
    setNoteDraft(item.note ?? "");
    setNoteEditorVisible(false);
  }, [item?.id]);

  if (!item) return null;

  const connectedVerses =
    item.connectedVerses && item.connectedVerses.length > 0
      ? item.connectedVerses
      : [item.fromVerse, item.toVerse];

  return (
    <>
      <LibrarySheet
        visible={visible && !noteEditorVisible}
        title="Connection"
        subtitle={`${item.fromVerse.reference} -> ${item.toVerse.reference}`}
        onClose={onClose}
      >
        <View style={styles.featureCard}>
          <Text style={styles.connectionSynopsis}>{item.synopsis}</Text>
          {item.explanation ? (
            <Text style={styles.connectionNote}>{item.explanation}</Text>
          ) : null}
          <View style={styles.connectionMetaWrap}>
            <Text style={styles.metaPill}>{item.connectionType}</Text>
            <Text style={styles.metaPill}>
              Similarity {Math.round(item.similarity * 100)}%
            </Text>
            {connectedVerses.slice(0, 2).map((verse) => (
              <Text
                key={`${item.id}-${verse.reference}`}
                style={styles.metaPill}
              >
                {verse.reference}
              </Text>
            ))}
            {connectedVerses.length > 2 ? (
              <Text style={styles.metaPill}>
                +{connectedVerses.length - 2} more
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.libraryEditorCard}>
          <View style={styles.row}>
            <ActionButton
              label="Note"
              onPress={() => setNoteEditorVisible(true)}
              disabled={mutationBusy}
              variant="secondary"
            />
            <ActionButton
              label="Share"
              onPress={() =>
                void Share.share({
                  title: `${item.fromVerse.reference} -> ${item.toVerse.reference}`,
                  message: formatConnectionShareText(item),
                })
              }
              disabled={mutationBusy}
              variant="ghost"
            />
            <ActionButton
              label="Delete"
              onPress={() => onDelete(item.id)}
              disabled={mutationBusy}
              variant="danger"
            />
          </View>
          {mutationError ? (
            <Text style={styles.error}>{mutationError}</Text>
          ) : null}
        </View>
      </LibrarySheet>
      <NoteEditorModal
        visible={visible && noteEditorVisible}
        title="Connection note"
        subtitle={`${item.fromVerse.reference} -> ${item.toVerse.reference}`}
        value={noteDraft}
        onChangeText={setNoteDraft}
        onClose={() => {
          setNoteEditorVisible(false);
          setNoteDraft(item.note ?? "");
          onClose();
        }}
        onSave={async () => {
          await onSave(noteDraft);
          setNoteEditorVisible(false);
          onClose();
        }}
        busy={mutationBusy}
        error={mutationError}
        placeholder="Add context for this connection"
      />
    </>
  );
}

function MapDetailSheet({
  item,
  visible,
  mutationBusy,
  mutationError,
  onClose,
  onSave,
  onOpen,
  onDelete,
}: {
  item: LibraryMapItem | null;
  visible: boolean;
  mutationBusy: boolean;
  mutationError: string | null;
  onClose: () => void;
  onSave: (title: string, note: string, tags: string) => void | Promise<void>;
  onOpen: (item: LibraryMapItem) => void;
  onDelete: (id: string) => void;
}) {
  const [titleDraft, setTitleDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [noteEditorVisible, setNoteEditorVisible] = useState(false);

  useEffect(() => {
    if (!item) return;
    setTitleDraft(item.title ?? "");
    setNoteDraft(item.note ?? "");
    setTagsDraft(item.tags.join(", "));
    setNoteEditorVisible(false);
  }, [item?.id]);

  if (!item) return null;

  return (
    <>
      <LibrarySheet
        visible={visible && !noteEditorVisible}
        title={item.title?.trim() || "Saved map"}
        subtitle={item.bundleMeta?.anchorRef || item.bundleId || "Map detail"}
        onClose={onClose}
      >
        <View style={styles.featureCard}>
          {item.note?.trim() ? (
            <Text style={styles.connectionSynopsis}>{item.note.trim()}</Text>
          ) : (
            <Text style={styles.caption}>Saved map details</Text>
          )}
          <View style={styles.connectionMetaWrap}>
            {item.bundleMeta?.anchorRef ? (
              <Text style={styles.metaPill}>
                Anchor {item.bundleMeta.anchorRef}
              </Text>
            ) : null}
            {item.bundleMeta?.verseCount ? (
              <Text style={styles.metaPill}>
                {item.bundleMeta.verseCount} verses
              </Text>
            ) : null}
            {item.bundleMeta?.edgeCount ? (
              <Text style={styles.metaPill}>
                {item.bundleMeta.edgeCount} connections
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.libraryEditorCard}>
          {mutationError ? (
            <Text style={styles.error}>{mutationError}</Text>
          ) : null}
          <View style={styles.row}>
            <ActionButton
              label="Note"
              onPress={() => setNoteEditorVisible(true)}
              disabled={mutationBusy}
              variant="secondary"
            />
            <ActionButton
              label="Open"
              onPress={() => onOpen(item)}
              disabled={mutationBusy || !item.bundle}
              variant="ghost"
            />
            <ActionButton
              label="Delete"
              onPress={() => onDelete(item.id)}
              disabled={mutationBusy}
              variant="danger"
            />
          </View>
        </View>
      </LibrarySheet>
      <NoteEditorModal
        visible={visible && noteEditorVisible}
        title="Map note"
        subtitle={item.bundleMeta?.anchorRef || item.bundleId || "Saved map"}
        value={noteDraft}
        onChangeText={setNoteDraft}
        onClose={() => {
          setNoteEditorVisible(false);
          setTitleDraft(item.title ?? "");
          setNoteDraft(item.note ?? "");
          setTagsDraft(item.tags.join(", "));
          onClose();
        }}
        onSave={async () => {
          await onSave(titleDraft, noteDraft, tagsDraft);
          setNoteEditorVisible(false);
          onClose();
        }}
        busy={mutationBusy}
        error={mutationError}
        placeholder="Add a note for this map"
      >
        <Text style={styles.fieldLabel}>Title</Text>
        <TextInput
          placeholder="Map title"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={titleDraft}
          onChangeText={setTitleDraft}
        />
        <Text style={styles.fieldLabel}>Tags</Text>
        <TextInput
          placeholder="theme, thread, prophecy"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={tagsDraft}
          onChangeText={setTagsDraft}
        />
      </NoteEditorModal>
    </>
  );
}

function HighlightDetailSheet({
  item,
  visible,
  mutationBusy,
  mutationError,
  noteDraft,
  onClose,
  onNoteChange,
  onSave,
  onDelete,
  onShare,
}: {
  item: MobileHighlightItem | null;
  visible: boolean;
  mutationBusy: boolean;
  mutationError: string | null;
  noteDraft: string;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onSave: () => void | Promise<void>;
  onDelete: (id: string) => void;
  onShare: (item: MobileHighlightItem) => void | Promise<void>;
}) {
  const [noteEditorVisible, setNoteEditorVisible] = useState(false);

  useEffect(() => {
    setNoteEditorVisible(false);
  }, [item?.id, visible]);

  if (!item) return null;

  return (
    <>
      <LibrarySheet
        visible={visible && !noteEditorVisible}
        title="Highlight"
        subtitle={item.referenceLabel}
        onClose={onClose}
      >
        <View style={styles.featureCard}>
          <Text style={styles.connectionSynopsis}>{item.text}</Text>
        </View>

        <View style={styles.libraryEditorCard}>
          <View style={styles.row}>
            <ActionButton
              label="Note"
              onPress={() => setNoteEditorVisible(true)}
              disabled={mutationBusy}
              variant="secondary"
            />
            <ActionButton
              label="Share"
              onPress={() => void onShare(item)}
              disabled={mutationBusy}
              variant="ghost"
            />
            <ActionButton
              label={mutationBusy ? "Deleting..." : "Delete"}
              onPress={() => onDelete(item.id)}
              disabled={mutationBusy}
              variant="danger"
            />
          </View>
          {mutationError ? (
            <Text style={styles.error}>{mutationError}</Text>
          ) : null}
        </View>
      </LibrarySheet>
      <NoteEditorModal
        visible={visible && noteEditorVisible}
        title="Highlight note"
        subtitle={item.referenceLabel}
        value={noteDraft}
        onChangeText={onNoteChange}
        onClose={() => {
          setNoteEditorVisible(false);
          onNoteChange(item.note ?? "");
          onClose();
        }}
        onSave={async () => {
          await onSave();
          setNoteEditorVisible(false);
          onClose();
        }}
        busy={mutationBusy}
        error={mutationError}
        placeholder="Write a note for this highlight..."
      />
    </>
  );
}

export function LibraryScreen({
  nav,
}: {
  nav: {
    openHighlightCreate: () => void;
    openHighlightDetail: (highlightId: string) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
    openChat: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
  };
}) {
  const controller = useMobileApp();
  const [mode, setMode] = useState<LibraryMode>("connections");
  const [connectionQuery, setConnectionQuery] = useState("");
  const [mapQuery, setMapQuery] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(
    null,
  );
  const [actionConnectionId, setActionConnectionId] = useState<string | null>(
    null,
  );
  const [actionMapId, setActionMapId] = useState<string | null>(null);
  const modeSwipeLastAtRef = useRef(0);
  const libraryRailMotion = useScrollHideHeader(mode);
  const pageHeaderMotion = useScrollHideHeader(mode);
  const normalizedConnectionQuery = connectionQuery.trim().toLowerCase();
  const normalizedMapQuery = mapQuery.trim().toLowerCase();
  const filteredConnections = useMemo(
    () =>
      controller.libraryConnections.filter((item) =>
        includesQuery(
          [
            item.fromVerse.reference,
            item.toVerse.reference,
            item.synopsis,
            item.connectionType,
            item.note,
            item.tags.join(" "),
            item.bundleMeta?.anchorRef,
          ],
          normalizedConnectionQuery,
        ),
      ),
    [controller.libraryConnections, normalizedConnectionQuery],
  );
  const filteredMaps = useMemo(
    () =>
      controller.libraryMaps.filter((item) =>
        includesQuery(
          [
            item.title,
            item.bundleId,
            item.note,
            item.tags.join(" "),
            item.bundleMeta?.anchorRef,
          ],
          normalizedMapQuery,
        ),
      ),
    [controller.libraryMaps, normalizedMapQuery],
  );
  const connectionsCount = controller.libraryConnections.length;
  const mapsCount = controller.libraryMaps.length;
  const selectedConnection = useMemo(
    () =>
      controller.libraryConnections.find(
        (item) => item.id === selectedConnectionId,
      ) ?? null,
    [controller.libraryConnections, selectedConnectionId],
  );
  const selectedMap = useMemo(
    () =>
      controller.libraryMaps.find((item) => item.id === selectedMapId) ?? null,
    [controller.libraryMaps, selectedMapId],
  );
  const selectedHighlight = useMemo(
    () =>
      controller.highlights.find((item) => item.id === selectedHighlightId) ??
      null,
    [controller.highlights, selectedHighlightId],
  );
  function handleDeleteConnection(id: string) {
    Alert.alert(
      "Delete connection?",
      "This removes the saved connection from your Library.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void controller.handleDeleteLibraryConnection(id);
            setSelectedConnectionId(null);
          },
        },
      ],
    );
  }

  function handleDeleteMap(id: string) {
    Alert.alert("Delete map?", "This removes the saved map.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void controller.handleDeleteLibraryMap(id);
          setSelectedMapId(null);
        },
      },
    ]);
  }

  function handleDeleteHighlight(id: string) {
    Alert.alert(
      "Delete highlight?",
      "This will permanently remove the highlight.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void controller.handleDeleteHighlight(id);
          },
        },
      ],
    );
  }

  function handleLibraryModeChange(nextMode: LibraryMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setActionConnectionId(null);
    setActionMapId(null);
    setSelectedHighlightId(null);
    controller.setSelectedHighlightId(null);
  }

  function handleLibraryModeFling(direction: "next" | "previous") {
    const now = Date.now();
    if (now - modeSwipeLastAtRef.current < LIBRARY_MODE_SWIPE_COOLDOWN_MS) {
      return;
    }
    const currentIndex = LIBRARY_MODE_ORDER.indexOf(mode);
    if (currentIndex < 0) return;
    const nextIndex =
      direction === "next" ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= LIBRARY_MODE_ORDER.length) {
      return;
    }
    modeSwipeLastAtRef.current = now;
    setMode(LIBRARY_MODE_ORDER[nextIndex]);
  }

  async function handleShareHighlight(item: MobileHighlightItem) {
    await Share.share({
      title: item.referenceLabel,
      message: formatHighlightShareText(item),
    });
  }

  const pageRail = (
    <Animated.View
      onLayout={(event) =>
        libraryRailMotion.handleLayout(
          Math.round(event.nativeEvent.layout.height),
        )
      }
      style={libraryRailMotion.animatedStyle}
    >
      <View style={styles.libraryTopRail}>
        <LibraryModeTabs activeMode={mode} onChange={handleLibraryModeChange} />
      </View>
    </Animated.View>
  );

  const connectionsPage = (
    <FlatList
      data={filteredConnections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshing={controller.libraryLoading}
      onRefresh={() => void controller.loadLibraryConnections()}
      onScroll={(event) => {
        const yOffset = event.nativeEvent.contentOffset.y;
        libraryRailMotion.handleScroll(yOffset);
        pageHeaderMotion.handleScroll(yOffset);
      }}
      scrollEventThrottle={16}
      ListHeaderComponent={
        <Animated.View
          onLayout={(event) =>
            pageHeaderMotion.handleLayout(
              Math.round(event.nativeEvent.layout.height),
            )
          }
          style={pageHeaderMotion.animatedStyle}
        >
          <View style={styles.libraryPageHeader}>
            <View style={styles.libraryPageTitleRow}>
              <Text style={styles.panelTitle}>Connections</Text>
              <Text style={styles.caption}>{connectionsCount}</Text>
            </View>
            <SearchInput
              placeholder="Search connections"
              value={connectionQuery}
              onChangeText={setConnectionQuery}
            />
            {normalizedConnectionQuery ? (
              <Text style={styles.caption}>
                Showing {filteredConnections.length} of {connectionsCount}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      }
      renderItem={({ item }) => (
        <ConnectionCard
          item={item}
          selected={
            item.id === selectedConnectionId || item.id === actionConnectionId
          }
          onPress={() => {
            setActionConnectionId(null);
            setSelectedConnectionId(item.id);
          }}
          onLongPress={() =>
            setActionConnectionId((current) =>
              current === item.id ? null : item.id,
            )
          }
          onEdit={() => {
            setActionConnectionId(null);
            setSelectedConnectionId(item.id);
          }}
          onGoDeeper={() =>
            nav.openChat(
              item.goDeeperPrompt ||
                `Explain the connection between ${item.fromVerse.reference} and ${item.toVerse.reference}.`,
              true,
            )
          }
          onDelete={() => handleDeleteConnection(item.id)}
          onOpenMap={
            item.bundle
              ? () =>
                  nav.openMapViewer(
                    item.bundleMeta?.anchorRef || "Connection map",
                    item.bundle,
                  )
              : undefined
          }
          showQuickActions={item.id === actionConnectionId}
        />
      )}
      ListEmptyComponent={
        controller.libraryLoading ? (
          <View style={styles.listContent}>
            {Array.from({ length: 4 }).map((_, index) => (
              <ConnectionCardSkeleton key={`connection-skeleton-${index}`} />
            ))}
          </View>
        ) : (
          <EmptyState
            title={
              normalizedConnectionQuery
                ? "No matching connections"
                : "No saved connections yet"
            }
            subtitle={
              normalizedConnectionQuery
                ? "Try a broader search query."
                : LIBRARY_MODE_EMPTY_HINTS.connections
            }
          />
        )
      }
    />
  );

  const mapsPage = (
    <FlatList
      data={filteredMaps}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshing={controller.libraryMapsLoading}
      onRefresh={() => void controller.loadLibraryMaps()}
      onScroll={(event) => {
        const yOffset = event.nativeEvent.contentOffset.y;
        libraryRailMotion.handleScroll(yOffset);
        pageHeaderMotion.handleScroll(yOffset);
      }}
      scrollEventThrottle={16}
      ListHeaderComponent={
        <Animated.View
          onLayout={(event) =>
            pageHeaderMotion.handleLayout(
              Math.round(event.nativeEvent.layout.height),
            )
          }
          style={pageHeaderMotion.animatedStyle}
        >
          <View style={styles.libraryPageHeader}>
            <View style={styles.libraryPageTitleRow}>
              <Text style={styles.panelTitle}>Maps</Text>
              <Text style={styles.caption}>{mapsCount}</Text>
            </View>
            <SearchInput
              placeholder="Search maps"
              value={mapQuery}
              onChangeText={setMapQuery}
            />
            {normalizedMapQuery ? (
              <Text style={styles.caption}>
                Showing {filteredMaps.length} of {mapsCount}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      }
      renderItem={({ item }) => (
        <LibraryMapCard
          item={item}
          selected={item.id === selectedMapId || item.id === actionMapId}
          mutationBusy={controller.libraryMapMutationBusy}
          onPress={() => {
            setActionMapId(null);
            setSelectedMapId(item.id);
          }}
          onLongPress={() =>
            setActionMapId((current) => (current === item.id ? null : item.id))
          }
          onOpen={
            item.bundle
              ? () =>
                  nav.openMapViewer(
                    item.title || item.bundleId || "Map",
                    item.bundle,
                  )
              : undefined
          }
          onEdit={() => {
            setActionMapId(null);
            setSelectedMapId(item.id);
          }}
          onDelete={() => handleDeleteMap(item.id)}
          showQuickActions={item.id === actionMapId}
        />
      )}
      ListEmptyComponent={
        controller.libraryMapsLoading ? (
          <View style={styles.listContent}>
            {Array.from({ length: 4 }).map((_, index) => (
              <LibraryMapSkeleton key={`map-skeleton-${index}`} />
            ))}
          </View>
        ) : (
          <EmptyState
            title={normalizedMapQuery ? "No matching maps" : "No maps yet"}
            subtitle={
              normalizedMapQuery
                ? "Try a broader search query."
                : LIBRARY_MODE_EMPTY_HINTS.maps
            }
          />
        )
      }
    />
  );

  const currentPage =
    mode === "connections" ? (
      connectionsPage
    ) : mode === "maps" ? (
      mapsPage
    ) : mode === "highlights" ? (
      <HighlightsScreen
        nav={{
          openCreate: nav.openHighlightCreate,
          openDetail: nav.openHighlightDetail,
          openChat: nav.openChat,
          shareHighlight: handleShareHighlight,
        }}
        embedded
        detailPresentation="sheet"
        onSelectHighlight={(highlightId) => {
          setSelectedHighlightId(highlightId);
          controller.setSelectedHighlightId(highlightId);
        }}
        onScrollOffsetChange={(yOffset) =>
          libraryRailMotion.handleScroll(yOffset)
        }
      />
    ) : null;

  return (
    <View style={styles.flex1}>
      {pageRail}
      <FlingGestureHandler
        direction={Directions.LEFT}
        onHandlerStateChange={({ nativeEvent }) => {
          if (nativeEvent.state !== State.ACTIVE) return;
          handleLibraryModeFling("next");
        }}
      >
        <FlingGestureHandler
          direction={Directions.RIGHT}
          onHandlerStateChange={({ nativeEvent }) => {
            if (nativeEvent.state !== State.ACTIVE) return;
            handleLibraryModeFling("previous");
          }}
        >
          <View style={styles.flex1}>{currentPage}</View>
        </FlingGestureHandler>
      </FlingGestureHandler>

      <ConnectionDetailSheet
        item={selectedConnection}
        visible={Boolean(selectedConnection)}
        mutationBusy={controller.libraryConnectionMutationBusy}
        mutationError={controller.libraryConnectionMutationError}
        onClose={() => setSelectedConnectionId(null)}
        onSave={(note) =>
          selectedConnection
            ? void controller.handleSaveLibraryConnectionMeta(
                selectedConnection.id,
                {
                  note,
                  tags: selectedConnection.tags.join(", "),
                },
              )
            : undefined
        }
        onDelete={handleDeleteConnection}
      />

      <MapDetailSheet
        item={selectedMap}
        visible={Boolean(selectedMap)}
        mutationBusy={controller.libraryMapMutationBusy}
        mutationError={controller.libraryMapMutationError}
        onClose={() => setSelectedMapId(null)}
        onSave={(title, note, tags) =>
          selectedMap
            ? void controller.handleSaveLibraryMapMeta(selectedMap.id, {
                title,
                note,
                tags,
              })
            : undefined
        }
        onOpen={(item) => {
          if (!item.bundle) return;
          nav.openMapViewer(item.title || item.bundleId || "Map", item.bundle);
          setSelectedMapId(null);
        }}
        onDelete={handleDeleteMap}
      />

      <HighlightDetailSheet
        item={selectedHighlight}
        visible={Boolean(selectedHighlight)}
        mutationBusy={controller.highlightMutationBusy}
        mutationError={controller.highlightMutationError}
        noteDraft={controller.highlightEditNote}
        onClose={() => {
          setSelectedHighlightId(null);
          controller.setSelectedHighlightId(null);
        }}
        onNoteChange={controller.setHighlightEditNote}
        onSave={() => void controller.handleSaveHighlightEdits()}
        onDelete={handleDeleteHighlight}
        onShare={handleShareHighlight}
      />
    </View>
  );
}
export function BookmarksScreen({
  nav,
  embedded = false,
}: {
  nav: {
    openCreate: () => void;
    openDetail: (bookmarkId: string) => void;
  };
  embedded?: boolean;
}) {
  const controller = useMobileApp();
  const [query, setQuery] = useState("");
  const [actionBookmarkId, setActionBookmarkId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredBookmarks = useMemo(
    () =>
      controller.bookmarks.filter((item) =>
        includesQuery([item.text], normalizedQuery),
      ),
    [controller.bookmarks, normalizedQuery],
  );
  const bookmarksCount = controller.bookmarks.length;

  function confirmDeleteBookmark(bookmarkId: string) {
    Alert.alert(
      "Delete bookmark?",
      "This will remove the bookmark from your library.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void controller.handleDeleteBookmark(bookmarkId);
            setActionBookmarkId((current) =>
              current === bookmarkId ? null : current,
            );
          },
        },
      ],
    );
  }

  return (
    <View style={embedded ? styles.flex1 : styles.tabScreen}>
      <SurfaceCard
        style={embedded ? styles.librarySectionHeaderCard : undefined}
      >
        <View style={styles.spaceBetweenRow}>
          <View style={styles.flex1}>
            <Text style={styles.panelTitle}>Bookmarks</Text>
            <Text style={styles.panelSubtitle}>
              Save and revisit scripture references quickly.
            </Text>
          </View>
          <ActionButton
            disabled={controller.bookmarksLoading || controller.busy}
            label={controller.bookmarksLoading ? "Loading..." : "Refresh"}
            onPress={() => void controller.loadBookmarks()}
            variant="ghost"
          />
        </View>
        <View style={styles.statGrid}>
          <StatCard label="Saved" value={filteredBookmarks.length} />
        </View>
        <SearchInput
          placeholder="Search bookmarks"
          value={query}
          onChangeText={setQuery}
        />
        {normalizedQuery ? (
          <Text style={styles.caption}>
            Showing {filteredBookmarks.length} of {bookmarksCount} bookmarks
          </Text>
        ) : null}
        <View style={styles.row}>
          <ActionButton
            disabled={controller.bookmarkMutationBusy || controller.busy}
            label="New bookmark"
            onPress={nav.openCreate}
            variant="primary"
          />
        </View>
        {!embedded && controller.bookmarksError ? (
          <Text style={styles.error}>{controller.bookmarksError}</Text>
        ) : null}
        {!embedded && controller.bookmarksLoadedAt ? (
          <Text style={styles.caption}>
            Last sync {formatRelativeDate(controller.bookmarksLoadedAt)}
          </Text>
        ) : null}
        {!embedded && controller.bookmarkMutationError ? (
          <Text style={styles.error}>{controller.bookmarkMutationError}</Text>
        ) : null}
      </SurfaceCard>
      <FlatList
        data={filteredBookmarks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={controller.bookmarksLoading}
        onRefresh={() => void controller.loadBookmarks()}
        ListHeaderComponent={
          filteredBookmarks.length > 0 ? (
            <Text style={styles.panelSubtitle}>
              Tap to open. Long press for quick actions.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <BookmarkCard
            item={item}
            selected={item.id === controller.selectedBookmarkId}
            showQuickActions={
              item.id === controller.selectedBookmarkId ||
              item.id === actionBookmarkId
            }
            onPress={() => {
              controller.setSelectedBookmarkId(item.id);
              nav.openDetail(item.id);
            }}
            onLongPress={() =>
              setActionBookmarkId((current) =>
                current === item.id ? null : item.id,
              )
            }
            onEdit={() => {
              controller.setSelectedBookmarkId(item.id);
              nav.openDetail(item.id);
            }}
            onDelete={() => confirmDeleteBookmark(item.id)}
          />
        )}
        ListEmptyComponent={
          controller.bookmarksLoading ? (
            <View style={styles.listContent}>
              {Array.from({ length: 4 }).map((_, index) => (
                <BookmarkCardSkeleton key={`bookmark-skeleton-${index}`} />
              ))}
            </View>
          ) : (
            <EmptyState
              title={
                normalizedQuery ? "No matching bookmarks" : "No bookmarks yet"
              }
              subtitle={
                normalizedQuery
                  ? "Try a broader search query."
                  : "Use New bookmark to create one, then pull down to sync."
              }
            />
          )
        }
      />
    </View>
  );
}

export function HighlightsScreen({
  nav,
  embedded = false,
  detailPresentation = "route",
  onSelectHighlight,
  onScrollOffsetChange,
}: {
  nav: {
    openCreate: () => void;
    openDetail: (highlightId: string) => void;
    openChat?: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
    shareHighlight?: (highlight: MobileHighlightItem) => void | Promise<void>;
  };
  embedded?: boolean;
  detailPresentation?: "route" | "sheet";
  onSelectHighlight?: (highlightId: string) => void;
  onScrollOffsetChange?: (yOffset: number) => void;
}) {
  const controller = useMobileApp();
  const [query, setQuery] = useState("");
  const pageHeaderMotion = useScrollHideHeader(
    embedded ? "embedded-highlights" : "highlights",
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredHighlights = useMemo(
    () =>
      controller.highlights.filter((item) =>
        includesQuery(
          [item.referenceLabel, item.text, item.note, item.color],
          normalizedQuery,
        ),
      ),
    [controller.highlights, normalizedQuery],
  );
  const highlightsCount = controller.highlights.length;

  const showInsights = controller.highlights.length >= 3 && nav.openChat;

  return (
    <View style={embedded ? styles.flex1 : styles.tabScreen}>
      <FlatList
        data={filteredHighlights}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshing={controller.highlightsLoading}
        onRefresh={() => void controller.loadHighlights()}
        onScroll={(event) => {
          const yOffset = event.nativeEvent.contentOffset.y;
          onScrollOffsetChange?.(yOffset);
          pageHeaderMotion.handleScroll(yOffset);
        }}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <Animated.View
            onLayout={(event) =>
              pageHeaderMotion.handleLayout(
                Math.round(event.nativeEvent.layout.height),
              )
            }
            style={pageHeaderMotion.animatedStyle}
          >
            <View
              style={
                embedded
                  ? styles.libraryPageHeader
                  : styles.librarySectionHeaderCard
              }
            >
              <View style={styles.libraryPageTitleRow}>
                <Text style={styles.panelTitle}>Highlights</Text>
                <Text style={styles.caption}>{highlightsCount}</Text>
              </View>
              <SearchInput
                placeholder="Search highlights"
                value={query}
                onChangeText={setQuery}
              />
              {normalizedQuery ? (
                <Text style={styles.caption}>
                  Showing {filteredHighlights.length} of {highlightsCount}{" "}
                  highlights
                </Text>
              ) : null}
              {!embedded ? (
                <View style={styles.row}>
                  <ActionButton
                    disabled={
                      controller.highlightMutationBusy || controller.busy
                    }
                    label="New highlight"
                    onPress={nav.openCreate}
                    variant="primary"
                  />
                  {showInsights ? (
                    <ActionButton
                      disabled={controller.busy}
                      label="Analyze highlights"
                      onPress={() =>
                        nav.openChat?.(
                          buildHighlightsInsightPayload(controller.highlights),
                          true,
                        )
                      }
                      variant="secondary"
                    />
                  ) : null}
                </View>
              ) : null}
              {!embedded && controller.highlightsError ? (
                <Text style={styles.error}>{controller.highlightsError}</Text>
              ) : null}
              {!embedded && controller.highlightsLoadedAt ? (
                <Text style={styles.caption}>
                  Last sync {formatRelativeDate(controller.highlightsLoadedAt)}
                </Text>
              ) : null}
              {!embedded && controller.highlightMutationError ? (
                <Text style={styles.error}>
                  {controller.highlightMutationError}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        }
        renderItem={({ item }) => (
          <HighlightCard
            item={item}
            selected={item.id === controller.selectedHighlightId}
            onPress={() => {
              controller.setSelectedHighlightId(item.id);
              if (detailPresentation === "route") {
                nav.openDetail(item.id);
              } else {
                onSelectHighlight?.(item.id);
              }
            }}
          />
        )}
        ListEmptyComponent={
          controller.highlightsLoading ? (
            <View style={styles.listContent}>
              {Array.from({ length: 4 }).map((_, index) => (
                <HighlightCardSkeleton key={`highlight-skeleton-${index}`} />
              ))}
            </View>
          ) : (
            <EmptyState
              title={
                normalizedQuery ? "No matching highlights" : "No highlights yet"
              }
              subtitle={
                normalizedQuery
                  ? "Try a broader search query."
                  : "Use New highlight to create one, then pull down to sync."
              }
            />
          )
        }
      />
    </View>
  );
}

export function SavedScreen({
  nav,
}: {
  nav: {
    openBookmarkCreate: () => void;
    openBookmarkDetail: (bookmarkId: string) => void;
    openHighlightCreate: () => void;
    openHighlightDetail: (highlightId: string) => void;
    openChat?: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
  };
}) {
  const [mode, setMode] = useState<"bookmarks" | "highlights">("bookmarks");

  return (
    <View style={styles.tabScreen}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>Saved</Text>
        <Text style={styles.panelSubtitle}>
          Switch between bookmarks and highlights.
        </Text>
        <View style={styles.row}>
          <PressableScale
            onPress={() => setMode("bookmarks")}
            style={[
              styles.outlineChip,
              mode === "bookmarks" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show bookmarks"
            accessibilityState={{ selected: mode === "bookmarks" }}
          >
            <Text style={styles.outlineChipLabel}>Bookmarks</Text>
          </PressableScale>
          <PressableScale
            onPress={() => setMode("highlights")}
            style={[
              styles.outlineChip,
              mode === "highlights" ? styles.outlineChipActive : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show highlights"
            accessibilityState={{ selected: mode === "highlights" }}
          >
            <Text style={styles.outlineChipLabel}>Highlights</Text>
          </PressableScale>
        </View>
      </SurfaceCard>
      {mode === "bookmarks" ? (
        <BookmarksScreen
          nav={{
            openCreate: nav.openBookmarkCreate,
            openDetail: nav.openBookmarkDetail,
          }}
          embedded
        />
      ) : (
        <HighlightsScreen
          nav={{
            openCreate: nav.openHighlightCreate,
            openDetail: nav.openHighlightDetail,
            openChat: nav.openChat,
          }}
          embedded
        />
      )}
    </View>
  );
}
