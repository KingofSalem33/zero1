import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  Directions,
  FlingGestureHandler,
  State,
} from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  BIBLE_BOOKS,
  getBibleChapterCount,
  resolveBibleBookName,
  tryParseBookmarkReference,
} from "@zero1/shared";
import { ActionButton } from "../components/native/ActionButton";
import { BottomSheetSurface } from "../components/native/BottomSheetSurface";
import { ChipButton } from "../components/native/ChipButton";
import { CompactButton } from "../components/native/CompactButton";
import { IconButton } from "../components/native/IconButton";
import { ListRowButton } from "../components/native/ListRowButton";
import { NoteEditorModal } from "../components/native/NoteEditorModal";
import { PressableScale } from "../components/native/PressableScale";
import { RootTranslationPanel } from "../components/native/RootTranslationPanel";
import { LoadingDotsNative } from "../components/native/loading/LoadingDotsNative";
import { ReaderChapterSkeleton } from "../components/native/loading/ReaderChapterSkeleton";
import {
  SkeletonBlock,
  SkeletonTextLines,
} from "../components/native/loading/SkeletonNative";
import { useMobileApp } from "../context/MobileAppContext";
import { useRootTranslationMobile } from "../hooks/useRootTranslationMobile";
import {
  fetchVerseCrossReferences,
  fetchVerseText,
  fetchSynopsis,
  type SynopsisResponse,
  type VerseCrossReferenceItem,
} from "../lib/api";
import { getBibleBook } from "../lib/bibleBookCache";
import { MOBILE_ENV } from "../lib/env";
import { styles, T } from "../theme/mobileStyles";
import type { MobileGoDeeperPayload } from "../types/chat";
import { ensureMinLoaderDuration } from "../utils/ensureMinLoaderDuration";
import { formatRelativeDate } from "./common/EntityCards";

const DOUBLE_TAP_WINDOW_MS = 380;
const HEADER_HIDE_SCROLL_DISTANCE = 34;
const HEADER_TOGGLE_ANIMATION_MS = 180;
const CHAPTER_SWIPE_COOLDOWN_MS = 280;
const READER_LAST_CHAPTERS_BY_BOOK_STORAGE_KEY =
  "biblelot:mobile:reader:last-chapters-by-book";
const DEFAULT_MARKER_COLOR = "#D4AF37";
const PARAGRAPH_INDENT = "\u2003";
const MIN_REFERENCE_MODAL_LOADING_MS = 300;
const INITIAL_REFERENCE_ROWS_PER_GROUP = 3;
type IoniconName = keyof typeof Ionicons.glyphMap;
type ReferenceGroup = "parallel" | "prophecy" | "thematic";
const OT_BOOKS = new Set([
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
]);

const GOSPELS = new Set(["Matthew", "Mark", "Luke", "John"]);

const PROPHETS = new Set([
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
]);

const REFERENCE_GROUP_LABELS: Record<ReferenceGroup, string> = {
  parallel: "Parallel",
  prophecy: "Prophecy",
  thematic: "Thematic",
};

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

function normalizeReferenceString(reference: string): string | null {
  const parsed = tryParseBookmarkReference(reference);
  if (!parsed || parsed.verse === undefined) return null;
  const canonicalBook = resolveBibleBookName(parsed.book);
  if (!canonicalBook) return null;
  return `${canonicalBook} ${parsed.chapter}:${parsed.verse}`;
}

function parseReferenceWithVerse(reference: string): {
  book: (typeof BIBLE_BOOKS)[number];
  chapter: number;
  verse: number;
} | null {
  const parsed = tryParseBookmarkReference(reference);
  if (!parsed || parsed.verse === undefined) return null;
  const canonicalBook = resolveBibleBookName(parsed.book);
  if (!canonicalBook) return null;
  return {
    book: canonicalBook,
    chapter: parsed.chapter,
    verse: parsed.verse,
  };
}

function parseApiStatus(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/\((\d{3})\)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) ? parsed : null;
}

function getReferenceErrorMessage(error: unknown, fallback: string): string {
  const status = parseApiStatus(error);
  if (status === 429) {
    return "Too many requests right now. Try again in a few seconds.";
  }
  return fallback;
}

function classifyReferenceGroup(
  sourceBook: string,
  targetBook: string,
): ReferenceGroup {
  const sourceIsOT = OT_BOOKS.has(sourceBook);
  const targetIsOT = OT_BOOKS.has(targetBook);

  if (
    GOSPELS.has(sourceBook) &&
    GOSPELS.has(targetBook) &&
    sourceBook !== targetBook
  ) {
    return "parallel";
  }

  if (
    (sourceIsOT && !targetIsOT && PROPHETS.has(sourceBook)) ||
    (!sourceIsOT && targetIsOT && PROPHETS.has(targetBook))
  ) {
    return "prophecy";
  }

  if (sourceBook === targetBook) {
    return "parallel";
  }

  return "thematic";
}

export function ReaderScreen({
  nav,
}: {
  nav: {
    openChat: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
    openMapViewer: (
      title?: string,
      bundle?: unknown,
      traceQuery?: string,
    ) => void;
    openModeMenu: () => void;
  };
}) {
  const controller = useMobileApp();
  const [bookSelectorVisible, setBookSelectorVisible] = useState(false);
  const [chapterSelectorVisible, setChapterSelectorVisible] = useState(false);
  const [bookmarkSelectorVisible, setBookmarkSelectorVisible] = useState(false);
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
  const [selectionNoteEditorVisible, setSelectionNoteEditorVisible] =
    useState(false);
  const [selectionNoteDraft, setSelectionNoteDraft] = useState("");
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
  const {
    isLoading: referenceRootLoading,
    language: referenceRootLanguage,
    words: referenceRootWords,
    lostContext: referenceRootLostContext,
    fallbackText: referenceRootFallbackText,
    selectedWordIndex: referenceRootWordIndex,
    setSelectedWordIndex: setReferenceRootWordIndex,
    generate: generateReferenceRootTranslation,
    reset: resetReferenceRootTranslation,
  } = useRootTranslationMobile({
    apiBaseUrl: MOBILE_ENV.API_URL,
    accessToken: controller.session?.access_token,
  });
  const [activeFooterCardIndex, setActiveFooterCardIndex] = useState(0);
  const [referenceModalVisible, setReferenceModalVisible] = useState(false);
  const [referenceStack, setReferenceStack] = useState<string[]>([]);
  const [referenceVerseText, setReferenceVerseText] = useState("");
  const [referenceVerseTextLoading, setReferenceVerseTextLoading] =
    useState(false);
  const [referenceVerseTextError, setReferenceVerseTextError] = useState<
    string | null
  >(null);
  const [referenceCrossReferences, setReferenceCrossReferences] = useState<
    VerseCrossReferenceItem[]
  >([]);
  const [referenceCrossReferencesLoading, setReferenceCrossReferencesLoading] =
    useState(false);
  const [referenceCrossReferencesError, setReferenceCrossReferencesError] =
    useState<string | null>(null);
  const [referenceActionError, setReferenceActionError] = useState<
    string | null
  >(null);
  const [referenceView, setReferenceView] = useState<"explore" | "root">(
    "explore",
  );
  const [referenceNoteEditorVisible, setReferenceNoteEditorVisible] =
    useState(false);
  const [referenceNoteDraft, setReferenceNoteDraft] = useState("");
  const [referenceShowAllCrossReferences, setReferenceShowAllCrossReferences] =
    useState(false);
  const [pendingVerseNavigation, setPendingVerseNavigation] = useState<{
    book: string;
    chapter: number;
    verse: number;
    key: string;
    startedAt: number;
  } | null>(null);
  const [focusedNavigationVerse, setFocusedNavigationVerse] = useState<
    number | null
  >(null);
  const [readerViewportHeight, setReaderViewportHeight] = useState(0);
  const [readerContentHeight, setReaderContentHeight] = useState(0);
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
  const navigationFocusAnim = useRef(new Animated.Value(0)).current;
  const navigationFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const navigationFocusKeyRef = useRef<string | null>(null);
  const navigationFocusHandledKeyRef = useRef<string | null>(null);
  const referenceRequestIdRef = useRef(0);
  const selectionSynopsisRequestIdRef = useRef(0);
  const selectionSynopsisAbortRef = useRef<globalThis.AbortController | null>(
    null,
  );
  const verseLayoutByNumberRef = useRef<Record<number, number>>({});
  const chapterSwipeLockRef = useRef(false);
  const chapterSwipeLastAtRef = useRef(0);
  const suppressBookmarkTogglePressRef = useRef(false);
  useEffect(() => {
    selectionSynopsisAbortRef.current?.abort();
    selectionSynopsisAbortRef.current = null;
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionSynopsisLoading(false);
    setSelectionSynopsisError(null);
    setSelectionNoteEditorVisible(false);
    setSelectionNoteDraft("");
    setPendingRemovalVerses([]);
    setReferenceModalVisible(false);
    setReferenceStack([]);
    setReferenceVerseText("");
    setReferenceVerseTextError(null);
    setReferenceCrossReferences([]);
    setReferenceCrossReferencesError(null);
    setReferenceActionError(null);
    setReferenceView("explore");
    setReferenceNoteEditorVisible(false);
    setReferenceNoteDraft("");
    setReferenceShowAllCrossReferences(false);
    resetRootTranslation();
    resetReferenceRootTranslation();
  }, [
    controller.reader.book,
    controller.reader.chapter,
    resetReferenceRootTranslation,
    resetRootTranslation,
  ]);

  useEffect(() => {
    setHeaderVisible(true);
    headerScrollDirectionRef.current = 0;
    headerScrollDeltaRef.current = 0;
    lastScrollYRef.current = 0;
    verseLayoutByNumberRef.current = {};
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
    return () => {
      if (navigationFocusTimerRef.current) {
        clearTimeout(navigationFocusTimerRef.current);
        navigationFocusTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const target = controller.pendingReaderFocusTarget;
    if (!target) return;
    if (navigationFocusTimerRef.current) {
      clearTimeout(navigationFocusTimerRef.current);
      navigationFocusTimerRef.current = null;
    }
    navigationFocusKeyRef.current = target.key;
    navigationFocusHandledKeyRef.current = null;
    setPendingVerseNavigation(target);
    controller.clearPendingReaderFocusTarget(target.key);
  }, [
    controller.pendingReaderFocusTarget,
    controller.clearPendingReaderFocusTarget,
  ]);

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
      !bookmarkSelectorVisible &&
      !chapterSelectorVisible &&
      !selectionModalVisible &&
      !referenceModalVisible
    ) {
      return;
    }
    setHeaderVisible(true);
    headerScrollDirectionRef.current = 0;
    headerScrollDeltaRef.current = 0;
  }, [
    bookSelectorVisible,
    bookmarkSelectorVisible,
    chapterSelectorVisible,
    referenceModalVisible,
    selectionModalVisible,
  ]);

  useEffect(() => {
    setActiveFooterCardIndex(0);
  }, [controller.reader.book, controller.reader.chapter]);

  const filteredBooks = useMemo(() => {
    const query = bookFilter.trim().toLowerCase();
    if (!query) return [...BIBLE_BOOKS];
    return BIBLE_BOOKS.filter((book) => book.toLowerCase().includes(query));
  }, [bookFilter]);

  const bookSelectorInitialOffset = useMemo(() => {
    const index = (BIBLE_BOOKS as readonly string[]).indexOf(
      controller.reader.book,
    );
    if (index <= 0) return { x: 0, y: 0 };
    // Section label ~24px, each row ~44px, gap 6px between rows, section paddingBottom 10px
    const sectionLabelHeight = 24;
    const rowHeight = 44;
    const sectionGap = 6;
    const isNT = index >= 39;
    const rowIndex = isNT ? index - 39 : index;
    const otSectionHeight =
      sectionLabelHeight + 39 * rowHeight + 38 * sectionGap + 10;
    const yOffset = isNT
      ? otSectionHeight +
        sectionLabelHeight +
        rowIndex * (rowHeight + sectionGap)
      : sectionLabelHeight + rowIndex * (rowHeight + sectionGap);
    return { x: 0, y: Math.max(0, yOffset - 120) };
  }, [controller.reader.book]);

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
  const selectedHighlightForSelection = useMemo(() => {
    if (selectedVerses.length === 0) return null;
    const selectedVerseSet = new Set(selectedVerses);
    const exactMatch = controller.highlights.find(
      (item) =>
        item.book.toLowerCase() === controller.reader.book.toLowerCase() &&
        item.chapter === controller.reader.chapter &&
        item.verses.length === selectedVerses.length &&
        item.verses.every((verse) => selectedVerseSet.has(verse)),
    );
    return (
      exactMatch ??
      controller.highlights.find(
        (item) =>
          item.book.toLowerCase() === controller.reader.book.toLowerCase() &&
          item.chapter === controller.reader.chapter &&
          item.verses.some((verse) => selectedVerseSet.has(verse)),
      ) ??
      null
    );
  }, [
    controller.highlights,
    controller.reader.book,
    controller.reader.chapter,
    selectedVerses,
  ]);
  const currentChapterVerseTextMap = useMemo(
    () =>
      new Map(
        controller.reader.verses.map((entry) => [entry.verse, entry.text]),
      ),
    [controller.reader.verses],
  );
  const getLocalVerseTextForReference = useCallback(
    (reference: string | null): string | null => {
      if (!reference) return null;
      const parsed = parseReferenceWithVerse(reference);
      if (!parsed) return null;
      if (parsed.book.toLowerCase() !== controller.reader.book.toLowerCase()) {
        return null;
      }
      if (parsed.chapter !== controller.reader.chapter) {
        return null;
      }
      const text = currentChapterVerseTextMap.get(parsed.verse);
      if (typeof text !== "string") return null;
      const trimmed = text.trim();
      return trimmed ? trimmed : null;
    },
    [
      controller.reader.book,
      controller.reader.chapter,
      currentChapterVerseTextMap,
    ],
  );
  const getCachedVerseTextForReference = useCallback(
    async (reference: string | null): Promise<string | null> => {
      const localText = getLocalVerseTextForReference(reference);
      if (localText) return localText;
      if (!reference) return null;
      const parsed = parseReferenceWithVerse(reference);
      if (!parsed) return null;
      try {
        const bookData = await getBibleBook(parsed.book);
        const chapter = bookData.chapters.find(
          (entry) => entry.chapter === parsed.chapter,
        );
        if (!chapter) return null;
        const verse = chapter.verses.find(
          (entry) => entry.verse === parsed.verse,
        );
        if (!verse) return null;
        const trimmed = verse.text.trim();
        return trimmed ? trimmed : null;
      } catch {
        return null;
      }
    },
    [getLocalVerseTextForReference],
  );
  const activeReference = useMemo(
    () =>
      referenceStack.length > 0
        ? referenceStack[referenceStack.length - 1]
        : null,
    [referenceStack],
  );
  const activeReferenceParsed = useMemo(
    () => (activeReference ? parseReferenceWithVerse(activeReference) : null),
    [activeReference],
  );
  const canGoBackReference = referenceStack.length > 1;
  const activeReferenceNote = useMemo(
    () =>
      activeReference
        ? (controller.verseNotes[activeReference]?.text ?? "")
        : "",
    [activeReference, controller.verseNotes],
  );
  const groupedReferenceSections = useMemo(() => {
    if (!activeReferenceParsed)
      return [] as Array<{
        type: ReferenceGroup;
        refs: VerseCrossReferenceItem[];
      }>;
    const grouped: Record<ReferenceGroup, VerseCrossReferenceItem[]> = {
      parallel: [],
      prophecy: [],
      thematic: [],
    };
    referenceCrossReferences.forEach((ref) => {
      const type = classifyReferenceGroup(activeReferenceParsed.book, ref.book);
      grouped[type].push(ref);
    });
    const orderedTypes: ReferenceGroup[] = ["parallel", "prophecy", "thematic"];
    return orderedTypes
      .filter((type) => grouped[type].length > 0)
      .map((type) => ({
        type,
        refs: grouped[type],
      }));
  }, [activeReferenceParsed, referenceCrossReferences]);
  const totalReferenceCount = useMemo(
    () =>
      groupedReferenceSections.reduce(
        (total, section) => total + section.refs.length,
        0,
      ),
    [groupedReferenceSections],
  );
  const hasCollapsedReferenceRows = useMemo(
    () =>
      groupedReferenceSections.some(
        (section) => section.refs.length > INITIAL_REFERENCE_ROWS_PER_GROUP,
      ),
    [groupedReferenceSections],
  );
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
  const currentChapterBookmark = useMemo(
    () =>
      controller.bookmarks.find((item) => {
        const parsed = tryParseBookmarkReference(item.text);
        if (!parsed || parsed.verse !== undefined) return false;
        const canonicalBook = resolveBibleBookName(parsed.book);
        if (!canonicalBook) return false;
        return (
          canonicalBook.toLowerCase() ===
            controller.reader.book.toLowerCase() &&
          parsed.chapter === controller.reader.chapter
        );
      }) ?? null,
    [controller.bookmarks, controller.reader.book, controller.reader.chapter],
  );
  const sortedBookmarks = useMemo(
    () =>
      [...controller.bookmarks].sort((left, right) => {
        const leftTime = left.createdAt
          ? new Date(left.createdAt).getTime()
          : 0;
        const rightTime = right.createdAt
          ? new Date(right.createdAt).getTime()
          : 0;
        return rightTime - leftTime;
      }),
    [controller.bookmarks],
  );

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

  function runNavigationFocusPulse(verse: number, navigationKey?: string) {
    if (
      navigationKey &&
      navigationFocusKeyRef.current &&
      navigationKey !== navigationFocusKeyRef.current
    ) {
      return;
    }
    if (
      navigationKey &&
      navigationFocusHandledKeyRef.current === navigationKey
    ) {
      return;
    }
    if (navigationKey) {
      navigationFocusHandledKeyRef.current = navigationKey;
    }
    setFocusedNavigationVerse(verse);
    navigationFocusAnim.stopAnimation();
    navigationFocusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(navigationFocusAnim, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.delay(220),
      Animated.timing(navigationFocusAnim, {
        toValue: 0,
        duration: 560,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setFocusedNavigationVerse((current) =>
        current === verse ? null : current,
      );
    });
  }

  function scheduleNavigationFocusPulse(
    verse: number,
    navigationKey: string,
    delayMs = 120,
  ) {
    if (navigationFocusTimerRef.current) {
      clearTimeout(navigationFocusTimerRef.current);
      navigationFocusTimerRef.current = null;
    }
    navigationFocusTimerRef.current = setTimeout(() => {
      runNavigationFocusPulse(verse, navigationKey);
      navigationFocusTimerRef.current = null;
    }, delayMs);
  }

  function getCenteredVerseScrollY(verseOffset: number) {
    const viewport = readerViewportHeight > 0 ? readerViewportHeight : 0;
    const headerAllowance = headerVisible ? headerMeasuredHeight : 0;
    const centerOffset =
      viewport > 0 ? viewport * 0.5 - Math.max(0, headerAllowance * 0.18) : 280;
    const rawY = Math.max(0, verseOffset - centerOffset);
    if (viewport <= 0 || readerContentHeight <= 0) {
      return rawY;
    }
    const maxScrollableY = Math.max(0, readerContentHeight - viewport);
    return Math.min(rawY, maxScrollableY);
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

  function closeBookmarkSelector() {
    setBookmarkSelectorVisible(false);
  }

  async function handleOpenBookmarkSelector() {
    if (!controller.bookmarksLoadedAt && !controller.bookmarksLoading) {
      await controller.loadBookmarks();
    }
    setBookmarkSelectorVisible(true);
  }

  async function handleOpenBookmarkItem(reference: string) {
    const parsed = tryParseBookmarkReference(reference);
    if (!parsed) return;
    const canonicalBook = resolveBibleBookName(parsed.book);
    if (!canonicalBook) return;
    if (parsed.verse !== undefined) {
      controller.queueReaderFocusTarget(
        canonicalBook,
        parsed.chapter,
        parsed.verse,
      );
    }
    closeBookmarkSelector();
    scrollReaderToTop();
    await controller.navigateReaderTo(canonicalBook, parsed.chapter);
  }

  async function handleToggleCurrentChapterBookmark() {
    if (suppressBookmarkTogglePressRef.current) {
      suppressBookmarkTogglePressRef.current = false;
      return;
    }
    if (controller.bookmarkMutationBusy || controller.busy) return;
    triggerSelectionHaptic();
    if (currentChapterBookmark) {
      await controller.handleDeleteBookmark(currentChapterBookmark.id);
      return;
    }
    await controller.handleReaderBookmarkChapter();
  }

  function clearSelection() {
    selectionSynopsisAbortRef.current?.abort();
    selectionSynopsisAbortRef.current = null;
    setSelectionDraft(null);
    setSelectionModalVisible(false);
    setSelectionSynopsis(null);
    setSelectionSynopsisLoading(false);
    setSelectionSynopsisError(null);
    setSelectionView("synopsis");
    setSelectionNoteEditorVisible(false);
    setSelectionNoteDraft("");
    resetRootTranslation();
    lastVerseTapRef.current = null;
  }

  useEffect(() => {
    if (!selectionModalVisible) return;
    setSelectionNoteEditorVisible(false);
    setSelectionNoteDraft(selectedHighlightForSelection?.note ?? "");
  }, [selectedHighlightForSelection?.id, selectionModalVisible]);

  function scrollReaderToTop() {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    }, 40);
  }

  const registerVerseLayout = useCallback((verse: number, y: number) => {
    const normalizedY = Math.max(0, Math.round(y));
    const current = verseLayoutByNumberRef.current[verse];
    if (current === normalizedY) return;
    verseLayoutByNumberRef.current[verse] = normalizedY;
  }, []);

  useEffect(() => {
    if (!pendingVerseNavigation) return;
    let rafId: number | null = null;
    const target = pendingVerseNavigation;
    const resolveNavigation = () => {
      if (
        target.book.toLowerCase() !== controller.reader.book.toLowerCase() ||
        target.chapter !== controller.reader.chapter
      ) {
        rafId = globalThis.requestAnimationFrame(resolveNavigation);
        return;
      }
      if (controller.readerLoading) {
        rafId = globalThis.requestAnimationFrame(resolveNavigation);
        return;
      }

      const verseOffset = verseLayoutByNumberRef.current[target.verse];
      if (Number.isFinite(verseOffset)) {
        const nextY = getCenteredVerseScrollY(verseOffset);
        globalThis.requestAnimationFrame(() => {
          globalThis.requestAnimationFrame(() => {
            scrollViewRef.current?.scrollTo({ y: nextY, animated: true });
          });
        });
        scheduleNavigationFocusPulse(target.verse, target.key, 260);
        setPendingVerseNavigation((current) =>
          current?.key === target.key ? null : current,
        );
        return;
      }

      const elapsedMs = Date.now() - target.startedAt;
      if (elapsedMs >= 700) {
        const targetVerseIndex = controller.reader.verses.findIndex(
          (entry) => entry.verse === target.verse,
        );
        if (targetVerseIndex >= 0) {
          const denominator = Math.max(1, controller.reader.verses.length - 1);
          const ratio = targetVerseIndex / denominator;
          const approxVerseOffset = ratio * Math.max(0, readerContentHeight);
          const approxY = getCenteredVerseScrollY(approxVerseOffset);
          globalThis.requestAnimationFrame(() => {
            globalThis.requestAnimationFrame(() => {
              scrollViewRef.current?.scrollTo({ y: approxY, animated: true });
            });
          });
        }
        scheduleNavigationFocusPulse(target.verse, target.key, 320);
        setPendingVerseNavigation((current) =>
          current?.key === target.key ? null : current,
        );
        return;
      }

      rafId = globalThis.requestAnimationFrame(resolveNavigation);
    };

    rafId = globalThis.requestAnimationFrame(resolveNavigation);
    return () => {
      if (rafId !== null) {
        globalThis.cancelAnimationFrame(rafId);
      }
    };
  }, [
    controller.reader.book,
    controller.reader.chapter,
    controller.readerLoading,
    controller.reader.verses,
    getCenteredVerseScrollY,
    pendingVerseNavigation,
    readerContentHeight,
  ]);

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

  async function handleSwipeChapterChange(direction: "next" | "previous") {
    if (controller.readerLoading) return;
    if (direction === "next" && footerNextDisabled) return;
    if (direction === "previous" && footerPrevDisabled) return;

    const now = Date.now();
    if (chapterSwipeLockRef.current) return;
    if (now - chapterSwipeLastAtRef.current < CHAPTER_SWIPE_COOLDOWN_MS) {
      return;
    }

    chapterSwipeLockRef.current = true;
    chapterSwipeLastAtRef.current = now;
    triggerSelectionHaptic();
    try {
      if (direction === "next") {
        await handleGoToNextChapter();
      } else {
        await handleGoToPreviousChapter();
      }
    } finally {
      setTimeout(() => {
        chapterSwipeLockRef.current = false;
      }, 140);
    }
  }

  async function loadSelectionSynopsis(payload?: SelectionPayload) {
    const activePayload = payload ?? {
      text: selectedText,
      verses: selectedVerses,
    };
    if (!activePayload.text || activePayload.verses.length === 0) return;
    selectionSynopsisAbortRef.current?.abort();
    const controllerAbort = new globalThis.AbortController();
    selectionSynopsisAbortRef.current = controllerAbort;
    const requestId = (selectionSynopsisRequestIdRef.current += 1);
    setSelectionSynopsisLoading(true);
    setSelectionSynopsisError(null);
    setSelectionSynopsis(null);
    try {
      const result = await fetchSynopsis({
        apiBaseUrl: MOBILE_ENV.API_URL,
        text: activePayload.text,
        maxWords: 34,
        book: controller.reader.book,
        chapter: controller.reader.chapter,
        verses: activePayload.verses,
        signal: controllerAbort.signal,
        onSynopsis: (synopsis) => {
          if (
            controllerAbort.signal.aborted ||
            requestId !== selectionSynopsisRequestIdRef.current
          ) {
            return;
          }
          const trimmed = synopsis.trim();
          if (!trimmed) return;
          setSelectionSynopsis((current) => ({
            synopsis: trimmed,
            wordCount: trimmed.split(/\s+/).filter(Boolean).length,
            verse: current?.verse,
            verses: current?.verses,
          }));
        },
      });
      if (
        controllerAbort.signal.aborted ||
        requestId !== selectionSynopsisRequestIdRef.current
      ) {
        return;
      }
      setSelectionSynopsis(result);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      setSelectionSynopsisError("Could not load synopsis.");
      setSelectionSynopsis(null);
    } finally {
      if (requestId === selectionSynopsisRequestIdRef.current) {
        selectionSynopsisAbortRef.current = null;
        setSelectionSynopsisLoading(false);
      }
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

  function handleTraceSelection() {
    if (!selectedText || !selectedVerseLabel) return;
    const query = `${selectedVerseLabel} ${selectedText}`;
    nav.openMapViewer(selectedVerseLabel, undefined, query);
    clearSelection();
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

  async function handleSaveSelectionNote() {
    const payload = selectionDraft
      ? buildSelectionPayload(selectionDraft)
      : { text: selectedText, verses: selectedVerses };
    if (!payload.text || payload.verses.length === 0) return;

    payload.verses.forEach((verse) =>
      runHighlightFeedbackPulse(verse, controller.readerHighlightColor),
    );
    await controller.handleReaderHighlightNoteSelection(
      payload.verses,
      payload.text,
      selectionNoteDraft,
      controller.readerHighlightColor,
    );
    clearSelection();
  }

  function closeReferenceModal() {
    setReferenceModalVisible(false);
    setReferenceStack([]);
    setReferenceVerseText("");
    setReferenceVerseTextError(null);
    setReferenceCrossReferences([]);
    setReferenceCrossReferencesError(null);
    setReferenceActionError(null);
    setReferenceView("explore");
    setReferenceNoteEditorVisible(false);
    setReferenceNoteDraft("");
    setReferenceShowAllCrossReferences(false);
    resetReferenceRootTranslation();
  }

  function openReferenceModalForVerse(verse: number) {
    triggerSelectionHaptic();
    const nextReference = normalizeReferenceString(
      `${controller.reader.book} ${controller.reader.chapter}:${verse}`,
    );
    if (!nextReference) return;
    setReferenceModalVisible(true);
    setReferenceStack([nextReference]);
    setReferenceVerseText(currentChapterVerseTextMap.get(verse)?.trim() ?? "");
    setReferenceVerseTextError(null);
    setReferenceActionError(null);
    setReferenceView("explore");
    setReferenceNoteEditorVisible(false);
    setReferenceNoteDraft("");
    setReferenceShowAllCrossReferences(false);
    resetReferenceRootTranslation();
  }

  function pushReference(reference: string) {
    const normalized = normalizeReferenceString(reference);
    if (!normalized) return;
    setReferenceStack((current) => [...current, normalized]);
    setReferenceView("explore");
    setReferenceNoteEditorVisible(false);
    setReferenceNoteDraft("");
    setReferenceActionError(null);
    setReferenceShowAllCrossReferences(false);
    resetReferenceRootTranslation();
  }

  function popReference() {
    if (!canGoBackReference) return;
    setReferenceStack((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
    setReferenceView("explore");
    setReferenceNoteEditorVisible(false);
    setReferenceNoteDraft("");
    setReferenceActionError(null);
    setReferenceShowAllCrossReferences(false);
    resetReferenceRootTranslation();
  }

  async function handleViewReference() {
    if (!activeReferenceParsed) return;
    if (pendingVerseNavigation) return;
    const navigationKey = `${activeReferenceParsed.book}:${activeReferenceParsed.chapter}:${activeReferenceParsed.verse}:${Date.now()}`;
    if (navigationFocusTimerRef.current) {
      clearTimeout(navigationFocusTimerRef.current);
      navigationFocusTimerRef.current = null;
    }
    navigationFocusKeyRef.current = navigationKey;
    navigationFocusHandledKeyRef.current = null;
    setPendingVerseNavigation({
      ...activeReferenceParsed,
      key: navigationKey,
      startedAt: Date.now(),
    });
    closeReferenceModal();
    await controller.navigateReaderTo(
      activeReferenceParsed.book,
      activeReferenceParsed.chapter,
    );
  }

  function handleSaveReferenceNote() {
    if (!activeReference) return;
    void controller.saveVerseNote(activeReference, referenceNoteDraft);
    setReferenceNoteEditorVisible(false);
  }

  function handleTraceReference() {
    if (!activeReference) return;
    nav.openMapViewer(activeReference, undefined, activeReference);
    closeReferenceModal();
  }

  function handleGoDeeperReference() {
    if (!activeReference) return;
    const prompt: MobileGoDeeperPayload = {
      displayText: activeReference,
      prompt: `${activeReference}\n\nHelp me understand this passage.`,
      mode: "go_deeper_short",
    };
    nav.openChat(prompt, true);
    closeReferenceModal();
  }

  async function handleReferenceRootTranslation() {
    if (!activeReferenceParsed) return;
    const normalizedText = referenceVerseText.trim();
    if (!normalizedText) return;
    setReferenceView("root");
    await generateReferenceRootTranslation(normalizedText, {
      book: activeReferenceParsed.book,
      chapter: activeReferenceParsed.chapter,
      verse: activeReferenceParsed.verse,
    });
  }

  function handleBackToReferenceExplore() {
    resetReferenceRootTranslation();
    setReferenceView("explore");
  }

  useEffect(() => {
    if (!referenceModalVisible || !activeReference) return;
    const requestId = referenceRequestIdRef.current + 1;
    referenceRequestIdRef.current = requestId;
    const controllerAbort = new globalThis.AbortController();
    const loadStartedAt = Date.now();
    const localFallbackVerseText =
      getLocalVerseTextForReference(activeReference);

    setReferenceVerseTextLoading(true);
    setReferenceVerseTextError(null);
    setReferenceVerseText(localFallbackVerseText ?? "");
    setReferenceCrossReferencesLoading(true);
    setReferenceCrossReferencesError(null);
    setReferenceCrossReferences([]);
    setReferenceActionError(null);
    setReferenceView("explore");
    setReferenceNoteEditorVisible(false);
    setReferenceNoteDraft(activeReferenceNote);
    setReferenceShowAllCrossReferences(false);
    resetReferenceRootTranslation();

    void (async () => {
      const localText = await getCachedVerseTextForReference(activeReference);
      if (controllerAbort.signal.aborted) return;
      if (requestId !== referenceRequestIdRef.current) return;
      if (localText) {
        setReferenceVerseText(localText);
        setReferenceVerseTextError(null);
        setReferenceVerseTextLoading(false);
        return;
      }

      try {
        const result = await fetchVerseText({
          apiBaseUrl: MOBILE_ENV.API_URL,
          reference: activeReference,
        });
        if (requestId !== referenceRequestIdRef.current) return;
        const resolvedText =
          result.text?.trim() ||
          localFallbackVerseText ||
          "Could not load verse text";
        setReferenceVerseText(resolvedText);
        setReferenceVerseTextError(null);
      } catch (error) {
        if (controllerAbort.signal.aborted) return;
        if (requestId !== referenceRequestIdRef.current) return;
        const fallbackText = getLocalVerseTextForReference(activeReference);
        if (fallbackText) {
          setReferenceVerseText(fallbackText);
          setReferenceVerseTextError(
            getReferenceErrorMessage(error, "Could not load verse text."),
          );
          return;
        }
        setReferenceVerseText("Could not load verse text");
        setReferenceVerseTextError(
          getReferenceErrorMessage(error, "Could not load verse text."),
        );
      } finally {
        if (requestId === referenceRequestIdRef.current) {
          setReferenceVerseTextLoading(false);
        }
      }
    })();

    void fetchVerseCrossReferences({
      apiBaseUrl: MOBILE_ENV.API_URL,
      reference: activeReference,
    })
      .then(async (result) => {
        if (requestId !== referenceRequestIdRef.current) return;
        setReferenceCrossReferences(result.crossReferences);
        setReferenceCrossReferencesError(null);
      })
      .catch((_error) => {
        if (controllerAbort.signal.aborted) return;
        if (requestId !== referenceRequestIdRef.current) return;
        // Keep modal usable like web behavior: fall back to empty list.
        // Route-level diagnostics handle server investigation.
        setReferenceCrossReferencesError(null);
        setReferenceCrossReferences([]);
      })
      .finally(() => {
        if (requestId !== referenceRequestIdRef.current) return;
        void ensureMinLoaderDuration(
          loadStartedAt,
          MIN_REFERENCE_MODAL_LOADING_MS,
        ).then(() => {
          if (requestId !== referenceRequestIdRef.current) return;
          setReferenceCrossReferencesLoading(false);
        });
      });

    return () => {
      controllerAbort.abort();
    };
  }, [
    activeReference,
    activeReferenceNote,
    getCachedVerseTextForReference,
    getLocalVerseTextForReference,
    referenceModalVisible,
    resetReferenceRootTranslation,
  ]);

  const modalFeedbackLabel: string | null = null;

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
      bookmarkSelectorVisible ||
      chapterSelectorVisible ||
      selectionModalVisible ||
      referenceModalVisible
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

  const hasReaderContent = controller.reader.verses.length > 0;
  const showReaderSkeleton = controller.readerLoading && !hasReaderContent;
  const navigationFocusHighlight = navigationFocusAnim.interpolate({
    inputRange: [0, 0.35, 0.65, 1],
    outputRange: [
      "rgba(212, 175, 55, 0)",
      "rgba(212, 175, 55, 0.24)",
      "rgba(212, 175, 55, 0.24)",
      "rgba(212, 175, 55, 0)",
    ],
  });

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
            <IconButton
              accessibilityLabel="Open mode menu"
              motionPreset="quiet"
              onPress={nav.openModeMenu}
              icon={
                <Ionicons color={T.colors.textMuted} name="menu" size={18} />
              }
            />
            <IconButton
              accessibilityLabel="Previous chapter"
              disabled={controller.readerLoading}
              motionPreset="quiet"
              onPress={() => void handleGoToPreviousChapter()}
              icon={
                <Ionicons
                  color={
                    controller.readerLoading
                      ? "rgba(228, 228, 231, 0.36)"
                      : "rgba(228, 228, 231, 0.88)"
                  }
                  name="chevron-back"
                  size={18}
                />
              }
            />

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
                {controller.reader.book} {controller.reader.chapter}
              </Text>
            </PressableScale>

            <IconButton
              accessibilityLabel="Next chapter"
              disabled={controller.readerLoading}
              motionPreset="quiet"
              onPress={() => void handleGoToNextChapter()}
              icon={
                <Ionicons
                  color={
                    controller.readerLoading
                      ? "rgba(228, 228, 231, 0.36)"
                      : "rgba(228, 228, 231, 0.88)"
                  }
                  name="chevron-forward"
                  size={18}
                />
              }
            />
            <IconButton
              accessibilityLabel={
                currentChapterBookmark
                  ? `Remove bookmark for ${controller.reader.book} ${controller.reader.chapter}`
                  : `Save bookmark for ${controller.reader.book} ${controller.reader.chapter}`
              }
              disabled={controller.bookmarkMutationBusy || controller.busy}
              motionPreset="quiet"
              onLongPress={() => {
                suppressBookmarkTogglePressRef.current = true;
                void handleOpenBookmarkSelector();
              }}
              onPress={() => {
                void handleToggleCurrentChapterBookmark();
              }}
              tone={currentChapterBookmark ? "accent" : "default"}
              icon={
                <Ionicons
                  color={
                    controller.bookmarkMutationBusy
                      ? "rgba(228, 228, 231, 0.36)"
                      : currentChapterBookmark
                        ? T.colors.accentStrong
                        : "rgba(228, 228, 231, 0.88)"
                  }
                  name={
                    currentChapterBookmark ? "bookmark" : "bookmark-outline"
                  }
                  size={17}
                />
              }
            />
          </View>

          {selectionDraft ? (
            <View style={localStyles.selectionStatusRow}>
              <Text style={styles.caption} numberOfLines={1}>
                Selection: {selectedVerseLabel}
              </Text>
              <CompactButton
                label="Clear"
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

      <FlingGestureHandler
        direction={Directions.LEFT}
        onHandlerStateChange={({ nativeEvent }) => {
          if (nativeEvent.state !== State.ACTIVE) return;
          void handleSwipeChapterChange("next");
        }}
      >
        <FlingGestureHandler
          direction={Directions.RIGHT}
          onHandlerStateChange={({ nativeEvent }) => {
            if (nativeEvent.state !== State.ACTIVE) return;
            void handleSwipeChapterChange("previous");
          }}
        >
          <ScrollView
            ref={scrollViewRef}
            style={localStyles.readerScroll}
            contentContainerStyle={localStyles.readerContent}
            onLayout={(event) => {
              setReaderViewportHeight(
                Math.round(event.nativeEvent.layout.height),
              );
            }}
            onContentSizeChange={(_width, height) => {
              setReaderContentHeight(Math.round(height));
            }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(event) => {
              handleReaderScroll(event.nativeEvent.contentOffset.y);
            }}
          >
            <View style={localStyles.readingSurface}>
              {showReaderSkeleton ? <ReaderChapterSkeleton /> : null}

              {hasReaderContent ? (
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
                      const navigationFocused =
                        focusedNavigationVerse === item.verse;
                      const addFeedbackActive = feedbackVerse === item.verse;
                      const removePending = pendingRemovalVerseSet.has(
                        item.verse,
                      );
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
                              openReferenceModalForVerse(item.verse)
                            }
                            suppressHighlighting
                            style={localStyles.verseNumberInlineText}
                          >
                            {item.verse}
                          </Text>{" "}
                          <Animated.Text
                            onLongPress={handleVerseLongPress}
                            onLayout={(event) =>
                              registerVerseLayout(
                                item.verse,
                                event.nativeEvent.layout.y,
                              )
                            }
                            onPress={() =>
                              handleVerseTextPress(item.verse, item.text)
                            }
                            suppressHighlighting
                            style={[
                              markerVisible
                                ? localStyles.verseTextHighlighted
                                : null,
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
                              navigationFocused
                                ? [
                                    localStyles.inlineVerseNavigationFocus,
                                    {
                                      backgroundColor: navigationFocusHighlight,
                                    },
                                  ]
                                : null,
                            ]}
                          >
                            {item.text}
                          </Animated.Text>
                        </Text>
                      );
                    })}
                  </Text>
                </View>
              ) : null}

              <View style={localStyles.footerChapterNavRow}>
                <IconButton
                  accessibilityLabel="Previous chapter"
                  disabled={footerPrevDisabled || controller.readerLoading}
                  motionPreset="quiet"
                  onPress={() => void handleGoToPreviousChapter()}
                  icon={
                    <Ionicons
                      color={
                        footerPrevDisabled
                          ? "rgba(228, 228, 231, 0.36)"
                          : "rgba(228, 228, 231, 0.88)"
                      }
                      name="chevron-back"
                      size={18}
                    />
                  }
                />

                <View style={localStyles.footerChapterIndicator}>
                  <Text
                    style={localStyles.footerChapterIndicatorLabel}
                    numberOfLines={1}
                  >
                    {controller.reader.book} {controller.reader.chapter}
                  </Text>
                </View>

                <IconButton
                  accessibilityLabel="Next chapter"
                  disabled={footerNextDisabled || controller.readerLoading}
                  motionPreset="quiet"
                  onPress={() => void handleGoToNextChapter()}
                  icon={
                    <Ionicons
                      color={
                        footerNextDisabled
                          ? "rgba(228, 228, 231, 0.36)"
                          : "rgba(228, 228, 231, 0.88)"
                      }
                      name="chevron-forward"
                      size={18}
                    />
                  }
                />
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
        </FlingGestureHandler>
      </FlingGestureHandler>

      <BottomSheetSurface
        visible={referenceModalVisible}
        onClose={closeReferenceModal}
        title="Verse References"
        subtitle={activeReference ?? ""}
        snapPoints={referenceView === "root" ? ["78%"] : ["72%"]}
        enableDynamicSizing={false}
        headerRight={
          canGoBackReference ? (
            <ActionButton
              label="Back"
              variant="ghost"
              motionPreset="quiet"
              onPress={popReference}
            />
          ) : undefined
        }
      >
        {referenceView === "root" ? (
          <RootTranslationPanel
            isLoading={referenceRootLoading}
            language={referenceRootLanguage}
            words={referenceRootWords}
            lostContext={referenceRootLostContext}
            fallbackText={referenceRootFallbackText}
            selectedWordIndex={referenceRootWordIndex}
            onSelectWord={setReferenceRootWordIndex}
            onBack={handleBackToReferenceExplore}
          />
        ) : (
          <View style={localStyles.referenceModalCard}>
            {referenceActionError ? (
              <Text style={styles.error}>{referenceActionError}</Text>
            ) : null}

            <BottomSheetScrollView
              style={localStyles.modalContent}
              contentContainerStyle={localStyles.modalContentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <>
                <View
                  style={[
                    localStyles.modalPanel,
                    localStyles.referenceVersePanel,
                  ]}
                >
                  {referenceVerseTextLoading ? (
                    <View style={localStyles.referenceVerseSkeleton}>
                      <SkeletonBlock width={96} height={12} radius={6} />
                      <SkeletonTextLines
                        lines={["100%", "98%", "94%", "86%", "92%"]}
                        gap={10}
                      />
                    </View>
                  ) : null}
                  {referenceVerseTextError ? (
                    <Text style={styles.error}>{referenceVerseTextError}</Text>
                  ) : null}
                  {!referenceVerseTextLoading && referenceVerseText ? (
                    <Text style={localStyles.referenceVerseText}>
                      {referenceVerseText}
                    </Text>
                  ) : null}
                </View>

                <View style={localStyles.referencePrimaryActionRow}>
                  <CompactButton
                    label="Trace"
                    variant="primary"
                    onPress={() => handleTraceReference()}
                    style={localStyles.referenceActionButton}
                    labelStyle={localStyles.referenceActionButtonLabel}
                  />
                  <CompactButton
                    label="Go Deeper"
                    variant="ghost"
                    onPress={handleGoDeeperReference}
                    style={[
                      localStyles.compactHeaderAction,
                      localStyles.referenceActionButton,
                    ]}
                    labelStyle={[
                      localStyles.compactHeaderActionLabel,
                      localStyles.referenceActionButtonLabel,
                    ]}
                  />
                  <CompactButton
                    label="Open in Bible"
                    variant="ghost"
                    disabled={Boolean(pendingVerseNavigation)}
                    onPress={() => void handleViewReference()}
                    style={[
                      localStyles.compactHeaderAction,
                      localStyles.referenceActionButton,
                    ]}
                    labelStyle={[
                      localStyles.compactHeaderActionLabel,
                      localStyles.referenceActionButtonLabel,
                    ]}
                  />
                  <CompactButton
                    label={referenceRootLoading ? "ROOT..." : "ROOT"}
                    variant="ghost"
                    disabled={
                      referenceVerseTextLoading ||
                      referenceRootLoading ||
                      !referenceVerseText.trim()
                    }
                    onPress={() => void handleReferenceRootTranslation()}
                    style={[
                      localStyles.compactHeaderAction,
                      localStyles.referenceActionButton,
                    ]}
                    labelStyle={[
                      localStyles.compactHeaderActionLabel,
                      localStyles.referenceActionButtonLabel,
                      localStyles.rootActionLabel,
                    ]}
                  />
                </View>

                {referenceNoteEditorVisible ? (
                  <View style={localStyles.modalPanel}>
                    <TextInput
                      accessibilityLabel="Verse note"
                      multiline
                      placeholder="Write a note for this verse..."
                      placeholderTextColor={T.colors.textMuted}
                      style={localStyles.referenceNoteInput}
                      value={referenceNoteDraft}
                      onChangeText={setReferenceNoteDraft}
                    />
                    <View style={localStyles.referenceNoteActions}>
                      <CompactButton
                        label="Cancel"
                        variant="ghost"
                        onPress={() => {
                          setReferenceNoteEditorVisible(false);
                          setReferenceNoteDraft(activeReferenceNote);
                        }}
                        style={localStyles.compactHeaderAction}
                        labelStyle={localStyles.compactHeaderActionLabel}
                      />
                      <CompactButton
                        label="Save"
                        variant="primary"
                        onPress={handleSaveReferenceNote}
                        style={localStyles.compactHeaderAction}
                        labelStyle={localStyles.compactHeaderActionLabel}
                      />
                    </View>
                  </View>
                ) : null}

                <View
                  style={[
                    localStyles.referenceListSection,
                    localStyles.referenceListSectionStable,
                  ]}
                >
                  <View style={localStyles.referenceListHeaderRow}>
                    <Text style={localStyles.referenceListLabel}>
                      Cross-References
                    </Text>
                    <Text style={localStyles.referenceListCount}>
                      {totalReferenceCount}
                    </Text>
                  </View>
                  {totalReferenceCount > 0 ? (
                    <View style={localStyles.referenceDisclosureRow}>
                      {hasCollapsedReferenceRows ? (
                        <ChipButton
                          onPress={() =>
                            setReferenceShowAllCrossReferences(
                              (current) => !current,
                            )
                          }
                          selected={referenceShowAllCrossReferences}
                          accessibilityLabel={
                            referenceShowAllCrossReferences
                              ? "Show fewer references"
                              : "Show all references"
                          }
                          label={
                            referenceShowAllCrossReferences
                              ? "Show less"
                              : `Show all (${totalReferenceCount})`
                          }
                          style={localStyles.referenceDisclosureButton}
                          labelStyle={[
                            localStyles.referenceDisclosureLabel,
                            referenceShowAllCrossReferences
                              ? localStyles.referenceDisclosureLabelActive
                              : null,
                          ]}
                        />
                      ) : null}
                    </View>
                  ) : null}
                  {referenceCrossReferencesLoading ? (
                    <View style={localStyles.referenceListSkeleton}>
                      <SkeletonBlock width={112} height={12} radius={6} />
                      <SkeletonTextLines
                        lines={["100%", "92%", "96%", "88%"]}
                        gap={10}
                      />
                    </View>
                  ) : null}
                  {referenceCrossReferencesError ? (
                    <Text style={styles.error}>
                      {referenceCrossReferencesError}
                    </Text>
                  ) : null}
                  {!referenceCrossReferencesLoading &&
                  !referenceCrossReferencesError &&
                  groupedReferenceSections.length === 0 ? (
                    <Text style={localStyles.referenceEmptyLabel}>
                      No cross-references found.
                    </Text>
                  ) : null}
                  {!referenceCrossReferencesLoading &&
                    groupedReferenceSections.map((section) => (
                      <View
                        key={`reference-group-${section.type}`}
                        style={localStyles.referenceGroup}
                      >
                        {groupedReferenceSections.length > 1 ? (
                          <Text style={localStyles.referenceGroupLabel}>
                            {REFERENCE_GROUP_LABELS[section.type]}
                          </Text>
                        ) : null}
                        {(referenceShowAllCrossReferences
                          ? section.refs
                          : section.refs.slice(
                              0,
                              INITIAL_REFERENCE_ROWS_PER_GROUP,
                            )
                        ).map((ref, index) => {
                          const label = `${ref.book} ${ref.chapter}:${ref.verse}`;
                          return (
                            <PressableScale
                              key={`${section.type}-${label}-${index}`}
                              onPress={() => pushReference(label)}
                              motionPreset="quiet"
                              pressedStyle={
                                localStyles.referenceRowButtonPressed
                              }
                              style={localStyles.referenceRowButton}
                              accessibilityRole="button"
                              accessibilityLabel={`Open ${label}`}
                            >
                              <Text style={localStyles.referenceRowLabel}>
                                {label}
                              </Text>
                            </PressableScale>
                          );
                        })}
                        {!referenceShowAllCrossReferences &&
                        section.refs.length >
                          INITIAL_REFERENCE_ROWS_PER_GROUP ? (
                          <Text style={localStyles.referenceGroupMoreLabel}>
                            +
                            {section.refs.length -
                              INITIAL_REFERENCE_ROWS_PER_GROUP}{" "}
                            more
                          </Text>
                        ) : null}
                      </View>
                    ))}
                </View>
              </>
            </BottomSheetScrollView>
          </View>
        )}
      </BottomSheetSurface>

      <BottomSheetSurface
        visible={bookmarkSelectorVisible}
        onClose={closeBookmarkSelector}
        title="Bookmarks"
        subtitle="Tap to reopen a saved place in Reader."
        snapPoints={["60%"]}
        enableDynamicSizing={false}
      >
        <BottomSheetScrollView
          style={localStyles.selectorScroll}
          showsVerticalScrollIndicator={false}
        >
          {controller.bookmarksLoading ? (
            <LoadingDotsNative label="Loading bookmarks..." />
          ) : null}
          {!controller.bookmarksLoading && sortedBookmarks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No bookmarks yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap the bookmark icon in the header to save this chapter.
              </Text>
            </View>
          ) : null}
          {!controller.bookmarksLoading && sortedBookmarks.length > 0 ? (
            <View style={localStyles.selectorSection}>
              <Text style={localStyles.selectorSectionLabel}>Saved Places</Text>
              {sortedBookmarks.map((item) => {
                const isActive = item.id === currentChapterBookmark?.id;
                return (
                  <ListRowButton
                    key={item.id}
                    accessibilityLabel={`Open bookmark ${item.text}`}
                    motionPreset="quiet"
                    disabled={controller.readerLoading}
                    onPress={() => void handleOpenBookmarkItem(item.text)}
                    selected={isActive}
                    label={item.text}
                    meta={formatRelativeDate(item.createdAt)}
                    style={localStyles.selectorRowButton}
                    labelStyle={[
                      localStyles.selectorRowLabel,
                      isActive ? localStyles.selectorRowLabelActive : null,
                    ]}
                    metaStyle={localStyles.selectorRowMeta}
                  />
                );
              })}
            </View>
          ) : null}
          {!controller.bookmarksLoading && controller.bookmarksError ? (
            <Text style={styles.error}>{controller.bookmarksError}</Text>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetSurface>

      <BottomSheetSurface
        visible={bookSelectorVisible}
        onClose={() => setBookSelectorVisible(false)}
        title="Select Book"
        snapPoints={["74%"]}
        enableDynamicSizing={false}
      >
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          placeholder="Search books..."
          placeholderTextColor={T.colors.textMuted}
          style={localStyles.bookSearchInput}
          value={bookFilter}
          onChangeText={setBookFilter}
        />
        <BottomSheetScrollView
          style={localStyles.selectorScroll}
          showsVerticalScrollIndicator={false}
          contentOffset={bookFilter ? undefined : bookSelectorInitialOffset}
        >
          {filteredOldTestamentBooks.length > 0 ? (
            <View style={localStyles.selectorSection}>
              <Text style={localStyles.selectorSectionLabel}>
                Old Testament
              </Text>
              {filteredOldTestamentBooks.map((book) => (
                <ListRowButton
                  key={book}
                  accessibilityLabel={`Open ${book}`}
                  motionPreset="quiet"
                  disabled={controller.readerLoading}
                  onPress={() => void handleSelectBook(book)}
                  selected={book === controller.reader.book}
                  label={book}
                  meta={`Ch ${lastChapterByBook[book] ?? 1}`}
                  style={localStyles.selectorRowButton}
                  labelStyle={[
                    localStyles.selectorRowLabel,
                    book === controller.reader.book
                      ? localStyles.selectorRowLabelActive
                      : null,
                  ]}
                  metaStyle={localStyles.selectorRowMeta}
                />
              ))}
            </View>
          ) : null}
          {filteredNewTestamentBooks.length > 0 ? (
            <View style={localStyles.selectorSection}>
              <Text style={localStyles.selectorSectionLabel}>
                New Testament
              </Text>
              {filteredNewTestamentBooks.map((book) => (
                <ListRowButton
                  key={book}
                  accessibilityLabel={`Open ${book}`}
                  motionPreset="quiet"
                  disabled={controller.readerLoading}
                  onPress={() => void handleSelectBook(book)}
                  selected={book === controller.reader.book}
                  label={book}
                  meta={`Ch ${lastChapterByBook[book] ?? 1}`}
                  style={localStyles.selectorRowButton}
                  labelStyle={[
                    localStyles.selectorRowLabel,
                    book === controller.reader.book
                      ? localStyles.selectorRowLabelActive
                      : null,
                  ]}
                  metaStyle={localStyles.selectorRowMeta}
                />
              ))}
            </View>
          ) : null}
          {filteredBooks.length === 0 ? (
            <Text style={styles.caption}>No books match "{bookFilter}".</Text>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetSurface>

      <BottomSheetSurface
        visible={chapterSelectorVisible}
        onClose={closeChapterSelector}
        title="Select Chapter"
        subtitle={chapterSelectionBookName}
        snapPoints={["56%"]}
        enableDynamicSizing={false}
      >
        <BottomSheetScrollView
          style={localStyles.selectorScroll}
          showsVerticalScrollIndicator={false}
        >
          <View style={localStyles.chapterGrid}>
            {chapterOptions.map((chapter) => (
              <ChipButton
                key={`chapter-${chapter}`}
                accessibilityLabel={`Open chapter ${chapter}`}
                motionPreset="quiet"
                disabled={controller.readerLoading}
                onPress={() => void handleSelectChapter(chapter)}
                selected={chapter === suggestedChapterForSelectedBook}
                label={String(chapter)}
                style={localStyles.chapterChip}
                labelStyle={[
                  localStyles.chapterChipLabel,
                  chapter === suggestedChapterForSelectedBook
                    ? localStyles.chapterChipLabelActive
                    : null,
                ]}
              />
            ))}
          </View>
        </BottomSheetScrollView>
      </BottomSheetSurface>

      <BottomSheetSurface
        visible={selectionModalVisible && !selectionNoteEditorVisible}
        onClose={clearSelection}
        title="Selection tools"
        subtitle={selectedVerseLabel}
        snapPoints={selectionView === "root" ? ["78%"] : ["64%"]}
        enableDynamicSizing={false}
      >
        {selectionView === "root" ? (
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
        ) : (
          <View style={[localStyles.modalCard, localStyles.selectionModalCard]}>
            <BottomSheetScrollView
              style={localStyles.modalContent}
              contentContainerStyle={localStyles.modalContentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {modalFeedbackLabel ? (
                <Text style={localStyles.modalFeedbackText}>
                  {modalFeedbackLabel}
                </Text>
              ) : null}

              <>
                <View
                  style={[
                    localStyles.modalPanel,
                    localStyles.selectionSynopsisPanel,
                  ]}
                >
                  {selectionSynopsisLoading && !selectionSynopsis?.synopsis ? (
                    <View style={localStyles.selectionSynopsisSkeleton}>
                      <SkeletonBlock width={120} height={12} radius={6} />
                      <SkeletonTextLines
                        lines={["100%", "100%", "96%", "88%", "92%", "74%"]}
                        gap={10}
                      />
                    </View>
                  ) : null}
                  {selectionSynopsisError ? (
                    <Text style={styles.error}>{selectionSynopsisError}</Text>
                  ) : null}
                  {selectionSynopsis?.synopsis ? (
                    <View>
                      <Text style={styles.connectionSynopsis}>
                        {selectionSynopsis.synopsis}
                      </Text>
                      {selectionSynopsisLoading ? (
                        <Text
                          style={localStyles.selectionSynopsisStreamingLabel}
                        >
                          Finishing synopsis
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </View>

                <View style={localStyles.modalActionRow}>
                  <CompactButton
                    label="Trace"
                    variant="primary"
                    onPress={() => handleTraceSelection()}
                    style={localStyles.selectionActionButton}
                    labelStyle={localStyles.selectionActionButtonLabel}
                  />
                  <CompactButton
                    label="Go Deeper"
                    variant="ghost"
                    onPress={handleGoDeeperSelection}
                    style={[
                      localStyles.compactHeaderAction,
                      localStyles.selectionActionButton,
                    ]}
                    labelStyle={[
                      localStyles.compactHeaderActionLabel,
                      localStyles.selectionActionButtonLabel,
                    ]}
                  />
                  <CompactButton
                    label={rootLoading ? "ROOT..." : "ROOT"}
                    variant="ghost"
                    disabled={selectionSynopsisLoading || rootLoading}
                    onPress={() => void handleRootTranslation()}
                    style={[
                      localStyles.compactHeaderAction,
                      localStyles.selectionActionButton,
                    ]}
                    labelStyle={[
                      localStyles.compactHeaderActionLabel,
                      localStyles.selectionActionButtonLabel,
                      localStyles.rootActionLabel,
                    ]}
                  />
                  <CompactButton
                    label="Note"
                    variant="ghost"
                    disabled={
                      selectionSynopsisLoading ||
                      controller.highlightMutationBusy
                    }
                    onPress={() => setSelectionNoteEditorVisible(true)}
                    style={[
                      localStyles.compactHeaderAction,
                      localStyles.selectionActionButton,
                    ]}
                    labelStyle={[
                      localStyles.compactHeaderActionLabel,
                      localStyles.selectionActionButtonLabel,
                    ]}
                  />
                </View>
              </>
            </BottomSheetScrollView>
          </View>
        )}
      </BottomSheetSurface>

      <NoteEditorModal
        visible={selectionModalVisible && selectionNoteEditorVisible}
        title="Selection note"
        subtitle={selectedVerseLabel}
        value={selectionNoteDraft}
        onChangeText={setSelectionNoteDraft}
        onClose={() => {
          setSelectionNoteEditorVisible(false);
          setSelectionNoteDraft(selectedHighlightForSelection?.note ?? "");
        }}
        onSave={() => void handleSaveSelectionNote()}
        busy={controller.highlightMutationBusy}
        error={controller.highlightMutationError}
        placeholder="Write a note for this highlight..."
      />
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
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 5,
  },
  headerControlsTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    width: "100%",
  },
  headerMenuButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(24, 24, 27, 0.84)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerChapterNavButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(24, 24, 27, 0.84)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerBookmarkButtonActive: {
    borderColor: "rgba(212, 175, 55, 0.4)",
    backgroundColor: "rgba(212, 175, 55, 0.14)",
  },
  headerPickerButton: {
    minHeight: 38,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(24, 24, 27, 0.84)",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  headerBookPickerButton: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  headerPickerLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: T.colors.text,
    fontSize: 12.5,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  compactPrimaryButton: {
    flex: 0,
    minWidth: 0,
  },
  compactPrimaryButtonPressed: {
    backgroundColor: "rgba(252, 211, 77, 0.86)",
    borderColor: "rgba(252, 211, 77, 0.92)",
  },
  compactPrimaryButtonLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  compactHeaderAction: {
    flex: 0,
    minWidth: 0,
  },
  compactHeaderActionPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  compactHeaderActionLabel: {
    fontSize: 13,
    fontWeight: "700",
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
  inlineVerseNavigationFocus: {
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
  referenceModalCard: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.xs,
    gap: T.spacing.sm,
  },
  referenceVersePanel: {
    minHeight: 132,
    justifyContent: "center",
  },
  referenceVerseSkeleton: {
    gap: 14,
  },
  referenceVerseText: {
    color: T.colors.text,
    fontFamily: T.fonts.serif,
    fontSize: T.typography.body,
    lineHeight: 28,
  },
  referencePrimaryActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
    marginBottom: 6,
    width: "100%",
  },
  referenceActionButton: {
    flex: 1,
    minWidth: 0,
  },
  referenceActionButtonLabel: {
    textAlign: "center",
  },
  referenceSecondaryActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
    marginBottom: T.spacing.sm,
  },
  referenceNoteInput: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    color: T.colors.text,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: T.spacing.sm,
    textAlignVertical: "top",
    fontSize: T.typography.bodySm,
  },
  referenceNoteActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  referenceListSection: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    padding: T.spacing.sm,
    gap: 8,
    marginBottom: T.spacing.md,
  },
  referenceListSectionStable: {
    minHeight: 148,
  },
  referenceListSkeleton: {
    gap: 14,
  },
  referenceListHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  referenceListLabel: {
    color: T.colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  referenceListCount: {
    color: "rgba(212, 175, 55, 0.86)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  referenceActionActive: {
    borderColor: "rgba(212, 175, 55, 0.44)",
    backgroundColor: "rgba(212, 175, 55, 0.16)",
  },
  referenceActionActiveLabel: {
    color: T.colors.accentStrong,
    fontWeight: "700",
  },
  referenceDisclosureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  referenceDisclosureButton: {
    borderWidth: 1,
    borderColor: "rgba(212, 175, 55, 0.3)",
    borderRadius: T.radius.pill,
    backgroundColor: "rgba(212, 175, 55, 0.09)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  referenceDisclosureButtonPressed: {
    backgroundColor: "rgba(212, 175, 55, 0.18)",
    borderColor: "rgba(252, 211, 77, 0.44)",
  },
  referenceDisclosureButtonActive: {
    backgroundColor: "rgba(212, 175, 55, 0.18)",
    borderColor: "rgba(252, 211, 77, 0.48)",
  },
  referenceDisclosureLabel: {
    color: "rgba(252, 211, 77, 0.94)",
    fontSize: T.typography.caption,
    fontWeight: "700",
    letterSpacing: 0.45,
    textTransform: "uppercase",
  },
  referenceDisclosureLabelActive: {
    color: "#FDE68A",
  },
  referenceEmptyLabel: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
  },
  referenceGroup: {
    gap: 6,
  },
  referenceGroupLabel: {
    color: "rgba(212, 212, 216, 0.58)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    paddingHorizontal: 2,
  },
  referenceRowButton: {
    borderLeftWidth: 2,
    borderLeftColor: "rgba(212, 175, 55, 0.34)",
    borderRadius: T.radius.sm,
    backgroundColor: "rgba(255, 255, 255, 0.02)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  referenceRowButtonPressed: {
    backgroundColor: "rgba(212, 175, 55, 0.12)",
    borderLeftColor: "rgba(252, 211, 77, 0.58)",
  },
  referenceRowLabel: {
    color: "rgba(212, 175, 55, 0.96)",
    fontSize: 12,
    fontWeight: "700",
  },
  referenceGroupMoreLabel: {
    color: "rgba(212, 212, 216, 0.6)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    paddingHorizontal: 2,
    paddingTop: 2,
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
    flex: 1,
    minHeight: 0,
    paddingHorizontal: T.spacing.lg,
    paddingBottom: T.spacing.xs,
    gap: T.spacing.sm,
  },
  selectionModalCard: {},
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
    flex: 1,
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
    paddingHorizontal: T.spacing.md,
  },
  selectorRowButtonActive: {
    borderColor: T.colors.accent,
    backgroundColor: T.colors.accentSoft,
  },
  selectorRowLabel: {
    color: T.colors.text,
    fontSize: T.typography.bodySm,
    fontWeight: "700",
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
    minHeight: T.touchTarget.min,
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
    flex: 1,
    minHeight: 0,
  },
  modalContentContainer: {
    paddingBottom: T.spacing.xl,
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
  selectionSynopsisPanel: {
    minHeight: 132,
    justifyContent: "center",
  },
  selectionSynopsisSkeleton: {
    gap: 14,
  },
  selectionSynopsisStreamingLabel: {
    marginTop: T.spacing.xs,
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 0,
    marginBottom: T.spacing.sm,
    width: "100%",
  },
  selectionActionButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  selectionActionButtonLabel: {
    textAlign: "center",
    fontSize: 11,
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
