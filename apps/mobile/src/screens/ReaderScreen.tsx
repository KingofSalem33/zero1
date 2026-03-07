import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import type { MobileGoDeeperPayload } from "../types/chat";
import { isVisualContextBundle } from "../types/visualization";

const DOUBLE_TAP_WINDOW_MS = 380;
const HEADER_HIDE_SCROLL_DISTANCE = 34;
const HEADER_TOGGLE_ANIMATION_MS = 180;
const READER_LAST_CHAPTERS_BY_BOOK_STORAGE_KEY =
  "biblelot:mobile:reader:last-chapters-by-book";
const DEFAULT_MARKER_COLOR = "#D4AF37";
const PARAGRAPH_INDENT = "\u2003";
type IoniconName = keyof typeof Ionicons.glyphMap;

type FooterLensMeta = {
  label: string;
  icon: IoniconName;
  tint: string;
  border: string;
  surface: string;
};

const FOOTER_LENS_META: Record<string, FooterLensMeta> = {
  PROPHECY: {
    label: "Prophecy",
    icon: "sparkles-outline",
    tint: "#67E8F9",
    border: "rgba(103, 232, 249, 0.34)",
    surface: "rgba(6, 182, 212, 0.16)",
  },
  TYPOLOGY: {
    label: "Similar Story",
    icon: "git-compare-outline",
    tint: "#FDBA74",
    border: "rgba(253, 186, 116, 0.34)",
    surface: "rgba(249, 115, 22, 0.14)",
  },
  THREAD: {
    label: "Threads",
    icon: "share-social-outline",
    tint: "#D8B4FE",
    border: "rgba(216, 180, 254, 0.34)",
    surface: "rgba(168, 85, 247, 0.14)",
  },
  PATTERN: {
    label: "Pattern",
    icon: "grid-outline",
    tint: "#93C5FD",
    border: "rgba(147, 197, 253, 0.34)",
    surface: "rgba(59, 130, 246, 0.14)",
  },
  ROOTS: {
    label: "Word Study",
    icon: "leaf-outline",
    tint: "#FCD34D",
    border: "rgba(252, 211, 77, 0.34)",
    surface: "rgba(245, 158, 11, 0.16)",
  },
  WORLD: {
    label: "Context",
    icon: "earth-outline",
    tint: "#CBD5E1",
    border: "rgba(203, 213, 225, 0.32)",
    surface: "rgba(100, 116, 139, 0.14)",
  },
  EXPLORE: {
    label: "Explore",
    icon: "compass-outline",
    tint: "#A5B4FC",
    border: "rgba(165, 180, 252, 0.34)",
    surface: "rgba(99, 102, 241, 0.14)",
  },
  GOLDEN: {
    label: "Golden Thread",
    icon: "infinite-outline",
    tint: T.colors.accentStrong,
    border: "rgba(212, 175, 55, 0.4)",
    surface: "rgba(212, 175, 55, 0.16)",
  },
};

function getFooterLensMeta(lens: string): FooterLensMeta {
  const normalized = lens.trim().toUpperCase();
  const match = FOOTER_LENS_META[normalized];
  if (match) return match;
  return {
    label: normalized || "Explore",
    icon: "search-outline",
    tint: T.colors.textMuted,
    border: "rgba(161, 161, 170, 0.26)",
    surface: "rgba(161, 161, 170, 0.12)",
  };
}

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
  underline: string;
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
    fill: rgba(parsed, 0.22),
    underline: rgba(parsed, 0.92),
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
    openChat: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
    openModeMenu: () => void;
  };
}) {
  const controller = useMobileApp();
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
  const [activeFooterCardIndex, setActiveFooterCardIndex] = useState(0);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [headerMeasuredHeight, setHeaderMeasuredHeight] = useState(56);
  const lastVerseTapRef = useRef<{ verse: number; at: number } | null>(null);
  const suppressNextVersePressRef = useRef(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const lastScrollYRef = useRef(0);
  const headerScrollDirectionRef = useRef<-1 | 0 | 1>(0);
  const headerScrollDeltaRef = useRef(0);
  const [feedbackVerse, setFeedbackVerse] = useState<number | null>(null);
  const [pendingRemovalVerses, setPendingRemovalVerses] = useState<number[]>(
    [],
  );
  const feedbackVerseColorRef = useRef<string>(controller.readerHighlightColor);
  const headerVisibilityAnim = useRef(new Animated.Value(1)).current;
  const selectorDropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionSynopsisError(null);
    setPendingRemovalVerses([]);
    resetRootTranslation();
  }, [controller.reader.book, controller.reader.chapter, resetRootTranslation]);

  useEffect(() => {
    setHeaderVisible(true);
    headerScrollDirectionRef.current = 0;
    headerScrollDeltaRef.current = 0;
    lastScrollYRef.current = 0;
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [controller.reader.book, controller.reader.chapter]);

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

  useEffect(() => {
    if (
      !bookSelectorVisible &&
      !chapterSelectorVisible &&
      !selectionModalVisible
    ) {
      return;
    }
    setHeaderVisible(true);
    headerScrollDirectionRef.current = 0;
    headerScrollDeltaRef.current = 0;
  }, [bookSelectorVisible, chapterSelectorVisible, selectionModalVisible]);

  useEffect(() => {
    setActiveFooterCardIndex(0);
  }, [controller.reader.book, controller.reader.chapter]);

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
  const footerOrientationParts = useMemo(() => {
    const orientation = controller.readerFooter?.orientation?.trim() ?? "";
    if (!orientation) return null;
    const splitIndex = orientation.indexOf(". ");
    if (splitIndex < 0) {
      return { lead: orientation, tail: null as string | null };
    }
    return {
      lead: orientation.slice(0, splitIndex + 1),
      tail: orientation.slice(splitIndex + 2).trim() || null,
    };
  }, [controller.readerFooter?.orientation]);
  const activeFooterCard = useMemo(() => {
    const cards = controller.readerFooter?.cards ?? [];
    if (cards.length === 0) return null;
    const safeIndex = Math.min(activeFooterCardIndex, cards.length - 1);
    return cards[safeIndex] ?? null;
  }, [activeFooterCardIndex, controller.readerFooter?.cards]);
  const currentBookIndex = useMemo(
    () =>
      BIBLE_BOOKS.indexOf(
        controller.reader.book as (typeof BIBLE_BOOKS)[number],
      ),
    [controller.reader.book],
  );
  const currentBookChapterCount = useMemo(
    () => getBibleChapterCount(controller.reader.book) ?? 1,
    [controller.reader.book],
  );
  const footerPrevDisabled =
    currentBookIndex <= 0 && controller.reader.chapter <= 1;
  const footerNextDisabled =
    currentBookIndex >= BIBLE_BOOKS.length - 1 &&
    controller.reader.chapter >= currentBookChapterCount;

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
  const defaultMarkerTone = useMemo(
    () =>
      buildHighlightTone(controller.readerHighlightColor) ??
      buildHighlightTone(DEFAULT_MARKER_COLOR),
    [controller.readerHighlightColor],
  );
  const pendingRemovalVerseSet = useMemo(
    () => new Set(pendingRemovalVerses),
    [pendingRemovalVerses],
  );

  useEffect(() => {
    if (feedbackVerse === null) return;
    if (verseHighlightMap.has(feedbackVerse)) {
      setFeedbackVerse(null);
    }
  }, [feedbackVerse, verseHighlightMap]);

  function triggerSelectionHaptic() {
    Haptics.selectionAsync().catch(() => {});
  }

  function runHighlightFeedbackPulse(verse: number, color: string) {
    setFeedbackVerse(verse);
    feedbackVerseColorRef.current = color;
  }

  function markVersePendingRemoval(verse: number) {
    setPendingRemovalVerses((current) =>
      current.includes(verse) ? current : [...current, verse],
    );
  }

  function clearVersePendingRemoval(verse: number) {
    setPendingRemovalVerses((current) =>
      current.includes(verse)
        ? current.filter((entry) => entry !== verse)
        : current,
    );
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
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    await controller.navigateReaderTo(targetBook, chapter);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, 0);
  }

  function clearSelection() {
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionSynopsisError(null);
    setSelectionView("synopsis");
    resetRootTranslation();
    lastVerseTapRef.current = null;
  }

  function scrollReaderToTop() {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, 40);
  }

  async function handleGoToPreviousChapter() {
    scrollReaderToTop();
    await controller.goToPreviousReaderChapter();
    setTimeout(() => {
      scrollReaderToTop();
    }, 0);
  }

  async function handleGoToNextChapter() {
    scrollReaderToTop();
    await controller.goToNextReaderChapter();
    setTimeout(() => {
      scrollReaderToTop();
    }, 0);
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

  function handleGoDeeperSelection() {
    if (!selectedVerseLabel) return;
    const prompt: MobileGoDeeperPayload = {
      displayText: selectedVerseLabel,
      prompt: `${selectedVerseLabel}\n\nHelp me understand this passage.`,
      mode: "go_deeper_short",
    };
    nav.openChat(prompt, true);
    clearSelection();
  }

  const modalFeedbackLabel = selectionMapLoading ? "Tracing..." : null;

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
    const deltaY = clampedY - lastScrollYRef.current;
    const deltaAbs = Math.abs(deltaY);
    lastScrollYRef.current = clampedY;

    if (deltaAbs < 0.5) {
      return;
    }
    if (
      bookSelectorVisible ||
      chapterSelectorVisible ||
      selectionModalVisible
    ) {
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
      headerScrollDeltaRef.current >= HEADER_HIDE_SCROLL_DISTANCE
    ) {
      setHeaderVisible(false);
      headerScrollDeltaRef.current = 0;
      return;
    }

    if (
      direction === -1 &&
      !headerVisible &&
      headerScrollDeltaRef.current >= HEADER_HIDE_SCROLL_DISTANCE
    ) {
      setHeaderVisible(true);
      headerScrollDeltaRef.current = 0;
    }
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
      if (verseHighlightMap.has(verse)) {
        setFeedbackVerse((current) => (current === verse ? null : current));
        markVersePendingRemoval(verse);
        void controller
          .handleReaderRemoveHighlightSelection([verse])
          .finally(() => clearVersePendingRemoval(verse));
      } else {
        clearVersePendingRemoval(verse);
        runHighlightFeedbackPulse(verse, controller.readerHighlightColor);
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
              onPress={() => void handleGoToPreviousChapter()}
              variant="ghost"
              style={localStyles.headerNavButton}
              labelStyle={localStyles.compactHeaderActionLabel}
            />
            <ActionButton
              disabled={controller.readerLoading}
              label="Next"
              motionPreset="quiet"
              onPress={() => void handleGoToNextChapter()}
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

      <ScrollView
        ref={scrollViewRef}
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

          <View style={localStyles.chapterTextFlow}>
            <View style={localStyles.chapterHeading}>
              <Text style={localStyles.chapterHeadingBook}>
                {controller.reader.book}
              </Text>
              <Text style={localStyles.chapterHeadingNumber}>
                {controller.reader.chapter}
              </Text>
            </View>
            <Text style={localStyles.verseText}>
              {controller.reader.verses.map((item, index) => {
                const inSelection = selectedVerses.includes(item.verse);
                const highlightVisual = verseHighlightMap.get(item.verse);
                const selectedVerse =
                  controller.readerSelectedVerse === item.verse;
                const addFeedbackActive = feedbackVerse === item.verse;
                const removePending = pendingRemovalVerseSet.has(item.verse);
                const isParagraphStart =
                  item.verse === 1 || item.verse % 4 === 1;
                const leadSpacing =
                  index === 0
                    ? PARAGRAPH_INDENT
                    : isParagraphStart
                      ? `\n\n${PARAGRAPH_INDENT}`
                      : " ";
                const addFeedbackTone =
                  buildHighlightTone(feedbackVerseColorRef.current) ??
                  defaultMarkerTone;
                const hasPersistentHighlight =
                  Boolean(highlightVisual) && !removePending;
                const markerTone = addFeedbackActive
                  ? addFeedbackTone
                  : hasPersistentHighlight
                    ? (highlightVisual?.tone ?? null)
                    : null;
                const markerVisible = Boolean(markerTone);
                const handleVerseLongPress = () => {
                  triggerSelectionHaptic();
                  suppressNextVersePressRef.current = true;
                  lastVerseTapRef.current = null;
                  const draft = {
                    startVerse: item.verse,
                    endVerse: item.verse,
                  };
                  setSelectionDraft(draft);
                  void openSelectionTools(draft);
                };
                return (
                  <Text
                    key={`${controller.reader.book}-${controller.reader.chapter}-${item.verse}`}
                  >
                    {leadSpacing}
                    <Text
                      accessibilityRole="button"
                      accessibilityLabel={`Verse ${item.verse} references`}
                      onPress={() =>
                        void controller.selectReaderVerse(item.verse)
                      }
                      suppressHighlighting
                      style={localStyles.verseNumberInlineText}
                    >
                      {item.verse}
                    </Text>{" "}
                    <Text
                      onLongPress={handleVerseLongPress}
                      onPress={() =>
                        handleVerseTextPress(item.verse, item.text)
                      }
                      suppressHighlighting
                      style={[
                        markerVisible ? localStyles.verseTextHighlighted : null,
                        markerVisible && markerTone
                          ? {
                              textDecorationLine: "underline",
                              textDecorationStyle: "solid",
                              textDecorationColor: markerTone.underline,
                            }
                          : null,
                        selectedVerse &&
                        !hasPersistentHighlight &&
                        !addFeedbackActive
                          ? localStyles.inlineVerseFocused
                          : null,
                        inSelection &&
                        !hasPersistentHighlight &&
                        !addFeedbackActive
                          ? localStyles.inlineVerseSelection
                          : null,
                      ]}
                    >
                      {item.text}
                    </Text>
                  </Text>
                );
              })}
            </Text>
          </View>

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

          <View style={localStyles.footerChapterNavRow}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Previous chapter"
              disabled={footerPrevDisabled || controller.readerLoading}
              motionPreset="quiet"
              onPress={() => void handleGoToPreviousChapter()}
              style={localStyles.footerChapterNavButton}
            >
              <Ionicons
                color={
                  footerPrevDisabled
                    ? "rgba(228, 228, 231, 0.36)"
                    : "rgba(228, 228, 231, 0.88)"
                }
                name="chevron-back"
                size={18}
              />
            </PressableScale>

            <View style={localStyles.footerChapterIndicator}>
              <Text
                style={localStyles.footerChapterIndicatorLabel}
                numberOfLines={1}
              >
                {controller.reader.book} {controller.reader.chapter}
              </Text>
            </View>

            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Next chapter"
              disabled={footerNextDisabled || controller.readerLoading}
              motionPreset="quiet"
              onPress={() => void handleGoToNextChapter()}
              style={localStyles.footerChapterNavButton}
            >
              <Ionicons
                color={
                  footerNextDisabled
                    ? "rgba(228, 228, 231, 0.36)"
                    : "rgba(228, 228, 231, 0.88)"
                }
                name="chevron-forward"
                size={18}
              />
            </PressableScale>
          </View>

          <View style={localStyles.chapterFooterSection}>
            <View style={localStyles.footerDividerWrap}>
              <View style={localStyles.footerDividerLine} />
            </View>
            {controller.readerFooterLoading ? (
              <Text style={localStyles.footerLoadingLabel}>
                Loading chapter tools...
              </Text>
            ) : null}
            {controller.readerFooter ? (
              <>
                {footerOrientationParts ? (
                  <Text style={localStyles.chapterOrientation}>
                    <Text style={localStyles.chapterOrientationLead}>
                      {footerOrientationParts.lead}
                    </Text>
                    {footerOrientationParts.tail ? (
                      <>
                        {" "}
                        <Text style={localStyles.chapterOrientationTail}>
                          {footerOrientationParts.tail}
                        </Text>
                      </>
                    ) : null}
                  </Text>
                ) : null}
                <Text style={localStyles.footerLabel}>
                  Ways to explore this chapter
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={localStyles.footerCardRow}
                >
                  {controller.readerFooter.cards.map((card, index) =>
                    (() => {
                      const lensMeta = getFooterLensMeta(card.lens);
                      const isActive = index === activeFooterCardIndex;
                      return (
                        <PressableScale
                          key={`${card.lens}-${card.title}-${index}`}
                          onPress={() => {
                            setActiveFooterCardIndex(index);
                            nav.openChat(card.prompt, true);
                          }}
                          motionPreset="quiet"
                          style={[
                            localStyles.footerCardButton,
                            isActive
                              ? localStyles.footerCardButtonActive
                              : null,
                            {
                              borderColor: lensMeta.border,
                              backgroundColor: lensMeta.surface,
                            },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${card.title} in chat`}
                        >
                          <View style={localStyles.footerCardTopRow}>
                            <View
                              style={[
                                localStyles.footerLensPill,
                                {
                                  borderColor: lensMeta.border,
                                  backgroundColor: lensMeta.surface,
                                },
                              ]}
                            >
                              <Ionicons
                                name={lensMeta.icon}
                                size={12}
                                color={lensMeta.tint}
                              />
                              <Text
                                style={[
                                  localStyles.footerCardLens,
                                  { color: lensMeta.tint },
                                ]}
                              >
                                {lensMeta.label}
                              </Text>
                            </View>
                            <Ionicons
                              name={
                                isActive
                                  ? "arrow-forward"
                                  : "arrow-forward-outline"
                              }
                              size={13}
                              color={
                                isActive
                                  ? T.colors.text
                                  : "rgba(228, 228, 231, 0.56)"
                              }
                            />
                          </View>
                          <Text
                            style={localStyles.footerCardTitle}
                            numberOfLines={2}
                          >
                            {card.title}
                          </Text>
                        </PressableScale>
                      );
                    })(),
                  )}
                </ScrollView>
                {activeFooterCard ? (
                  <Text style={localStyles.footerAssistLabel}>
                    Tap a lens card to explore in chat
                  </Text>
                ) : null}
              </>
            ) : null}
            {controller.readerFooterError ? (
              <Text style={localStyles.footerErrorLabel}>
                {controller.readerFooterError}
              </Text>
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
                      label="Go Deeper"
                      variant="ghost"
                      motionPreset="quiet"
                      onPress={handleGoDeeperSelection}
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
    minHeight: 32,
    borderRadius: 7,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  compactPrimaryButtonLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  compactHeaderAction: {
    flex: 0,
    minHeight: 32,
    borderRadius: 7,
    paddingHorizontal: 10,
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
  readerScroll: {
    flex: 1,
  },
  readerContent: {
    paddingHorizontal: 0,
    paddingBottom: 22,
  },
  readingSurface: {
    paddingTop: 8,
    paddingHorizontal: 0,
  },
  chapterTextFlow: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingBottom: 12,
  },
  chapterHeading: {
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(212, 175, 55, 0.22)",
    paddingBottom: 20,
    marginBottom: 16,
  },
  chapterHeadingBook: {
    color: T.colors.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  chapterHeadingNumber: {
    color: "rgba(212, 175, 55, 0.86)",
    fontSize: 52,
    lineHeight: 56,
    fontWeight: "300",
    marginTop: 4,
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
    letterSpacing: 0.12,
    fontFamily: T.fonts.serif,
    textAlign: "left",
  },
  verseTextHighlighted: {
    color: "#f4f4f5",
  },
  verseNumberInlineText: {
    color: T.colors.accent,
    fontWeight: "600",
    fontSize: 10,
    lineHeight: 16,
    opacity: 0.78,
  },
  inlineVerseSelection: {
    backgroundColor: T.colors.accentSoft,
    borderRadius: 3,
  },
  inlineVerseFocused: {
    backgroundColor: T.colors.pineSoft,
    borderRadius: 3,
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
  footerChapterNavRow: {
    marginTop: 26,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  footerChapterNavButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(24, 24, 27, 0.84)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerChapterIndicator: {
    maxWidth: "72%",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(24, 24, 27, 0.84)",
    borderRadius: T.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  footerChapterIndicatorLabel: {
    color: "rgba(228, 228, 231, 0.88)",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  chapterFooterSection: {
    marginTop: 2,
    paddingTop: 2,
    gap: 8,
  },
  footerDividerWrap: {
    paddingHorizontal: 28,
    marginBottom: 2,
  },
  footerDividerLine: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  chapterOrientation: {
    color: T.colors.textMuted,
    fontSize: 13,
    lineHeight: 21,
    fontStyle: "normal",
    fontWeight: "400",
    paddingHorizontal: 12,
    textAlign: "center",
  },
  chapterOrientationLead: {
    fontStyle: "italic",
    color: "rgba(212, 212, 216, 0.86)",
    fontWeight: "300",
  },
  chapterOrientationTail: {
    color: "rgba(228, 228, 231, 0.78)",
    fontWeight: "500",
    fontStyle: "normal",
  },
  footerLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
    marginTop: 2,
  },
  footerLoadingLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
  },
  footerCardRow: {
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  footerCardButton: {
    width: 238,
    minHeight: 78,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 7,
  },
  footerCardButtonActive: {
    borderColor: "rgba(255, 255, 255, 0.32)",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  footerCardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  footerLensPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: T.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  footerCardLens: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  footerCardTitle: {
    color: T.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  footerAssistLabel: {
    color: "rgba(212, 212, 216, 0.68)",
    fontSize: 10,
    letterSpacing: 0.35,
    textAlign: "center",
  },
  footerErrorLabel: {
    color: T.colors.textMuted,
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
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
    alignSelf: "flex-start",
    gap: 8,
    paddingHorizontal: 2,
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
