import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { BIBLE_BOOKS, getBibleChapterCount } from "@zero1/shared";
import { ActionButton } from "../components/native/ActionButton";
import { PressableScale } from "../components/native/PressableScale";
import { RootTranslationPanel } from "../components/native/RootTranslationPanel";
import { useMobileApp } from "../context/MobileAppContext";
import { useRootTranslationMobile } from "../hooks/useRootTranslationMobile";
import {
  fetchSynopsis,
  fetchTraceBundle,
  type SynopsisResponse,
} from "../lib/api";
import { MOBILE_ENV } from "../lib/env";
import { styles, T } from "../theme/mobileStyles";
import { isVisualContextBundle } from "../types/visualization";

const DOUBLE_TAP_WINDOW_MS = 280;
const HIGHLIGHT_FEEDBACK_IN_MS = 120;
const HIGHLIGHT_FEEDBACK_OUT_MS = 220;
const HIGHLIGHT_FEEDBACK_SCALE_MAX = 1.0035;
const HEADER_HIDE_SCROLL_DISTANCE = 34;
const HEADER_TOGGLE_ANIMATION_MS = 180;
const READER_LAST_CHAPTERS_BY_BOOK_STORAGE_KEY =
  "biblelot:mobile:reader:last-chapters-by-book";

type SelectionDraft = {
  startVerse: number;
  endVerse: number;
};

type SelectionPayload = {
  verses: number[];
  text: string;
};

type HighlightTone = {
  fill: string;
  stroke: string;
  bar: string;
};

function parseHexColor(
  input: string,
): { r: number; g: number; b: number } | null {
  const value = input.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{3,8}$/.test(value)) return null;
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : value.slice(0, 6);
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return null;
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgba(
  color: { r: number; g: number; b: number },
  alpha: number,
): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function buildHighlightTone(color: string): HighlightTone | null {
  const parsed = parseHexColor(color);
  if (!parsed) return null;
  return {
    fill: rgba(parsed, 0.24),
    stroke: rgba(parsed, 0.78),
    bar: rgba(parsed, 1),
  };
}

function normalizeVerseRange(startVerse: number, endVerse: number): number[] {
  const min = Math.min(startVerse, endVerse);
  const max = Math.max(startVerse, endVerse);
  const verses: number[] = [];
  for (let verse = min; verse <= max; verse += 1) {
    verses.push(verse);
  }
  return verses;
}

function formatVerseRangeLabel(verses: number[]): string {
  if (verses.length === 0) return "";
  if (verses.length === 1) return String(verses[0]);
  return `${verses[0]}-${verses[verses.length - 1]}`;
}

type LastChapterByBookMap = Record<string, number>;

function sanitizeLastChapterMap(raw: unknown): LastChapterByBookMap {
  if (!raw || typeof raw !== "object") return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const next: LastChapterByBookMap = {};
  entries.forEach(([book, value]) => {
    if (
      typeof book === "string" &&
      Number.isInteger(value) &&
      (value as number) > 0
    ) {
      next[book] = value as number;
    }
  });
  return next;
}

export function ReaderScreen({
  nav,
}: {
  nav: {
    openChat: (prompt: string, autoSend?: boolean) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
    openModeMenu: () => void;
  };
}) {
  const controller = useMobileApp();
  const insets = useSafeAreaInsets();
  const [bookSelectorVisible, setBookSelectorVisible] = useState(false);
  const [chapterSelectorVisible, setChapterSelectorVisible] = useState(false);
  const [chapterSelectionBook, setChapterSelectionBook] = useState<
    string | null
  >(null);
  const [bookFilter, setBookFilter] = useState("");
  const [lastChapterByBook, setLastChapterByBook] =
    useState<LastChapterByBookMap>({});
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft | null>(
    null,
  );
  const [selectionModalVisible, setSelectionModalVisible] = useState(false);
  const [selectionSynopsis, setSelectionSynopsis] =
    useState<SynopsisResponse | null>(null);
  const [selectionSynopsisLoading, setSelectionSynopsisLoading] =
    useState(false);
  const [selectionSynopsisError, setSelectionSynopsisError] = useState<
    string | null
  >(null);
  const [selectionView, setSelectionView] = useState<"synopsis" | "root">(
    "synopsis",
  );
  const {
    isLoading: rootLoading,
    language: rootLanguage,
    words: rootWords,
    lostContext: rootLostContext,
    fallbackText: rootFallbackText,
    selectedWordIndex: rootSelectedWordIndex,
    setSelectedWordIndex: setRootSelectedWordIndex,
    generate: generateRootTranslation,
    reset: resetRootTranslation,
  } = useRootTranslationMobile({
    apiBaseUrl: MOBILE_ENV.API_URL,
    accessToken: controller.session?.access_token,
  });
  const [selectionMapLoading, setSelectionMapLoading] = useState(false);
  const [selectionCopySuccess, setSelectionCopySuccess] = useState(false);
  const [selectionShareSuccess, setSelectionShareSuccess] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [headerMeasuredHeight, setHeaderMeasuredHeight] = useState(56);
  const lastVerseTapRef = useRef<{ verse: number; at: number } | null>(null);
  const suppressNextVersePressRef = useRef(false);
  const currentScrollYRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const headerScrollDeltaRef = useRef(0);
  const [feedbackVerse, setFeedbackVerse] = useState<number | null>(null);
  const feedbackPulse = useRef(new Animated.Value(0)).current;
  const headerVisibilityAnim = useRef(new Animated.Value(1)).current;
  const selectorDropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionSynopsisError(null);
    resetRootTranslation();
  }, [controller.reader.book, controller.reader.chapter, resetRootTranslation]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(READER_LAST_CHAPTERS_BY_BOOK_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const parsed = JSON.parse(raw) as unknown;
          setLastChapterByBook(sanitizeLastChapterMap(parsed));
        } catch {
          setLastChapterByBook({});
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const book = controller.reader.book;
    const chapter = controller.reader.chapter;
    setLastChapterByBook((current) => {
      if (current[book] === chapter) return current;
      const next = { ...current, [book]: chapter };
      void AsyncStorage.setItem(
        READER_LAST_CHAPTERS_BY_BOOK_STORAGE_KEY,
        JSON.stringify(next),
      ).catch(() => {});
      return next;
    });
  }, [controller.reader.book, controller.reader.chapter]);

  useEffect(() => {
    const selectorVisible = bookSelectorVisible || chapterSelectorVisible;
    if (!selectorVisible) {
      selectorDropAnim.setValue(0);
      return;
    }

    selectorDropAnim.setValue(0);
    Animated.timing(selectorDropAnim, {
      toValue: 1,
      duration: 170,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [bookSelectorVisible, chapterSelectorVisible, selectorDropAnim]);

  useEffect(() => {
    Animated.timing(headerVisibilityAnim, {
      toValue: headerVisible ? 1 : 0,
      duration: HEADER_TOGGLE_ANIMATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [headerVisible, headerVisibilityAnim]);

  const filteredBooks = useMemo(() => {
    const query = bookFilter.trim().toLowerCase();
    if (!query) return [...BIBLE_BOOKS];
    return BIBLE_BOOKS.filter((book) => book.toLowerCase().includes(query));
  }, [bookFilter]);

  const filteredOldTestamentBooks = useMemo(
    () => filteredBooks.filter((book) => BIBLE_BOOKS.indexOf(book) < 39),
    [filteredBooks],
  );
  const filteredNewTestamentBooks = useMemo(
    () => filteredBooks.filter((book) => BIBLE_BOOKS.indexOf(book) >= 39),
    [filteredBooks],
  );

  const chapterSelectionBookName =
    chapterSelectionBook ?? controller.reader.book;
  const maxChapterForSelectedBook =
    getBibleChapterCount(chapterSelectionBookName) ?? 1;
  const chapterOptions = useMemo(
    () =>
      Array.from(
        { length: maxChapterForSelectedBook },
        (_, index) => index + 1,
      ),
    [maxChapterForSelectedBook],
  );
  const suggestedChapterForSelectedBook = useMemo(() => {
    if (chapterSelectionBookName === controller.reader.book) {
      return controller.reader.chapter;
    }
    const saved = lastChapterByBook[chapterSelectionBookName] ?? 1;
    return Math.min(Math.max(saved, 1), maxChapterForSelectedBook);
  }, [
    chapterSelectionBookName,
    controller.reader.book,
    controller.reader.chapter,
    lastChapterByBook,
    maxChapterForSelectedBook,
  ]);

  const selectedVerses = useMemo(() => {
    if (!selectionDraft) return [];
    return normalizeVerseRange(
      selectionDraft.startVerse,
      selectionDraft.endVerse,
    );
  }, [selectionDraft]);

  const selectedVerseLabel = useMemo(() => {
    if (selectedVerses.length === 0) return null;
    return `${controller.reader.book} ${controller.reader.chapter}:${formatVerseRangeLabel(selectedVerses)}`;
  }, [controller.reader.book, controller.reader.chapter, selectedVerses]);

  const selectedText = useMemo(() => {
    if (selectedVerses.length === 0) return "";
    const textByVerse = new Map(
      controller.reader.verses.map((entry) => [entry.verse, entry.text]),
    );
    return selectedVerses
      .map((verse) => `${verse}. ${textByVerse.get(verse) ?? ""}`.trim())
      .join(" ")
      .trim();
  }, [controller.reader.verses, selectedVerses]);

  const verseHighlightMap = useMemo(() => {
    const map = new Map<
      number,
      { color: string; tone: HighlightTone | null }
    >();
    controller.highlights.forEach((highlight) => {
      if (
        highlight.book.toLowerCase() === controller.reader.book.toLowerCase() &&
        highlight.chapter === controller.reader.chapter
      ) {
        highlight.verses.forEach((verse) => {
          if (!map.has(verse)) {
            const color = highlight.color || "#facc15";
            map.set(verse, {
              color,
              tone: buildHighlightTone(color),
            });
          }
        });
      }
    });
    return map;
  }, [
    controller.highlights,
    controller.reader.book,
    controller.reader.chapter,
  ]);

  function triggerSelectionHaptic() {
    Haptics.selectionAsync().catch(() => {});
  }

  function runHighlightFeedbackPulse(verse: number) {
    setFeedbackVerse(verse);
    feedbackPulse.setValue(0);
    Animated.sequence([
      Animated.timing(feedbackPulse, {
        toValue: 1,
        duration: HIGHLIGHT_FEEDBACK_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(feedbackPulse, {
        toValue: 0,
        duration: HIGHLIGHT_FEEDBACK_OUT_MS,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFeedbackVerse((current) => (current === verse ? null : current));
    });
  }

  function buildSelectionPayload(draft: SelectionDraft): SelectionPayload {
    const verses = normalizeVerseRange(draft.startVerse, draft.endVerse);
    const textByVerse = new Map(
      controller.reader.verses.map((entry) => [entry.verse, entry.text]),
    );
    const text = verses
      .map((verse) => `${verse}. ${textByVerse.get(verse) ?? ""}`.trim())
      .join(" ")
      .trim();
    return { verses, text };
  }

  async function handleSelectBook(book: string) {
    setBookSelectorVisible(false);
    setBookFilter("");
    setChapterSelectionBook(book);
    setChapterSelectorVisible(true);
  }

  function closeChapterSelector() {
    setChapterSelectorVisible(false);
    setChapterSelectionBook(null);
  }

  async function handleSelectChapter(chapter: number) {
    if (!Number.isInteger(chapter) || chapter <= 0) return;
    const targetBook = chapterSelectionBook ?? controller.reader.book;
    closeChapterSelector();
    await controller.navigateReaderTo(targetBook, chapter);
  }

  function clearSelection() {
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionSynopsisError(null);
    setSelectionView("synopsis");
    resetRootTranslation();
    setSelectionCopySuccess(false);
    setSelectionShareSuccess(false);
    lastVerseTapRef.current = null;
  }

  async function loadSelectionSynopsis(payload?: SelectionPayload) {
    const activePayload = payload ?? {
      text: selectedText,
      verses: selectedVerses,
    };
    if (!activePayload.text || activePayload.verses.length === 0) return;
    setSelectionSynopsisLoading(true);
    setSelectionSynopsisError(null);
    try {
      const result = await fetchSynopsis({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: activePayload.text,
        maxWords: 34,
        book: controller.reader.book,
        chapter: controller.reader.chapter,
        verses: activePayload.verses,
      });
      setSelectionSynopsis(result);
    } catch (error) {
      setSelectionSynopsisError(
        error instanceof Error ? error.message : String(error),
      );
      setSelectionSynopsis(null);
    } finally {
      setSelectionSynopsisLoading(false);
    }
  }

  async function openSelectionTools(draft?: SelectionDraft) {
    const payload = draft
      ? buildSelectionPayload(draft)
      : { text: selectedText, verses: selectedVerses };
    if (!payload.text || payload.verses.length === 0) return;
    setSelectionModalVisible(true);
    setSelectionView("synopsis");
    resetRootTranslation();
    setSelectionCopySuccess(false);
    setSelectionShareSuccess(false);
    await loadSelectionSynopsis(payload);
  }

  async function handleRootTranslation() {
    const payload = { text: selectedText, verses: selectedVerses };
    if (!payload.text || payload.verses.length === 0) return;
    setSelectionView("root");
    await generateRootTranslation(payload.text, {
      book: controller.reader.book,
      chapter: controller.reader.chapter,
      verses: payload.verses,
    });
  }

  function handleBackToSynopsis() {
    resetRootTranslation();
    setSelectionView("synopsis");
  }

  async function handleTraceSelection() {
    if (!selectedText || !selectedVerseLabel) return;
    setSelectionMapLoading(true);
    try {
      const bundle = await fetchTraceBundle({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: `${selectedVerseLabel} ${selectedText}`,
        accessToken: controller.session?.access_token,
      });
      if (!isVisualContextBundle(bundle)) {
        throw new Error("Map response was malformed.");
      }
      nav.openMapViewer(selectedVerseLabel, bundle);
      clearSelection();
    } catch (error) {
      setSelectionSynopsisError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setSelectionMapLoading(false);
    }
  }

  async function handleCopySelection() {
    if (!selectedText || !selectedVerseLabel) return;
    await Clipboard.setStringAsync(
      `"${selectedText}"\n\n- ${selectedVerseLabel} (KJV)`,
    );
    setSelectionCopySuccess(true);
    setSelectionShareSuccess(false);
    setTimeout(() => setSelectionCopySuccess(false), 1600);
  }

  async function handleShareSelection() {
    if (!selectedText || !selectedVerseLabel) return;
    await Share.share({
      message: `"${selectedText}"\n\n- ${selectedVerseLabel} (KJV)`,
    });
    setSelectionShareSuccess(true);
    setSelectionCopySuccess(false);
    setTimeout(() => setSelectionShareSuccess(false), 1600);
  }

  const modalFeedbackLabel = selectionMapLoading
    ? "Tracing..."
    : selectionCopySuccess
      ? "Copied"
      : selectionShareSuccess
        ? "Shared"
        : null;

  const headerContainerAnimatedStyle = {
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

  function handleReaderScroll(yOffset: number) {
    const clampedY = Math.max(0, yOffset);
    const delta = Math.abs(clampedY - lastScrollYRef.current);
    lastScrollYRef.current = clampedY;
    currentScrollYRef.current = clampedY;

    if (!headerVisible) return;
    if (
      bookSelectorVisible ||
      chapterSelectorVisible ||
      selectionModalVisible
    ) {
      return;
    }
    if (clampedY <= 0) {
      headerScrollDeltaRef.current = 0;
      return;
    }

    headerScrollDeltaRef.current += delta;
    if (headerScrollDeltaRef.current >= HEADER_HIDE_SCROLL_DISTANCE) {
      setHeaderVisible(false);
      headerScrollDeltaRef.current = 0;
    }
  }

  function revealHeader() {
    setHeaderVisible(true);
    headerScrollDeltaRef.current = 0;
    lastScrollYRef.current = currentScrollYRef.current;
  }

  function handleVerseTextPress(verse: number, text: string) {
    if (suppressNextVersePressRef.current) {
      suppressNextVersePressRef.current = false;
      return;
    }

    if (selectionDraft) {
      setSelectionDraft((current) =>
        current
          ? { ...current, endVerse: verse }
          : { startVerse: verse, endVerse: verse },
      );
      return;
    }

    const now = Date.now();
    const lastTap = lastVerseTapRef.current;
    if (
      lastTap &&
      lastTap.verse === verse &&
      now - lastTap.at <= DOUBLE_TAP_WINDOW_MS
    ) {
      lastVerseTapRef.current = null;
      triggerSelectionHaptic();
      runHighlightFeedbackPulse(verse);
      if (verseHighlightMap.has(verse)) {
        void controller.handleReaderRemoveHighlightSelection([verse]);
      } else {
        void controller.handleReaderHighlightSelection(
          [verse],
          text.trim(),
          controller.readerHighlightColor,
        );
      }
      return;
    }

    lastVerseTapRef.current = { verse, at: now };
  }

  return (
    <View style={localStyles.root}>
      <Animated.View
        pointerEvents={headerVisible ? "auto" : "none"}
        onLayout={(event) => {
          const measured = Math.round(event.nativeEvent.layout.height);
          if (measured > 0 && measured !== headerMeasuredHeight) {
            setHeaderMeasuredHeight(measured);
          }
        }}
        style={[localStyles.headerShell, headerContainerAnimatedStyle]}
      >
        <View style={localStyles.headerBar}>
          <View style={localStyles.headerControlsTopRow}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Open mode menu"
              motionPreset="quiet"
              onPress={nav.openModeMenu}
              style={localStyles.headerMenuButton}
            >
              <Ionicons color={T.colors.textMuted} name="menu" size={18} />
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Open book selector"
              motionPreset="quiet"
              disabled={controller.readerLoading}
              onPress={() => {
                setBookFilter("");
                setBookSelectorVisible(true);
              }}
              style={[
                localStyles.headerPickerButton,
                localStyles.headerBookPickerButton,
              ]}
            >
              <Text
                style={localStyles.headerPickerLabel}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {controller.reader.book}
              </Text>
              <Ionicons
                color={T.colors.textMuted}
                name="chevron-down"
                size={14}
              />
            </PressableScale>
            <ActionButton
              disabled={controller.readerLoading}
              label="Prev"
              motionPreset="quiet"
              onPress={() => void controller.goToPreviousReaderChapter()}
              variant="ghost"
              style={localStyles.headerNavButton}
              labelStyle={localStyles.compactHeaderActionLabel}
            />
            <ActionButton
              disabled={controller.readerLoading}
              label="Next"
              motionPreset="quiet"
              onPress={() => void controller.goToNextReaderChapter()}
              variant="ghost"
              style={localStyles.headerNavButton}
              labelStyle={localStyles.compactHeaderActionLabel}
            />
          </View>

          {selectionDraft ? (
            <View style={localStyles.selectionStatusRow}>
              <Text style={styles.caption} numberOfLines={1}>
                Selection: {selectedVerseLabel}
              </Text>
              <ActionButton
                label="Clear"
                variant="ghost"
                motionPreset="quiet"
                onPress={clearSelection}
                style={localStyles.compactHeaderAction}
                labelStyle={localStyles.compactHeaderActionLabel}
              />
            </View>
          ) : null}

          {controller.readerError ? (
            <Text style={styles.error}>{controller.readerError}</Text>
          ) : null}
        </View>
      </Animated.View>

      {!headerVisible ? (
        <View
          pointerEvents="box-none"
          style={[
            localStyles.headerRevealOverlay,
            { top: Math.max(insets.top + 4, 8) },
          ]}
        >
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Show reader header"
            motionPreset="quiet"
            onPress={revealHeader}
            style={localStyles.headerRevealButton}
          >
            <Ionicons
              color={T.colors.textMuted}
              name="chevron-down"
              size={16}
            />
          </PressableScale>
        </View>
      ) : null}

      <ScrollView
        style={localStyles.readerScroll}
        contentContainerStyle={localStyles.readerContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => {
          handleReaderScroll(event.nativeEvent.contentOffset.y);
        }}
      >
        <View style={localStyles.readingSurface}>
          {controller.readerLoading && controller.reader.verses.length === 0 ? (
            <View style={localStyles.loadingState}>
              <ActivityIndicator color={T.colors.accent} />
              <Text style={styles.caption}>Loading chapter...</Text>
            </View>
          ) : null}

          {controller.reader.verses.map((item) => {
            const inSelection = selectedVerses.includes(item.verse);
            const highlightVisual = verseHighlightMap.get(item.verse);
            const selectedVerse = controller.readerSelectedVerse === item.verse;
            const startsParagraph = item.verse > 1 && item.verse % 4 === 1;
            return (
              <Animated.View
                key={`${controller.reader.book}-${controller.reader.chapter}-${item.verse}`}
                style={[
                  localStyles.verseRow,
                  startsParagraph ? localStyles.verseParagraphStart : null,
                  feedbackVerse === item.verse
                    ? {
                        transform: [
                          {
                            scale: feedbackPulse.interpolate({
                              inputRange: [0, 1],
                              outputRange: [1, HIGHLIGHT_FEEDBACK_SCALE_MAX],
                            }),
                          },
                        ],
                      }
                    : null,
                  highlightVisual
                    ? [
                        localStyles.verseRowHighlightBase,
                        {
                          backgroundColor:
                            highlightVisual.tone?.fill ??
                            "rgba(212, 175, 55, 0.22)",
                          borderColor:
                            highlightVisual.tone?.stroke ??
                            "rgba(128, 90, 8, 0.85)",
                          borderLeftColor:
                            highlightVisual.tone?.bar ?? T.colors.accent,
                          shadowColor:
                            highlightVisual.tone?.bar ?? T.colors.accent,
                        },
                      ]
                    : null,
                  selectedVerse && !highlightVisual
                    ? localStyles.verseRowFocused
                    : null,
                  inSelection && !highlightVisual
                    ? localStyles.verseRowSelection
                    : null,
                ]}
              >
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={`Verse ${item.verse} references`}
                  motionPreset="quiet"
                  onPress={() => void controller.selectReaderVerse(item.verse)}
                  style={localStyles.verseNumberButton}
                >
                  <Text style={localStyles.verseNumberText}>{item.verse}</Text>
                </PressableScale>

                <Pressable
                  onLongPress={() => {
                    triggerSelectionHaptic();
                    suppressNextVersePressRef.current = true;
                    lastVerseTapRef.current = null;
                    const draft = {
                      startVerse: item.verse,
                      endVerse: item.verse,
                    };
                    setSelectionDraft(draft);
                    void openSelectionTools(draft);
                  }}
                  onPress={() => handleVerseTextPress(item.verse, item.text)}
                  style={localStyles.verseTextPressable}
                >
                  <Text
                    style={[
                      localStyles.verseText,
                      startsParagraph
                        ? localStyles.verseTextParagraphStart
                        : null,
                    ]}
                  >
                    {item.text}
                  </Text>
                </Pressable>
              </Animated.View>
            );
          })}

          {controller.readerSelectedVerse ? (
            <View style={localStyles.crossRefSection}>
              <Text style={localStyles.crossRefTitle}>
                Cross-references - {controller.reader.book}{" "}
                {controller.reader.chapter}:{controller.readerSelectedVerse}
              </Text>
              {controller.readerCrossReferencesLoading ? (
                <View style={styles.rowAlignCenter}>
                  <ActivityIndicator color={T.colors.accent} />
                  <Text style={styles.caption}>Loading references...</Text>
                </View>
              ) : null}
              {controller.readerCrossReferencesError ? (
                <Text style={styles.error}>
                  {controller.readerCrossReferencesError}
                </Text>
              ) : null}
              <View style={styles.suggestionRow}>
                {controller.readerCrossReferences.map((reference) => {
                  const label = `${reference.book} ${reference.chapter}:${reference.verse}`;
                  return (
                    <PressableScale
                      key={label}
                      onPress={() =>
                        void controller.navigateReaderTo(
                          reference.book,
                          reference.chapter,
                        )
                      }
                      motionPreset="quiet"
                      style={styles.suggestionChip}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${label}`}
                    >
                      <Text style={styles.suggestionChipLabel}>{label}</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={localStyles.chapterFooterSection}>
            {controller.readerFooterLoading ? (
              <Text style={styles.caption}>Loading chapter tools...</Text>
            ) : null}
            {controller.readerFooter ? (
              <>
                <Text style={localStyles.chapterOrientation}>
                  {controller.readerFooter.orientation}
                </Text>
                <Text style={localStyles.footerLabel}>
                  Ways to explore this chapter
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={localStyles.footerCardRow}
                >
                  {controller.readerFooter.cards.map((card, index) => (
                    <PressableScale
                      key={`${card.lens}-${card.title}-${index}`}
                      onPress={() => nav.openChat(card.prompt, true)}
                      motionPreset="quiet"
                      style={localStyles.footerCardButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${card.title} in chat`}
                    >
                      <Text style={localStyles.footerCardLens}>
                        {card.lens}
                      </Text>
                      <Text
                        style={localStyles.footerCardTitle}
                        numberOfLines={1}
                      >
                        {card.title}
                      </Text>
                    </PressableScale>
                  ))}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={bookSelectorVisible}
        animationType="none"
        transparent
        onRequestClose={() => setBookSelectorVisible(false)}
      >
        <View style={localStyles.selectorOverlayTop}>
          <Pressable
            onPress={() => setBookSelectorVisible(false)}
            style={localStyles.modalBackdrop}
          />
          <Animated.View
            style={[
              localStyles.selectorDropdownCard,
              {
                opacity: selectorDropAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
                transform: [
                  {
                    translateY: selectorDropAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={localStyles.modalHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.panelTitle}>Select Book</Text>
              </View>
              <ActionButton
                label="Close"
                variant="ghost"
                motionPreset="quiet"
                onPress={() => setBookSelectorVisible(false)}
              />
            </View>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              placeholder="Search books..."
              placeholderTextColor={T.colors.textMuted}
              style={localStyles.bookSearchInput}
              value={bookFilter}
              onChangeText={setBookFilter}
            />
            <ScrollView
              style={localStyles.selectorScroll}
              showsVerticalScrollIndicator={false}
            >
              {filteredOldTestamentBooks.length > 0 ? (
                <View style={localStyles.selectorSection}>
                  <Text style={localStyles.selectorSectionLabel}>
                    Old Testament
                  </Text>
                  {filteredOldTestamentBooks.map((book) => (
                    <PressableScale
                      key={book}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${book}`}
                      motionPreset="quiet"
                      disabled={controller.readerLoading}
                      onPress={() => void handleSelectBook(book)}
                      style={[
                        localStyles.selectorRowButton,
                        book === controller.reader.book
                          ? localStyles.selectorRowButtonActive
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.selectorRowLabel,
                          book === controller.reader.book
                            ? localStyles.selectorRowLabelActive
                            : null,
                        ]}
                      >
                        {book}
                      </Text>
                      <Text style={localStyles.selectorRowMeta}>
                        Ch {lastChapterByBook[book] ?? 1}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              ) : null}
              {filteredNewTestamentBooks.length > 0 ? (
                <View style={localStyles.selectorSection}>
                  <Text style={localStyles.selectorSectionLabel}>
                    New Testament
                  </Text>
                  {filteredNewTestamentBooks.map((book) => (
                    <PressableScale
                      key={book}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${book}`}
                      motionPreset="quiet"
                      disabled={controller.readerLoading}
                      onPress={() => void handleSelectBook(book)}
                      style={[
                        localStyles.selectorRowButton,
                        book === controller.reader.book
                          ? localStyles.selectorRowButtonActive
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          localStyles.selectorRowLabel,
                          book === controller.reader.book
                            ? localStyles.selectorRowLabelActive
                            : null,
                        ]}
                      >
                        {book}
                      </Text>
                      <Text style={localStyles.selectorRowMeta}>
                        Ch {lastChapterByBook[book] ?? 1}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
              ) : null}
              {filteredBooks.length === 0 ? (
                <Text style={styles.caption}>
                  No books match "{bookFilter}".
                </Text>
              ) : null}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={chapterSelectorVisible}
        animationType="none"
        transparent
        onRequestClose={closeChapterSelector}
      >
        <View style={localStyles.selectorOverlayTop}>
          <Pressable
            onPress={closeChapterSelector}
            style={localStyles.modalBackdrop}
          />
          <Animated.View
            style={[
              localStyles.selectorDropdownCard,
              {
                opacity: selectorDropAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
                transform: [
                  {
                    translateY: selectorDropAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={localStyles.modalHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.panelTitle}>Select Chapter</Text>
                <Text style={styles.caption}>{chapterSelectionBookName}</Text>
              </View>
              <ActionButton
                label="Close"
                variant="ghost"
                motionPreset="quiet"
                onPress={closeChapterSelector}
              />
            </View>
            <ScrollView
              style={localStyles.selectorScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={localStyles.chapterGrid}>
                {chapterOptions.map((chapter) => (
                  <PressableScale
                    key={`chapter-${chapter}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open chapter ${chapter}`}
                    motionPreset="quiet"
                    disabled={controller.readerLoading}
                    onPress={() => void handleSelectChapter(chapter)}
                    style={[
                      localStyles.chapterChip,
                      chapter === suggestedChapterForSelectedBook
                        ? localStyles.chapterChipActive
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        localStyles.chapterChipLabel,
                        chapter === suggestedChapterForSelectedBook
                          ? localStyles.chapterChipLabelActive
                          : null,
                      ]}
                    >
                      {chapter}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={selectionModalVisible}
        animationType="slide"
        transparent
        onRequestClose={clearSelection}
      >
        <View style={localStyles.modalOverlay}>
          <Pressable
            onPress={clearSelection}
            style={localStyles.modalBackdrop}
          />
          <View style={localStyles.modalCard}>
            <View style={localStyles.modalHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.panelTitle}>Selection tools</Text>
                <Text style={styles.caption}>{selectedVerseLabel}</Text>
              </View>
              <ActionButton
                label="Close"
                variant="ghost"
                motionPreset="quiet"
                onPress={clearSelection}
              />
            </View>

            <ScrollView style={localStyles.modalContent}>
              {selectionView === "synopsis" && modalFeedbackLabel ? (
                <Text style={localStyles.modalFeedbackText}>
                  {modalFeedbackLabel}
                </Text>
              ) : null}

              {selectionView === "synopsis" ? (
                <>
                  <View style={localStyles.modalPanel}>
                    {selectionSynopsisLoading ? (
                      <View style={styles.rowAlignCenter}>
                        <ActivityIndicator color={T.colors.accent} />
                        <Text style={styles.caption}>
                          Analyzing selection...
                        </Text>
                      </View>
                    ) : null}
                    {selectionSynopsisError ? (
                      <Text style={styles.error}>{selectionSynopsisError}</Text>
                    ) : null}
                    {selectionSynopsis && !selectionSynopsisLoading ? (
                      <Text style={styles.connectionSynopsis}>
                        {selectionSynopsis.synopsis}
                      </Text>
                    ) : null}
                  </View>

                  <View style={localStyles.modalActionRow}>
                    <ActionButton
                      label={selectionMapLoading ? "Tracing..." : "Trace"}
                      variant="primary"
                      motionPreset="quiet"
                      disabled={selectionMapLoading}
                      onPress={() => void handleTraceSelection()}
                      style={localStyles.compactPrimaryButton}
                      labelStyle={localStyles.compactPrimaryButtonLabel}
                    />
                    <ActionButton
                      label={selectionCopySuccess ? "Copied" : "Copy"}
                      variant="ghost"
                      motionPreset="quiet"
                      onPress={() => void handleCopySelection()}
                      style={localStyles.compactHeaderAction}
                      labelStyle={localStyles.compactHeaderActionLabel}
                    />
                    <ActionButton
                      label={selectionShareSuccess ? "Shared" : "Share"}
                      variant="ghost"
                      motionPreset="quiet"
                      onPress={() => void handleShareSelection()}
                      style={localStyles.compactHeaderAction}
                      labelStyle={localStyles.compactHeaderActionLabel}
                    />
                    <ActionButton
                      label={rootLoading ? "ROOT..." : "ROOT"}
                      variant="ghost"
                      motionPreset="quiet"
                      disabled={selectionSynopsisLoading || rootLoading}
                      onPress={() => void handleRootTranslation()}
                      style={localStyles.compactHeaderAction}
                      labelStyle={[
                        localStyles.compactHeaderActionLabel,
                        localStyles.rootActionLabel,
                      ]}
                    />
                  </View>
                </>
              ) : (
                <RootTranslationPanel
                  isLoading={rootLoading}
                  language={rootLanguage}
                  words={rootWords}
                  lostContext={rootLostContext}
                  fallbackText={rootFallbackText}
                  selectedWordIndex={rootSelectedWordIndex}
                  onSelectWord={setRootSelectedWordIndex}
                  onBack={handleBackToSynopsis}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const localStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  headerShell: {
    borderBottomWidth: 1,
    borderBottomColor: T.colors.border,
    backgroundColor: "rgba(24,24,27,0.94)",
    zIndex: 12,
  },
  headerBar: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 5,
  },
  headerControlsTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
  },
  headerMenuButton: {
    width: 30,
    height: 30,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerPickerButton: {
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  headerBookPickerButton: {
    flex: 1,
    minWidth: 114,
  },
  headerPickerLabel: {
    color: T.colors.text,
    fontSize: T.typography.caption,
    fontWeight: "600",
  },
  headerNavButton: {
    width: 52,
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  compactPrimaryButton: {
    flex: 0,
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  compactPrimaryButtonLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  compactHeaderAction: {
    flex: 0,
    minHeight: 34,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  compactHeaderActionLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  selectionStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerRevealOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 24,
  },
  headerRevealButton: {
    width: 30,
    height: 30,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  readerScroll: {
    flex: 1,
  },
  readerContent: {
    paddingHorizontal: 0,
    paddingBottom: 22,
  },
  readingSurface: {
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  loadingState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24,
  },
  verseRow: {
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: 0,
    paddingLeft: 0,
    paddingRight: 0,
    paddingVertical: 2,
    flexDirection: "row",
    gap: 2,
    alignItems: "flex-start",
  },
  verseParagraphStart: {
    marginTop: 14,
  },
  verseRowHighlightBase: {
    borderWidth: 1.5,
    borderLeftWidth: 3,
    borderRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 1,
  },
  verseRowSelection: {
    borderWidth: 1,
    borderRadius: T.radius.sm,
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  verseRowFocused: {
    borderWidth: 1,
    borderRadius: T.radius.sm,
    borderColor: T.colors.pine,
    backgroundColor: T.colors.pineSoft,
  },
  verseNumberButton: {
    minWidth: 12,
    minHeight: 16,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  verseNumberText: {
    color: T.colors.accent,
    fontWeight: "700",
    fontSize: 9,
  },
  verseTextPressable: {
    flex: 1,
    paddingRight: 1,
  },
  verseText: {
    color: T.colors.text,
    fontSize: 18,
    lineHeight: 31,
    fontFamily: T.fonts.serif,
  },
  verseTextParagraphStart: {
    paddingLeft: 8,
  },
  crossRefSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    paddingTop: 10,
    gap: 8,
  },
  crossRefTitle: {
    color: T.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  chapterFooterSection: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
    paddingTop: 14,
    gap: 6,
  },
  chapterOrientation: {
    color: T.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: "italic",
    paddingHorizontal: 4,
    textAlign: "center",
  },
  footerLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
  },
  footerCardRow: {
    gap: 6,
    paddingRight: 8,
  },
  footerCardButton: {
    minWidth: 108,
    borderRadius: T.radius.sm,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 2,
  },
  footerCardLens: {
    color: T.colors.accent,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  footerCardTitle: {
    color: T.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  modalCard: {
    maxHeight: "84%",
    borderTopLeftRadius: T.radius.lg,
    borderTopRightRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.ink,
    padding: T.spacing.md,
    gap: T.spacing.sm,
  },
  selectorOverlayTop: {
    flex: 1,
    justifyContent: "flex-start",
  },
  selectorDropdownCard: {
    maxHeight: "78%",
    borderBottomLeftRadius: T.radius.lg,
    borderBottomRightRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.ink,
    padding: T.spacing.md,
    gap: T.spacing.sm,
    paddingTop: T.spacing.sm,
  },
  bookSearchInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    color: T.colors.text,
    paddingHorizontal: T.spacing.sm,
    fontSize: T.typography.caption,
  },
  selectorScroll: {
    maxHeight: 520,
  },
  selectorSection: {
    gap: 6,
    paddingBottom: 10,
  },
  selectorSectionLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 4,
  },
  selectorRowButton: {
    minHeight: 40,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  selectorRowButtonActive: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  selectorRowLabel: {
    color: T.colors.text,
    fontSize: T.typography.bodySm,
    fontWeight: "600",
  },
  selectorRowLabelActive: {
    color: T.colors.accentStrong,
  },
  selectorRowMeta: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    fontWeight: "600",
  },
  chapterGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: T.spacing.md,
  },
  chapterChip: {
    width: 56,
    minHeight: 40,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chapterChipActive: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  chapterChipLabel: {
    color: T.colors.text,
    fontSize: T.typography.bodySm,
    fontWeight: "700",
  },
  chapterChipLabelActive: {
    color: T.colors.accentStrong,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.spacing.sm,
  },
  modalContent: {
    maxHeight: 540,
  },
  selectionPreviewCard: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    padding: T.spacing.sm,
    marginBottom: T.spacing.sm,
  },
  selectionPreviewText: {
    color: T.colors.text,
    fontFamily: T.fonts.serif,
    fontSize: T.typography.body,
    lineHeight: 28,
  },
  modalFeedbackText: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    marginBottom: T.spacing.sm,
  },
  modalPanel: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    padding: T.spacing.sm,
    gap: T.spacing.sm,
    marginBottom: T.spacing.sm,
  },
  modalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: T.spacing.sm,
  },
  rootActionLabel: {
    color: T.colors.accent,
    fontWeight: "700",
  },
  highlightRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: T.spacing.sm,
    marginTop: T.spacing.sm,
    marginBottom: T.spacing.lg,
  },
  highlightColorButton: {
    width: T.touchTarget.min,
    height: T.touchTarget.min,
    borderRadius: T.touchTarget.min,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
});
