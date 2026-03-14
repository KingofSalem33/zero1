import { useEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BIBLE_BOOKS,
  buildLibraryMapSession,
  formatBookmarkReference,
  getBibleBookSuggestions,
  getBibleChapterCount,
  resolveBibleBookName,
} from "@zero1/shared";
import {
  fetchChapterFooter,
  createBookmark,
  createLibraryConnection,
  createLibraryBundle,
  createHighlightViaSync,
  createLibraryMap,
  deleteLibraryConnection,
  deleteBookmark,
  deleteHighlight,
  deleteLibraryMap,
  fetchBookmarks,
  fetchHighlights,
  fetchLibraryConnections,
  fetchLibraryMaps,
  fetchProtectedProbe,
  fetchVerseCrossReferences,
  type ChapterFooterResult,
  type LibraryConnectionItem,
  type LibraryMapItem,
  type MobileBookmarkItem,
  type MobileHighlightItem,
  type ProtectedProbeResult,
  type VerseCrossReferenceItem,
  updateLibraryConnection,
  updateLibraryMap,
  updateHighlight,
} from "../lib/api";
import { getBibleBook, type BibleChapterVerse } from "../lib/bibleBookCache";
import { MOBILE_ENV } from "../lib/env";
import {
  DEFAULT_READER_HIGHLIGHT_COLOR,
  isReaderHighlightColor,
  READER_HIGHLIGHT_COLOR_STORAGE_KEY,
} from "../constants/highlightColors";
import {
  getOAuthRedirectUrl,
  handleSupabaseAuthRedirect,
} from "../lib/authRedirect";
import { supabase } from "../lib/supabase";
import { finishPerfSpan, startPerfSpan } from "../lib/perfTelemetry";
import {
  sanitizeVerseNoteMap,
  toVerseNoteItems,
  upsertVerseNote,
  VERSE_NOTES_STORAGE_KEY,
  type VerseNoteItem,
  type VerseNoteMap,
} from "../lib/verseNotes";

export interface HighlightDraftForm {
  book: string;
  chapter: string;
  verses: string;
  text: string;
  color: string;
  note: string;
}

export interface BookmarkDraftForm {
  book: string;
  chapter: string;
  verse: string;
}

export interface LibraryConnectionEditForm {
  note: string;
  tags: string;
}

export interface LibraryMapEditForm {
  title: string;
  note: string;
  tags: string;
}

export interface LibraryConnectionCreateForm {
  bundle: unknown;
  fromVerse: {
    id: number;
    reference: string;
    text: string;
  };
  toVerse: {
    id: number;
    reference: string;
    text: string;
  };
  connectionType: string;
  similarity: number;
  synopsis: string;
  explanation?: string;
  connectedVerseIds?: number[];
  connectedVerses?: Array<{
    id: number;
    reference: string;
    text: string;
  }>;
  goDeeperPrompt?: string;
}

export interface ReaderState {
  book: string;
  chapter: number;
  verses: BibleChapterVerse[];
}

export interface ReaderFocusTarget {
  book: string;
  chapter: number;
  verse: number;
  key: string;
  startedAt: number;
}

function parseVersesInput(value: string): number[] {
  const numbers = value
    .split(",")
    .map((segment) => Number(segment.trim()))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  return Array.from(new Set(numbers)).sort((a, b) => a - b);
}

function formatVerseRangeLabel(verses: number[]): string {
  const normalized = Array.from(new Set(verses))
    .filter((entry) => Number.isInteger(entry) && entry > 0)
    .sort((a, b) => a - b);
  if (normalized.length === 0) {
    return "";
  }
  if (normalized.length === 1) {
    return String(normalized[0]);
  }
  const contiguous = normalized.every(
    (entry, index) => index === 0 || entry === normalized[index - 1] + 1,
  );
  if (contiguous) {
    return `${normalized[0]}-${normalized[normalized.length - 1]}`;
  }
  return normalized.join(",");
}

function makeUuidLike(): string {
  const hex = "0123456789abcdef";
  const segment = (length: number) =>
    Array.from(
      { length },
      () => hex[Math.floor(Math.random() * hex.length)],
    ).join("");

  return `${segment(8)}-${segment(4)}-4${segment(3)}-a${segment(3)}-${segment(12)}`;
}

function trimHighlightOverlaps({
  highlights,
  book,
  chapter,
  selectedVerses,
  buildTextForVerses,
}: {
  highlights: MobileHighlightItem[];
  book: string;
  chapter: number;
  selectedVerses: Set<number>;
  buildTextForVerses?: (verses: number[]) => string;
}): MobileHighlightItem[] {
  const nowIso = new Date().toISOString();
  return highlights.flatMap((item) => {
    const sameLocation =
      item.book.toLowerCase() === book.toLowerCase() &&
      item.chapter === chapter;
    if (!sameLocation) return [item];

    const hasOverlap = item.verses.some((verse) => selectedVerses.has(verse));
    if (!hasOverlap) return [item];

    const remainingVerses = item.verses
      .filter((verse) => !selectedVerses.has(verse))
      .sort((a, b) => a - b);
    if (remainingVerses.length === 0) return [];

    const rebuiltText =
      buildTextForVerses?.(remainingVerses).trim() ?? item.text.trim();
    return [
      {
        ...item,
        verses: remainingVerses,
        text: rebuiltText.length > 0 ? rebuiltText : item.text,
        referenceLabel: `${item.book} ${item.chapter}:${formatVerseRangeLabel(remainingVerses)}`,
        updatedAt: nowIso,
      },
    ];
  });
}

function createDefaultBookmarkDraft(): BookmarkDraftForm {
  return {
    book: "Genesis",
    chapter: "1",
    verse: "1",
  };
}

function createDefaultReaderState(): ReaderState {
  return {
    book: "Matthew",
    chapter: 1,
    verses: [],
  };
}

export interface MobileAppController {
  session: Session | null;
  user: User | null;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  busy: boolean;
  authError: string | null;
  authInfo: string | null;
  probeResult: ProtectedProbeResult | null;
  probeError: string | null;
  libraryConnections: LibraryConnectionItem[];
  libraryMaps: LibraryMapItem[];
  libraryLoading: boolean;
  libraryMapsLoading: boolean;
  libraryError: string | null;
  libraryMapsError: string | null;
  libraryLoadedAt: string | null;
  libraryMapsLoadedAt: string | null;
  libraryMapMutationBusy: boolean;
  libraryMapMutationError: string | null;
  libraryConnectionMutationBusy: boolean;
  libraryConnectionMutationError: string | null;
  verseNotes: VerseNoteMap;
  verseNoteItems: VerseNoteItem[];
  saveVerseNote: (reference: string, text: string) => Promise<void>;
  reader: ReaderState;
  readerLoading: boolean;
  readerError: string | null;
  readerLoadedAt: string | null;
  readerSelectedVerse: number | null;
  readerCrossReferences: VerseCrossReferenceItem[];
  readerCrossReferencesLoading: boolean;
  readerCrossReferencesError: string | null;
  readerFooter: ChapterFooterResult | null;
  readerFooterLoading: boolean;
  readerFooterError: string | null;
  readerHighlightColor: string;
  setReaderHighlightColor: (value: string) => void;
  pendingReaderFocusTarget: ReaderFocusTarget | null;
  queueReaderFocusTarget: (
    book: string,
    chapter: number,
    verse: number,
  ) => void;
  clearPendingReaderFocusTarget: (key?: string) => void;
  bookmarks: MobileBookmarkItem[];
  bookmarksLoading: boolean;
  bookmarksError: string | null;
  bookmarksLoadedAt: string | null;
  bookmarkDraft: BookmarkDraftForm;
  setBookmarkDraft: (
    value:
      | BookmarkDraftForm
      | ((current: BookmarkDraftForm) => BookmarkDraftForm),
  ) => void;
  bookmarkBookSuggestions: string[];
  bookmarkChapterHint: string | null;
  bookmarkBookGuidance: string | null;
  selectBookmarkBookSuggestion: (book: string) => void;
  bookmarkMutationBusy: boolean;
  bookmarkMutationError: string | null;
  selectedBookmarkId: string | null;
  setSelectedBookmarkId: (value: string | null) => void;
  highlights: MobileHighlightItem[];
  highlightsLoading: boolean;
  highlightsError: string | null;
  highlightsLoadedAt: string | null;
  highlightMutationBusy: boolean;
  highlightMutationError: string | null;
  selectedHighlightId: string | null;
  setSelectedHighlightId: (value: string | null) => void;
  highlightEditColor: string;
  setHighlightEditColor: (value: string) => void;
  highlightEditNote: string;
  setHighlightEditNote: (value: string) => void;
  highlightCreateDraft: HighlightDraftForm;
  setHighlightCreateDraft: (
    value:
      | HighlightDraftForm
      | ((current: HighlightDraftForm) => HighlightDraftForm),
  ) => void;
  authLabel: string;
  selectedHighlight: MobileHighlightItem | null;
  signIn: () => Promise<void>;
  sendMagicLink: () => Promise<void>;
  startOAuth: (provider: "google" | "apple") => Promise<void>;
  signOut: () => Promise<void>;
  runProbe: () => Promise<void>;
  loadLibraryConnections: () => Promise<void>;
  loadLibraryMaps: () => Promise<void>;
  loadBookmarks: () => Promise<void>;
  loadHighlights: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  handleSaveLibraryMapFromBundle: (
    bundle: unknown,
    title?: string,
  ) => Promise<void>;
  handleSaveLibraryMapMeta: (
    id: string,
    updates: LibraryMapEditForm,
  ) => Promise<boolean>;
  handleDeleteLibraryMap: (id: string) => Promise<void>;
  handleSaveLibraryConnectionMeta: (
    id: string,
    updates: LibraryConnectionEditForm,
  ) => Promise<boolean>;
  handleCreateLibraryConnectionFromMap: (
    input: LibraryConnectionCreateForm,
  ) => Promise<void>;
  handleDeleteLibraryConnection: (id: string) => Promise<void>;
  navigateReaderTo: (book: string, chapter: number) => Promise<void>;
  goToPreviousReaderChapter: () => Promise<void>;
  goToNextReaderChapter: () => Promise<void>;
  selectReaderVerse: (verse: number) => Promise<void>;
  clearReaderVerseSelection: () => void;
  handleReaderBookmarkChapter: () => Promise<void>;
  handleReaderBookmarkVerse: (verse: number) => Promise<void>;
  handleReaderHighlightVerse: (verse: number, text: string) => Promise<void>;
  handleReaderHighlightSelection: (
    verses: number[],
    text: string,
    color?: string,
  ) => Promise<void>;
  handleReaderHighlightNoteSelection: (
    verses: number[],
    text: string,
    note: string,
    color?: string,
  ) => Promise<void>;
  handleReaderRemoveHighlightSelection: (verses: number[]) => Promise<void>;
  handleCreateBookmark: () => Promise<void>;
  handleDeleteBookmark: (id: string) => Promise<boolean>;
  handleCreateHighlight: () => Promise<void>;
  handleSaveHighlightEdits: () => Promise<boolean>;
  handleDeleteHighlight: (id: string) => Promise<boolean>;
}

interface UseMobileAppControllerOptions {
  onToast?: (toast: {
    tone: "success" | "error" | "info";
    title: string;
  }) => void;
}

export function useMobileAppController(
  options: UseMobileAppControllerOptions = {},
): MobileAppController {
  const { onToast } = options;
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<ProtectedProbeResult | null>(
    null,
  );
  const [probeError, setProbeError] = useState<string | null>(null);
  const [libraryConnections, setLibraryConnections] = useState<
    LibraryConnectionItem[]
  >([]);
  const [libraryMaps, setLibraryMaps] = useState<LibraryMapItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryMapsLoading, setLibraryMapsLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryMapsError, setLibraryMapsError] = useState<string | null>(null);
  const [libraryLoadedAt, setLibraryLoadedAt] = useState<string | null>(null);
  const [libraryMapsLoadedAt, setLibraryMapsLoadedAt] = useState<string | null>(
    null,
  );
  const [libraryMapMutationBusy, setLibraryMapMutationBusy] = useState(false);
  const [libraryMapMutationError, setLibraryMapMutationError] = useState<
    string | null
  >(null);
  const [libraryConnectionMutationBusy, setLibraryConnectionMutationBusy] =
    useState(false);
  const [libraryConnectionMutationError, setLibraryConnectionMutationError] =
    useState<string | null>(null);
  const [verseNotes, setVerseNotes] = useState<VerseNoteMap>({});
  const [reader, setReader] = useState<ReaderState>(createDefaultReaderState());
  const [pendingReaderFocusTarget, setPendingReaderFocusTarget] =
    useState<ReaderFocusTarget | null>(null);
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [readerLoadedAt, setReaderLoadedAt] = useState<string | null>(null);
  const [readerSelectedVerse, setReaderSelectedVerse] = useState<number | null>(
    null,
  );
  const [readerCrossReferences, setReaderCrossReferences] = useState<
    VerseCrossReferenceItem[]
  >([]);
  const [readerCrossReferencesLoading, setReaderCrossReferencesLoading] =
    useState(false);
  const [readerCrossReferencesError, setReaderCrossReferencesError] = useState<
    string | null
  >(null);
  const [readerFooter, setReaderFooter] = useState<ChapterFooterResult | null>(
    null,
  );
  const [readerFooterLoading, setReaderFooterLoading] = useState(false);
  const [readerFooterError, setReaderFooterError] = useState<string | null>(
    null,
  );
  const readerFooterCacheRef = useRef<Map<string, ChapterFooterResult>>(
    new Map(),
  );
  const readerFooterInflightRef = useRef<
    Map<string, Promise<ChapterFooterResult>>
  >(new Map());
  const readerNavigationRequestIdRef = useRef(0);
  const [readerHighlightColor, setReaderHighlightColorState] = useState<string>(
    DEFAULT_READER_HIGHLIGHT_COLOR,
  );
  const [bookmarks, setBookmarks] = useState<MobileBookmarkItem[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [bookmarksError, setBookmarksError] = useState<string | null>(null);
  const [bookmarksLoadedAt, setBookmarksLoadedAt] = useState<string | null>(
    null,
  );
  const [bookmarkDraft, setBookmarkDraft] = useState<BookmarkDraftForm>(
    createDefaultBookmarkDraft(),
  );
  const [bookmarkMutationBusy, setBookmarkMutationBusy] = useState(false);
  const [bookmarkMutationError, setBookmarkMutationError] = useState<
    string | null
  >(null);
  const [selectedBookmarkId, setSelectedBookmarkId] = useState<string | null>(
    null,
  );
  const [highlights, setHighlights] = useState<MobileHighlightItem[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsError, setHighlightsError] = useState<string | null>(null);
  const [highlightsLoadedAt, setHighlightsLoadedAt] = useState<string | null>(
    null,
  );
  const [highlightMutationBusy, setHighlightMutationBusy] = useState(false);
  const [highlightMutationError, setHighlightMutationError] = useState<
    string | null
  >(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState<string | null>(
    null,
  );
  const [highlightEditColor, setHighlightEditColor] = useState("#facc15");
  const [highlightEditNote, setHighlightEditNote] = useState("");
  const [highlightCreateDraft, setHighlightCreateDraft] =
    useState<HighlightDraftForm>({
      book: "Genesis",
      chapter: "1",
      verses: "1",
      text: "",
      color: "#facc15",
      note: "",
    });
  const processedAuthUrlsRef = useRef<Set<string>>(new Set());
  const oauthPerfSpanRef = useRef<string | null>(null);

  function notify(tone: "success" | "error" | "info", title: string) {
    onToast?.({ tone, title });
  }

  const selectedHighlight = useMemo(
    () => highlights.find((item) => item.id === selectedHighlightId) ?? null,
    [highlights, selectedHighlightId],
  );
  const verseNoteItems = useMemo(
    () => toVerseNoteItems(verseNotes),
    [verseNotes],
  );

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(READER_HIGHLIGHT_COLOR_STORAGE_KEY)
      .then((value) => {
        if (!active || !value) return;
        if (isReaderHighlightColor(value)) {
          setReaderHighlightColorState(value);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(VERSE_NOTES_STORAGE_KEY)
      .then((value) => {
        if (!active || !value) return;
        try {
          const parsed = JSON.parse(value) as unknown;
          setVerseNotes(sanitizeVerseNoteMap(parsed));
        } catch {
          setVerseNotes({});
        }
      })
      .catch(() => {
        if (!active) return;
        setVerseNotes({});
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.setItem(
      READER_HIGHLIGHT_COLOR_STORAGE_KEY,
      readerHighlightColor,
    ).catch(() => {});
  }, [readerHighlightColor]);

  function setReaderHighlightColor(value: string) {
    if (!isReaderHighlightColor(value)) return;
    setReaderHighlightColorState(value);
  }

  function queueReaderFocusTarget(
    book: string,
    chapter: number,
    verse: number,
  ) {
    if (!Number.isInteger(chapter) || chapter <= 0) return;
    if (!Number.isInteger(verse) || verse <= 0) return;
    const canonicalBook = resolveBibleBookName(book);
    if (!canonicalBook) return;
    setPendingReaderFocusTarget({
      book: canonicalBook,
      chapter,
      verse,
      key: `${canonicalBook}:${chapter}:${verse}:${Date.now()}`,
      startedAt: Date.now(),
    });
  }

  function clearPendingReaderFocusTarget(key?: string) {
    setPendingReaderFocusTarget((current) => {
      if (!current) return current;
      if (key && current.key !== key) return current;
      return null;
    });
  }

  async function saveVerseNote(reference: string, text: string) {
    setVerseNotes((current) => {
      const next = upsertVerseNote(current, reference, text);
      void AsyncStorage.setItem(
        VERSE_NOTES_STORAGE_KEY,
        JSON.stringify(next),
      ).catch(() => {});
      return next;
    });
  }
  const bookmarkBookSuggestions = useMemo(() => {
    const query = bookmarkDraft.book.trim();
    if (!query) {
      return [];
    }

    const suggestions = getBibleBookSuggestions(query, 6);
    if (
      suggestions.length === 1 &&
      suggestions[0].toLowerCase() === query.toLowerCase()
    ) {
      return [];
    }

    return suggestions;
  }, [bookmarkDraft.book]);
  const bookmarkChapterHint = useMemo(() => {
    const maxChapter = getBibleChapterCount(bookmarkDraft.book);
    return maxChapter ? `Chapters 1-${maxChapter}` : null;
  }, [bookmarkDraft.book]);
  const bookmarkBookGuidance = useMemo(() => {
    const query = bookmarkDraft.book.trim();
    if (!query) {
      return "Start typing a book name and choose from suggestions.";
    }

    const canonical = resolveBibleBookName(query);
    if (canonical) {
      return null;
    }

    if (bookmarkBookSuggestions.length > 1) {
      return `Multiple books match "${query}". Tap one below to avoid saving the wrong reference.`;
    }

    if (bookmarkBookSuggestions.length === 1) {
      return `Did you mean "${bookmarkBookSuggestions[0]}"? Tap to select.`;
    }

    return "Book name not recognized. Use a full canonical book name.";
  }, [bookmarkDraft.book, bookmarkBookSuggestions]);
  useEffect(() => {
    if (!selectedHighlight) return;
    setHighlightEditColor(selectedHighlight.color || "#facc15");
    setHighlightEditNote(selectedHighlight.note ?? "");
  }, [selectedHighlight?.id]);

  function selectBookmarkBookSuggestion(book: string) {
    const maxChapter = getBibleChapterCount(book);
    setBookmarkDraft((current) => {
      const currentChapter = Number(current.chapter.trim());
      const nextChapter =
        maxChapter &&
        Number.isInteger(currentChapter) &&
        currentChapter > maxChapter
          ? String(maxChapter)
          : current.chapter;
      return {
        ...current,
        book,
        chapter: nextChapter,
      };
    });
  }

  const authLabel = useMemo(() => {
    if (!user) return "Not signed in";
    return `Signed in as ${user.email ?? user.id}`;
  }, [user]);

  async function processAuthRedirect(
    url: string,
    source: "initial" | "event" | "authSession",
  ) {
    if (processedAuthUrlsRef.current.has(url)) return;
    processedAuthUrlsRef.current.add(url);

    const outcome = await handleSupabaseAuthRedirect(url);
    if (outcome.kind === "ignored") {
      setAuthInfo(`Ignored ${source} callback (not an auth redirect).`);
      return;
    }
    if (outcome.kind === "error") {
      finishPerfSpan(oauthPerfSpanRef.current, "error", {
        source,
        reason: outcome.message,
      });
      oauthPerfSpanRef.current = null;
      setAuthError(outcome.message);
      setAuthInfo(null);
      return;
    }

    const sessionUser = outcome.session?.user;
    finishPerfSpan(oauthPerfSpanRef.current, "success", {
      source,
      userId: sessionUser?.id ?? null,
      email: sessionUser?.email ?? null,
    });
    oauthPerfSpanRef.current = null;
    setAuthError(null);
    setAuthInfo(
      sessionUser
        ? `Auth callback (${source}) completed for ${sessionUser.email ?? sessionUser.id}.`
        : `Auth callback (${source}) completed.`,
    );
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void processAuthRedirect(url, "event");
    });

    void Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        void processAuthRedirect(initialUrl, "initial");
      }
    });

    return () => {
      subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      readerFooterCacheRef.current.clear();
      readerFooterInflightRef.current.clear();
      setProbeResult(null);
      setProbeError(null);
      setLibraryConnections([]);
      setLibraryError(null);
      setLibraryLoadedAt(null);
      setLibraryMaps([]);
      setLibraryMapsError(null);
      setLibraryMapsLoadedAt(null);
      setLibraryMapMutationError(null);
      setLibraryConnectionMutationError(null);
      setReader(createDefaultReaderState());
      setReaderError(null);
      setReaderLoadedAt(null);
      setReaderSelectedVerse(null);
      setReaderCrossReferences([]);
      setReaderCrossReferencesError(null);
      setReaderFooter(null);
      setReaderFooterError(null);
      setBookmarks([]);
      setBookmarksError(null);
      setBookmarksLoadedAt(null);
      setBookmarkDraft(createDefaultBookmarkDraft());
      setBookmarkMutationError(null);
      setSelectedBookmarkId(null);
      setHighlights([]);
      setHighlightsError(null);
      setHighlightsLoadedAt(null);
      setHighlightMutationError(null);
      setSelectedHighlightId(null);
      return;
    }

    void refreshDashboard();
  }, [user]);

  function isExpiredTokenError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);
    return (
      message.includes("api request failed (401)") ||
      message.includes("invalid or expired token") ||
      message.includes("jwt expired") ||
      message.includes("authentication required")
    );
  }

  async function resolveAccessToken(forceRefresh = false): Promise<string> {
    const { data } = forceRefresh
      ? await supabase.auth.refreshSession()
      : await supabase.auth.getSession();

    if (data.session?.access_token) {
      return data.session.access_token;
    }

    if (!forceRefresh) {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.data.session?.access_token) {
        return refreshed.data.session.access_token;
      }
    }

    throw new Error("Sign in required before running this action.");
  }

  async function withAccessToken<T>(
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const accessToken = await resolveAccessToken();
    try {
      return await fn(accessToken);
    } catch (error) {
      if (!isExpiredTokenError(error)) {
        throw error;
      }
      const refreshedAccessToken = await resolveAccessToken(true);
      return fn(refreshedAccessToken);
    }
  }

  async function signIn() {
    setBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    const emailAddress = email.trim();
    if (!emailAddress) {
      setAuthError("Email is required for magic link sign-in.");
      return;
    }
    setBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailAddress,
        options: { emailRedirectTo: getOAuthRedirectUrl() },
      });
      if (error) throw error;
      setAuthInfo("Magic link sent. Check your email.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function startOAuth(provider: "google" | "apple") {
    const providerEnabled =
      provider === "google"
        ? MOBILE_ENV.ENABLE_GOOGLE_OAUTH
        : MOBILE_ENV.ENABLE_APPLE_OAUTH;
    if (!providerEnabled) {
      setAuthError(
        `${provider} sign-in is disabled in this build. Enable EXPO_PUBLIC_ENABLE_${provider.toUpperCase()}_OAUTH=true after provider setup.`,
      );
      setAuthInfo(null);
      return;
    }

    setBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    finishPerfSpan(oauthPerfSpanRef.current, "cancelled", {
      reason: "replaced_by_new_oauth",
    });
    oauthPerfSpanRef.current = startPerfSpan("oauth_callback_latency", {
      provider,
    });
    try {
      const redirectTo = getOAuthRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data?.url) {
        throw new Error(
          `Supabase did not return an OAuth URL for ${provider}.`,
        );
      }

      setAuthInfo(`Opening ${provider} sign-in...`);
      const authSessionResult = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo,
      );

      if (authSessionResult.type === "success" && authSessionResult.url) {
        await processAuthRedirect(authSessionResult.url, "authSession");
      } else if (authSessionResult.type === "cancel") {
        finishPerfSpan(oauthPerfSpanRef.current, "cancelled", {
          provider,
          source: "authSession",
        });
        oauthPerfSpanRef.current = null;
        setAuthInfo(`${provider} sign-in cancelled.`);
      } else {
        setAuthInfo(
          `${provider} sign-in returned: ${authSessionResult.type}. Waiting for callback...`,
        );
      }
    } catch (error) {
      finishPerfSpan(oauthPerfSpanRef.current, "error", {
        provider,
        reason: error instanceof Error ? error.message : String(error),
      });
      oauthPerfSpanRef.current = null;
      setAuthError(error instanceof Error ? error.message : String(error));
      setAuthInfo(null);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function runProbe() {
    setBusy(true);
    setProbeError(null);
    try {
      const result = await withAccessToken((accessToken) =>
        fetchProtectedProbe({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
        }),
      );
      setProbeResult(result);
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadLibraryConnections() {
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const connections = await withAccessToken((accessToken) =>
        fetchLibraryConnections({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
        }),
      );
      setLibraryConnections(connections);
      setLibraryLoadedAt(new Date().toISOString());
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : String(error));
    } finally {
      setLibraryLoading(false);
    }
  }

  async function loadLibraryMaps() {
    setLibraryMapsLoading(true);
    setLibraryMapsError(null);
    try {
      const maps = await withAccessToken((accessToken) =>
        fetchLibraryMaps({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
        }),
      );
      setLibraryMaps(maps);
      setLibraryMapsLoadedAt(new Date().toISOString());
    } catch (error) {
      setLibraryMapsError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setLibraryMapsLoading(false);
    }
  }

  function getReaderFooterCacheKey(book: string, chapter: number): string {
    return `${book}:${chapter}`;
  }

  function fetchReaderFooterCached(
    book: string,
    chapter: number,
  ): Promise<ChapterFooterResult> {
    const cacheKey = getReaderFooterCacheKey(book, chapter);
    const cached = readerFooterCacheRef.current.get(cacheKey);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inflight = readerFooterInflightRef.current.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const request = fetchChapterFooter({
      apiBaseUrl: MOBILE_ENV.API_URL,
      book,
      chapter,
    })
      .then((footer) => {
        readerFooterCacheRef.current.set(cacheKey, footer);
        return footer;
      })
      .finally(() => {
        readerFooterInflightRef.current.delete(cacheKey);
      });

    readerFooterInflightRef.current.set(cacheKey, request);
    return request;
  }

  function prefetchAdjacentReaderFooters(book: string, chapter: number) {
    const maxChapter = getBibleChapterCount(book) ?? 1;
    const neighborChapters = [chapter - 1, chapter + 1].filter(
      (value) => value >= 1 && value <= maxChapter,
    );

    for (const neighborChapter of neighborChapters) {
      const cacheKey = getReaderFooterCacheKey(book, neighborChapter);
      if (readerFooterCacheRef.current.has(cacheKey)) {
        continue;
      }
      void fetchReaderFooterCached(book, neighborChapter).catch(() => {
        // Ignore prefetch failures; foreground navigation surfaces errors.
      });
    }
  }

  async function navigateReaderTo(rawBook: string, rawChapter: number) {
    const canonicalBook = resolveBibleBookName(rawBook);
    if (!canonicalBook) {
      setReaderError("Select a valid Bible book.");
      return;
    }

    if (!Number.isInteger(rawChapter) || rawChapter <= 0) {
      setReaderError("Chapter must be a positive whole number.");
      return;
    }

    const maxChapter = getBibleChapterCount(canonicalBook) ?? 1;
    const boundedChapter = Math.min(Math.max(rawChapter, 1), maxChapter);
    const footerCacheKey = getReaderFooterCacheKey(
      canonicalBook,
      boundedChapter,
    );
    const cachedFooter =
      readerFooterCacheRef.current.get(footerCacheKey) ?? null;
    const isSameChapter =
      reader.book === canonicalBook &&
      reader.chapter === boundedChapter &&
      reader.verses.length > 0;

    setReaderError(null);
    setReaderSelectedVerse(null);
    setReaderCrossReferences([]);
    setReaderCrossReferencesError(null);
    setReaderFooter(cachedFooter);
    setReaderFooterError(null);
    if (isSameChapter) {
      setReaderLoading(false);
      if (cachedFooter) {
        setReaderFooterLoading(false);
        return;
      }

      setReaderFooterLoading(true);
      void fetchReaderFooterCached(canonicalBook, boundedChapter)
        .then((footer) => {
          setReaderFooter(footer);
          readerFooterCacheRef.current.set(footerCacheKey, footer);
          setReaderFooterError(null);
        })
        .catch((error) => {
          setReaderFooter(null);
          setReaderFooterError(
            error instanceof Error ? error.message : String(error),
          );
        })
        .finally(() => {
          setReaderFooterLoading(false);
        });
      return;
    }

    const requestId = readerNavigationRequestIdRef.current + 1;
    readerNavigationRequestIdRef.current = requestId;

    setReaderLoading(true);
    setReaderFooterLoading(!cachedFooter);

    const footerPromise = cachedFooter
      ? Promise.resolve(cachedFooter)
      : fetchReaderFooterCached(canonicalBook, boundedChapter);

    try {
      const bookResult = await getBibleBook(canonicalBook);
      if (requestId !== readerNavigationRequestIdRef.current) {
        return;
      }

      const chapterData = bookResult.chapters.find(
        (entry) => entry.chapter === boundedChapter,
      );

      if (!chapterData) {
        throw new Error(
          `${canonicalBook} chapter ${boundedChapter} could not be loaded.`,
        );
      }

      setReader({
        book: canonicalBook,
        chapter: boundedChapter,
        verses: chapterData.verses,
      });
      setReaderLoadedAt(new Date().toISOString());
      setReaderLoading(false);
      prefetchAdjacentReaderFooters(canonicalBook, boundedChapter);

      void footerPromise
        .then((footer) => {
          if (requestId !== readerNavigationRequestIdRef.current) {
            return;
          }
          setReaderFooter(footer);
          readerFooterCacheRef.current.set(footerCacheKey, footer);
          setReaderFooterError(null);
        })
        .catch((error) => {
          if (requestId !== readerNavigationRequestIdRef.current) {
            return;
          }
          setReaderFooter(null);
          setReaderFooterError(
            error instanceof Error ? error.message : String(error),
          );
        })
        .finally(() => {
          if (requestId !== readerNavigationRequestIdRef.current) {
            return;
          }
          setReaderFooterLoading(false);
        });
    } catch (error) {
      if (requestId !== readerNavigationRequestIdRef.current) {
        return;
      }
      setReaderError(error instanceof Error ? error.message : String(error));
      setReaderFooter(null);
      setReaderLoading(false);
      setReaderFooterLoading(false);
    }
  }

  async function goToPreviousReaderChapter() {
    const currentBookIndex = BIBLE_BOOKS.indexOf(
      reader.book as (typeof BIBLE_BOOKS)[number],
    );
    if (currentBookIndex < 0) {
      return;
    }

    if (reader.chapter > 1) {
      await navigateReaderTo(reader.book, reader.chapter - 1);
      return;
    }

    if (currentBookIndex === 0) {
      return;
    }

    const previousBook = BIBLE_BOOKS[currentBookIndex - 1];
    const previousBookChapterCount = getBibleChapterCount(previousBook) ?? 1;
    await navigateReaderTo(previousBook, previousBookChapterCount);
  }

  async function goToNextReaderChapter() {
    const currentBookIndex = BIBLE_BOOKS.indexOf(
      reader.book as (typeof BIBLE_BOOKS)[number],
    );
    if (currentBookIndex < 0) {
      return;
    }

    const currentBookChapterCount = getBibleChapterCount(reader.book) ?? 1;
    if (reader.chapter < currentBookChapterCount) {
      await navigateReaderTo(reader.book, reader.chapter + 1);
      return;
    }

    if (currentBookIndex >= BIBLE_BOOKS.length - 1) {
      return;
    }

    const nextBook = BIBLE_BOOKS[currentBookIndex + 1];
    await navigateReaderTo(nextBook, 1);
  }

  async function selectReaderVerse(verse: number) {
    if (!Number.isInteger(verse) || verse <= 0) {
      setReaderCrossReferencesError("Verse must be a positive whole number.");
      return;
    }

    setReaderSelectedVerse(verse);
    setReaderCrossReferencesLoading(true);
    setReaderCrossReferencesError(null);

    try {
      const reference = `${reader.book} ${reader.chapter}:${verse}`;
      const result = await fetchVerseCrossReferences({
        apiBaseUrl: MOBILE_ENV.API_URL,
        reference,
      });
      setReaderCrossReferences(result.crossReferences);
    } catch (error) {
      setReaderCrossReferencesError(
        error instanceof Error ? error.message : String(error),
      );
      setReaderCrossReferences([]);
    } finally {
      setReaderCrossReferencesLoading(false);
    }
  }

  function clearReaderVerseSelection() {
    setReaderSelectedVerse(null);
    setReaderCrossReferences([]);
    setReaderCrossReferencesError(null);
  }

  async function saveReaderBookmark(verse?: number) {
    const canonicalBook = resolveBibleBookName(reader.book);
    if (!canonicalBook) {
      setBookmarkMutationError("Reader book could not be resolved.");
      return;
    }
    if (
      verse !== undefined &&
      (!Number.isInteger(verse) || Number.isNaN(verse) || verse <= 0)
    ) {
      setBookmarkMutationError("Verse must be a positive whole number.");
      return;
    }

    const normalizedText = formatBookmarkReference({
      book: canonicalBook,
      chapter: reader.chapter,
      verse,
    });

    setBookmarkMutationBusy(true);
    setBookmarkMutationError(null);
    try {
      const created = await withAccessToken((accessToken) =>
        createBookmark({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          text: normalizedText,
        }),
      );
      setBookmarks((current) => [created, ...current]);
      setBookmarksLoadedAt(new Date().toISOString());
      setSelectedBookmarkId(created.id);
      notify("success", "Bookmark saved.");
    } catch (error) {
      setBookmarkMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to save bookmark.",
      );
    } finally {
      setBookmarkMutationBusy(false);
    }
  }

  async function handleReaderBookmarkChapter() {
    await saveReaderBookmark();
  }

  async function handleReaderBookmarkVerse(verse: number) {
    await saveReaderBookmark(verse);
  }

  async function handleReaderHighlightSelection(
    verses: number[],
    text: string,
    color = readerHighlightColor,
  ) {
    const trimmedText = text.trim();
    const canonicalBook = resolveBibleBookName(reader.book);
    const normalizedVerses = Array.from(new Set(verses))
      .filter((entry) => Number.isInteger(entry) && entry > 0)
      .sort((a, b) => a - b);

    if (!canonicalBook) {
      setHighlightMutationError("Reader book could not be resolved.");
      return;
    }
    if (normalizedVerses.length === 0) {
      setHighlightMutationError("Select at least one verse.");
      return;
    }
    if (!trimmedText) {
      setHighlightMutationError("Highlight text is required.");
      return;
    }

    const nowIso = new Date().toISOString();
    const verseLabel = formatVerseRangeLabel(normalizedVerses);
    const selectedVerseSet = new Set(normalizedVerses);
    const textByVerse = new Map(
      reader.verses.map((entry) => [entry.verse, entry.text]),
    );
    const newItem: MobileHighlightItem = {
      id: makeUuidLike(),
      book: canonicalBook,
      chapter: reader.chapter,
      verses: normalizedVerses,
      text: trimmedText,
      color: color.trim() || "#facc15",
      note: undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
      referenceLabel: `${canonicalBook} ${reader.chapter}:${verseLabel}`,
    };

    setHighlightMutationBusy(true);
    setHighlightMutationError(null);
    try {
      const adjustedHighlights = trimHighlightOverlaps({
        highlights,
        book: canonicalBook,
        chapter: reader.chapter,
        selectedVerses: selectedVerseSet,
        buildTextForVerses: (verses) =>
          verses
            .map((verse) => `${verse}. ${textByVerse.get(verse) ?? ""}`.trim())
            .join(" ")
            .trim(),
      });
      const nextHighlights = await withAccessToken((accessToken) =>
        createHighlightViaSync({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          currentHighlights: adjustedHighlights,
          newHighlight: newItem,
        }),
      );
      setHighlights(nextHighlights);
      setHighlightsLoadedAt(new Date().toISOString());
      setSelectedHighlightId(newItem.id);
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setHighlightMutationBusy(false);
    }
  }

  async function handleReaderRemoveHighlightSelection(verses: number[]) {
    const canonicalBook = resolveBibleBookName(reader.book);
    const normalizedVerses = Array.from(new Set(verses))
      .filter((entry) => Number.isInteger(entry) && entry > 0)
      .sort((a, b) => a - b);

    if (!canonicalBook) {
      setHighlightMutationError("Reader book could not be resolved.");
      return;
    }
    if (normalizedVerses.length === 0) {
      setHighlightMutationError("Select at least one verse.");
      return;
    }

    const selectedVerseSet = new Set(normalizedVerses);
    const matchingHighlights = highlights.filter(
      (item) =>
        item.book.toLowerCase() === canonicalBook.toLowerCase() &&
        item.chapter === reader.chapter &&
        item.verses.some((verse) => selectedVerseSet.has(verse)),
    );

    if (matchingHighlights.length === 0) {
      return;
    }

    const textByVerse = new Map(
      reader.verses.map((entry) => [entry.verse, entry.text]),
    );
    const deletedIds = new Set<string>();
    const updatedById = new Map<string, MobileHighlightItem>();

    setHighlightMutationBusy(true);
    setHighlightMutationError(null);
    try {
      await withAccessToken(async (accessToken) => {
        for (const item of matchingHighlights) {
          const remainingVerses = item.verses
            .filter((verse) => !selectedVerseSet.has(verse))
            .sort((a, b) => a - b);

          if (remainingVerses.length === 0) {
            await deleteHighlight({
              apiBaseUrl: MOBILE_ENV.API_URL,
              accessToken,
              id: item.id,
            });
            deletedIds.add(item.id);
            continue;
          }

          const rebuiltText = remainingVerses
            .map((verse) => `${verse}. ${textByVerse.get(verse) ?? ""}`.trim())
            .join(" ")
            .trim();
          const updated = await updateHighlight({
            apiBaseUrl: MOBILE_ENV.API_URL,
            accessToken,
            id: item.id,
            updates: {
              verses: remainingVerses,
              text: rebuiltText.length > 0 ? rebuiltText : item.text,
            },
          });
          updatedById.set(item.id, {
            ...updated,
            referenceLabel: `${canonicalBook} ${reader.chapter}:${formatVerseRangeLabel(remainingVerses)}`,
          });
        }
      });

      setHighlights((current) =>
        current
          .filter((item) => !deletedIds.has(item.id))
          .map((item) => updatedById.get(item.id) ?? item),
      );
      setSelectedHighlightId((current) =>
        current && deletedIds.has(current) ? null : current,
      );
      setHighlightsLoadedAt(new Date().toISOString());
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setHighlightMutationBusy(false);
    }
  }

  async function handleReaderHighlightVerse(verse: number, text: string) {
    await handleReaderHighlightSelection([verse], text, readerHighlightColor);
  }

  async function loadBookmarks() {
    setBookmarksLoading(true);
    setBookmarksError(null);
    try {
      const items = await withAccessToken((accessToken) =>
        fetchBookmarks({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
        }),
      );
      setBookmarks(items);
      setBookmarksLoadedAt(new Date().toISOString());
    } catch (error) {
      setBookmarksError(error instanceof Error ? error.message : String(error));
    } finally {
      setBookmarksLoading(false);
    }
  }

  async function loadHighlights() {
    setHighlightsLoading(true);
    setHighlightsError(null);
    try {
      const items = await withAccessToken((accessToken) =>
        fetchHighlights({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
        }),
      );
      setHighlights(items);
      setHighlightsLoadedAt(new Date().toISOString());
    } catch (error) {
      setHighlightsError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setHighlightsLoading(false);
    }
  }

  async function refreshDashboard() {
    await Promise.all([
      runProbe(),
      loadLibraryConnections(),
      loadLibraryMaps(),
      loadBookmarks(),
      loadHighlights(),
      navigateReaderTo(reader.book, reader.chapter),
    ]);
  }

  async function handleSaveLibraryMapFromBundle(
    bundle: unknown,
    title?: string,
  ) {
    const normalizedTitle = title?.trim() ?? "";

    setLibraryMapMutationBusy(true);
    setLibraryMapMutationError(null);
    try {
      const bundleResult = await withAccessToken((accessToken) =>
        createLibraryBundle({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          bundle,
        }),
      );
      const created = await withAccessToken((accessToken) =>
        createLibraryMap({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          payload: {
            bundleId: bundleResult.bundleId,
            title: normalizedTitle.length > 0 ? normalizedTitle : undefined,
          },
        }),
      );
      setLibraryMaps((current) => {
        const existingIndex = current.findIndex(
          (item) => item.id === created.id,
        );
        if (existingIndex < 0) {
          return [created, ...current];
        }
        const next = [...current];
        next[existingIndex] = created;
        return next;
      });
      setLibraryMapsLoadedAt(new Date().toISOString());
      notify("success", "Map saved.");
    } catch (error) {
      setLibraryMapMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to save map.",
      );
    } finally {
      setLibraryMapMutationBusy(false);
    }
  }

  async function handleReaderHighlightNoteSelection(
    verses: number[],
    text: string,
    note: string,
    color = readerHighlightColor,
  ) {
    const trimmedText = text.trim();
    const trimmedNote = note.trim();
    const canonicalBook = resolveBibleBookName(reader.book);
    const normalizedVerses = Array.from(new Set(verses))
      .filter((entry) => Number.isInteger(entry) && entry > 0)
      .sort((a, b) => a - b);

    if (!canonicalBook) {
      setHighlightMutationError("Reader book could not be resolved.");
      return;
    }
    if (normalizedVerses.length === 0) {
      setHighlightMutationError("Select at least one verse.");
      return;
    }
    if (!trimmedText) {
      setHighlightMutationError("Highlight text is required.");
      return;
    }
    if (!trimmedNote) {
      setHighlightMutationError("Note is required.");
      return;
    }

    const selectedVerseSet = new Set(normalizedVerses);
    const exactMatch = highlights.find(
      (item) =>
        item.book.toLowerCase() === canonicalBook.toLowerCase() &&
        item.chapter === reader.chapter &&
        item.verses.length === normalizedVerses.length &&
        item.verses.every((verse) => selectedVerseSet.has(verse)),
    );

    setHighlightMutationBusy(true);
    setHighlightMutationError(null);
    try {
      if (exactMatch) {
        const updated = await withAccessToken((accessToken) =>
          updateHighlight({
            apiBaseUrl: MOBILE_ENV.API_URL,
            accessToken,
            id: exactMatch.id,
            updates: {
              note: trimmedNote,
            },
          }),
        );
        setHighlights((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        setSelectedHighlightId(updated.id);
        setHighlightsLoadedAt(new Date().toISOString());
        notify("success", "Highlight note saved.");
        return;
      }

      const nowIso = new Date().toISOString();
      const verseLabel = formatVerseRangeLabel(normalizedVerses);
      const textByVerse = new Map(
        reader.verses.map((entry) => [entry.verse, entry.text]),
      );
      const newItem: MobileHighlightItem = {
        id: makeUuidLike(),
        book: canonicalBook,
        chapter: reader.chapter,
        verses: normalizedVerses,
        text: trimmedText,
        color: color.trim() || "#facc15",
        note: trimmedNote,
        createdAt: nowIso,
        updatedAt: nowIso,
        referenceLabel: `${canonicalBook} ${reader.chapter}:${verseLabel}`,
      };

      const adjustedHighlights = trimHighlightOverlaps({
        highlights,
        book: canonicalBook,
        chapter: reader.chapter,
        selectedVerses: selectedVerseSet,
        buildTextForVerses: (remainingVerses) =>
          remainingVerses
            .map((verse) => `${verse}. ${textByVerse.get(verse) ?? ""}`.trim())
            .join(" ")
            .trim(),
      });
      const nextHighlights = await withAccessToken((accessToken) =>
        createHighlightViaSync({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          currentHighlights: adjustedHighlights,
          newHighlight: newItem,
        }),
      );
      setHighlights(nextHighlights);
      setSelectedHighlightId(newItem.id);
      setHighlightsLoadedAt(new Date().toISOString());
      notify("success", "Highlight note saved.");
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to save highlight note.",
      );
    } finally {
      setHighlightMutationBusy(false);
    }
  }

  async function handleSaveLibraryMapMeta(
    id: string,
    updates: LibraryMapEditForm,
  ): Promise<boolean> {
    const title = updates.title.trim();
    const note = updates.note.trim();
    const tags = updates.tags
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    setLibraryMapMutationBusy(true);
    setLibraryMapMutationError(null);
    try {
      const updated = await withAccessToken((accessToken) =>
        updateLibraryMap({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          id,
          payload: {
            title: title.length > 0 ? title : undefined,
            note: note.length > 0 ? note : undefined,
            tags,
          },
        }),
      );
      setLibraryMaps((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setLibraryMapsLoadedAt(new Date().toISOString());
      notify("success", "Map updated.");
      return true;
    } catch (error) {
      setLibraryMapMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to update map.",
      );
      return false;
    } finally {
      setLibraryMapMutationBusy(false);
    }
  }

  async function handleDeleteLibraryMap(id: string) {
    setLibraryMapMutationBusy(true);
    setLibraryMapMutationError(null);
    try {
      await withAccessToken((accessToken) =>
        deleteLibraryMap({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          id,
        }),
      );
      setLibraryMaps((current) => current.filter((item) => item.id !== id));
      setLibraryMapsLoadedAt(new Date().toISOString());
      notify("success", "Map deleted.");
    } catch (error) {
      setLibraryMapMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to delete map.",
      );
    } finally {
      setLibraryMapMutationBusy(false);
    }
  }

  async function handleSaveLibraryConnectionMeta(
    id: string,
    updates: LibraryConnectionEditForm,
  ): Promise<boolean> {
    const note = updates.note.trim();
    const tags = updates.tags
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    setLibraryConnectionMutationBusy(true);
    setLibraryConnectionMutationError(null);
    try {
      const updated = await withAccessToken((accessToken) =>
        updateLibraryConnection({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          id,
          payload: {
            note: note.length > 0 ? note : undefined,
            tags,
          },
        }),
      );
      setLibraryConnections((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setLibraryLoadedAt(new Date().toISOString());
      notify("success", "Connection updated.");
      return true;
    } catch (error) {
      setLibraryConnectionMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to update connection.",
      );
      return false;
    } finally {
      setLibraryConnectionMutationBusy(false);
    }
  }

  async function handleCreateLibraryConnectionFromMap(
    input: LibraryConnectionCreateForm,
  ) {
    const synopsis = input.synopsis.trim();
    const explanation = input.explanation?.trim();
    const goDeeperPrompt =
      input.goDeeperPrompt?.trim() ||
      `Trace the connection between ${input.fromVerse.reference} and ${input.toVerse.reference}. Explain why this ${input.connectionType.toLowerCase()} relationship matters.`;
    const connectedVerseIds = Array.from(
      new Set(
        (input.connectedVerseIds || [])
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry) && entry > 0),
      ),
    );
    const fallbackConnectedVerses = [input.fromVerse, input.toVerse];
    const connectedVerses =
      input.connectedVerses && input.connectedVerses.length > 0
        ? input.connectedVerses
        : fallbackConnectedVerses;

    if (!synopsis) {
      setLibraryConnectionMutationError("Connection synopsis is required.");
      return;
    }

    setLibraryConnectionMutationBusy(true);
    setLibraryConnectionMutationError(null);
    try {
      const bundleResult = await withAccessToken((accessToken) =>
        createLibraryBundle({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          bundle: input.bundle,
        }),
      );
      const created = await withAccessToken((accessToken) =>
        createLibraryConnection({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          payload: {
            bundleId: bundleResult.bundleId,
            fromVerse: input.fromVerse,
            toVerse: input.toVerse,
            connectionType: input.connectionType,
            similarity: input.similarity,
            synopsis,
            ...(explanation ? { explanation } : {}),
            ...(connectedVerseIds.length > 0 ? { connectedVerseIds } : {}),
            ...(connectedVerses.length > 0 ? { connectedVerses } : {}),
            goDeeperPrompt,
            mapSession: buildLibraryMapSession({
              fromId: input.fromVerse.id,
              toId: input.toVerse.id,
              connectionType: input.connectionType,
              verseIds:
                connectedVerseIds.length > 0
                  ? connectedVerseIds
                  : [input.fromVerse.id, input.toVerse.id],
            }),
          },
        }),
      );
      setLibraryConnections((current) => {
        const existingIndex = current.findIndex(
          (item) => item.id === created.id,
        );
        if (existingIndex < 0) {
          return [created, ...current];
        }
        const next = [...current];
        next[existingIndex] = created;
        return next;
      });
      setLibraryLoadedAt(new Date().toISOString());
      notify("success", "Connection saved.");
    } catch (error) {
      setLibraryConnectionMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to save connection.",
      );
    } finally {
      setLibraryConnectionMutationBusy(false);
    }
  }

  async function handleDeleteLibraryConnection(id: string) {
    setLibraryConnectionMutationBusy(true);
    setLibraryConnectionMutationError(null);
    try {
      await withAccessToken((accessToken) =>
        deleteLibraryConnection({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          id,
        }),
      );
      setLibraryConnections((current) =>
        current.filter((item) => item.id !== id),
      );
      setLibraryLoadedAt(new Date().toISOString());
      notify("success", "Connection deleted.");
    } catch (error) {
      setLibraryConnectionMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to delete connection.",
      );
    } finally {
      setLibraryConnectionMutationBusy(false);
    }
  }

  async function handleCreateBookmark() {
    const book = bookmarkDraft.book.trim();
    const canonicalBook = resolveBibleBookName(book);
    const chapter = Number(bookmarkDraft.chapter.trim());
    const verseText = bookmarkDraft.verse.trim();
    const verse = verseText.length > 0 ? Number(verseText) : undefined;

    if (!canonicalBook) {
      setBookmarkMutationError("Select a valid Bible book.");
      return;
    }
    if (!Number.isInteger(chapter) || chapter <= 0) {
      setBookmarkMutationError("Chapter must be a positive whole number.");
      return;
    }

    const maxChapter = getBibleChapterCount(canonicalBook);
    if (maxChapter && chapter > maxChapter) {
      setBookmarkMutationError(
        `${canonicalBook} has ${maxChapter} chapters. Enter 1-${maxChapter}.`,
      );
      return;
    }
    if (
      verse !== undefined &&
      (!Number.isInteger(verse) || Number.isNaN(verse) || verse <= 0)
    ) {
      setBookmarkMutationError("Verse must be a positive whole number.");
      return;
    }

    const normalizedText = formatBookmarkReference({
      book: canonicalBook,
      chapter,
      verse,
    });

    const bookmarkSaveSpanId = startPerfSpan("bookmark_save_latency", {
      book: canonicalBook,
      chapter,
      hasVerse: verse !== undefined,
    });
    let bookmarkSaveStatus: "success" | "error" = "error";
    let createdBookmarkId: string | null = null;

    setBookmarkMutationBusy(true);
    setBookmarkMutationError(null);
    try {
      const created = await withAccessToken((accessToken) =>
        createBookmark({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          text: normalizedText,
        }),
      );
      createdBookmarkId = created.id;
      bookmarkSaveStatus = "success";
      setBookmarks((current) => [created, ...current]);
      setBookmarksLoadedAt(new Date().toISOString());
      setBookmarkDraft((current) => ({
        ...current,
        book: canonicalBook,
        verse: "",
      }));
      setSelectedBookmarkId(created.id);
      notify("success", "Bookmark saved.");
    } catch (error) {
      setBookmarkMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to save bookmark.",
      );
    } finally {
      finishPerfSpan(bookmarkSaveSpanId, bookmarkSaveStatus, {
        bookmarkId: createdBookmarkId,
      });
      setBookmarkMutationBusy(false);
    }
  }

  async function handleDeleteBookmark(id: string): Promise<boolean> {
    setBookmarkMutationBusy(true);
    setBookmarkMutationError(null);
    try {
      await withAccessToken((accessToken) =>
        deleteBookmark({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          id,
        }),
      );
      setBookmarks((current) => current.filter((item) => item.id !== id));
      setSelectedBookmarkId((current) => (current === id ? null : current));
      setBookmarksLoadedAt(new Date().toISOString());
      notify("success", "Bookmark deleted.");
      return true;
    } catch (error) {
      setBookmarkMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to delete bookmark.",
      );
      return false;
    } finally {
      setBookmarkMutationBusy(false);
    }
  }

  async function handleCreateHighlight() {
    const verses = parseVersesInput(highlightCreateDraft.verses);
    const chapter = Number(highlightCreateDraft.chapter.trim());
    const text = highlightCreateDraft.text.trim();
    const book = highlightCreateDraft.book.trim();
    const canonicalBook = resolveBibleBookName(book);

    if (!canonicalBook || !Number.isInteger(chapter) || chapter <= 0 || !text) {
      setHighlightMutationError(
        "Valid book, positive chapter, and highlight text are required.",
      );
      return;
    }
    if (verses.length === 0) {
      setHighlightMutationError("Enter at least one verse number.");
      return;
    }
    const maxChapter = getBibleChapterCount(canonicalBook);
    if (maxChapter && chapter > maxChapter) {
      setHighlightMutationError(
        `${canonicalBook} has ${maxChapter} chapters. Enter 1-${maxChapter}.`,
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const verseLabel =
      verses.length === 1 ? String(verses[0]) : `${verses[0]}-${verses.at(-1)}`;
    const newItem: MobileHighlightItem = {
      id: makeUuidLike(),
      book: canonicalBook,
      chapter,
      verses,
      text,
      color: (highlightCreateDraft.color || "#facc15").trim(),
      note: highlightCreateDraft.note.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
      referenceLabel: `${canonicalBook} ${chapter}:${verseLabel}`,
    };

    setHighlightMutationBusy(true);
    setHighlightMutationError(null);
    try {
      const selectedVerseSet = new Set(verses);
      const adjustedHighlights = trimHighlightOverlaps({
        highlights,
        book: canonicalBook,
        chapter,
        selectedVerses: selectedVerseSet,
      });
      const nextHighlights = await withAccessToken((accessToken) =>
        createHighlightViaSync({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          currentHighlights: adjustedHighlights,
          newHighlight: newItem,
        }),
      );
      setHighlights(nextHighlights);
      setHighlightsLoadedAt(new Date().toISOString());
      setSelectedHighlightId(newItem.id);
      setHighlightCreateDraft((current) => ({
        ...current,
        book: canonicalBook,
        text: "",
        note: "",
      }));
      notify("success", "Highlight saved.");
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to save highlight.",
      );
    } finally {
      setHighlightMutationBusy(false);
    }
  }

  async function handleSaveHighlightEdits(): Promise<boolean> {
    if (!selectedHighlight) {
      setHighlightMutationError("Select a highlight to edit.");
      return false;
    }

    setHighlightMutationBusy(true);
    setHighlightMutationError(null);
    try {
      const updated = await withAccessToken((accessToken) =>
        updateHighlight({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          id: selectedHighlight.id,
          updates: {
            color: highlightEditColor.trim() || selectedHighlight.color,
            note: highlightEditNote.trim() || null,
          },
        }),
      );

      setHighlights((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setHighlightsLoadedAt(new Date().toISOString());
      notify("success", "Highlight updated.");
      return true;
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to update highlight.",
      );
      return false;
    } finally {
      setHighlightMutationBusy(false);
    }
  }

  async function handleDeleteHighlight(id: string): Promise<boolean> {
    setHighlightMutationBusy(true);
    setHighlightMutationError(null);
    try {
      await withAccessToken((accessToken) =>
        deleteHighlight({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          id,
        }),
      );
      setHighlights((current) => current.filter((item) => item.id !== id));
      setSelectedHighlightId((current) => (current === id ? null : current));
      setHighlightsLoadedAt(new Date().toISOString());
      notify("success", "Highlight deleted.");
      return true;
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to delete highlight.",
      );
      return false;
    } finally {
      setHighlightMutationBusy(false);
    }
  }

  return {
    session,
    user,
    email,
    setEmail,
    password,
    setPassword,
    busy,
    authError,
    authInfo,
    probeResult,
    probeError,
    libraryConnections,
    libraryMaps,
    libraryLoading,
    libraryMapsLoading,
    libraryError,
    libraryMapsError,
    libraryLoadedAt,
    libraryMapsLoadedAt,
    libraryMapMutationBusy,
    libraryMapMutationError,
    libraryConnectionMutationBusy,
    libraryConnectionMutationError,
    verseNotes,
    verseNoteItems,
    saveVerseNote,
    reader,
    readerLoading,
    readerError,
    readerLoadedAt,
    readerSelectedVerse,
    readerCrossReferences,
    readerCrossReferencesLoading,
    readerCrossReferencesError,
    readerFooter,
    readerFooterLoading,
    readerFooterError,
    readerHighlightColor,
    setReaderHighlightColor,
    pendingReaderFocusTarget,
    queueReaderFocusTarget,
    clearPendingReaderFocusTarget,
    bookmarks,
    bookmarksLoading,
    bookmarksError,
    bookmarksLoadedAt,
    bookmarkDraft,
    setBookmarkDraft,
    bookmarkBookSuggestions,
    bookmarkChapterHint,
    bookmarkBookGuidance,
    selectBookmarkBookSuggestion,
    bookmarkMutationBusy,
    bookmarkMutationError,
    selectedBookmarkId,
    setSelectedBookmarkId,
    highlights,
    highlightsLoading,
    highlightsError,
    highlightsLoadedAt,
    highlightMutationBusy,
    highlightMutationError,
    selectedHighlightId,
    setSelectedHighlightId,
    highlightEditColor,
    setHighlightEditColor,
    highlightEditNote,
    setHighlightEditNote,
    highlightCreateDraft,
    setHighlightCreateDraft,
    authLabel,
    selectedHighlight,
    signIn,
    sendMagicLink,
    startOAuth,
    signOut,
    runProbe,
    loadLibraryConnections,
    loadLibraryMaps,
    loadBookmarks,
    loadHighlights,
    refreshDashboard,
    handleSaveLibraryMapFromBundle,
    handleSaveLibraryMapMeta,
    handleDeleteLibraryMap,
    handleSaveLibraryConnectionMeta,
    handleCreateLibraryConnectionFromMap,
    handleDeleteLibraryConnection,
    navigateReaderTo,
    goToPreviousReaderChapter,
    goToNextReaderChapter,
    selectReaderVerse,
    clearReaderVerseSelection,
    handleReaderBookmarkChapter,
    handleReaderBookmarkVerse,
    handleReaderHighlightVerse,
    handleReaderHighlightSelection,
    handleReaderHighlightNoteSelection,
    handleReaderRemoveHighlightSelection,
    handleCreateBookmark,
    handleDeleteBookmark,
    handleCreateHighlight,
    handleSaveHighlightEdits,
    handleDeleteHighlight,
  };
}
