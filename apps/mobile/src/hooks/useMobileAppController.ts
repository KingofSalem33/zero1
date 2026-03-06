import { useEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  BIBLE_BOOKS,
  formatBookmarkReference,
  getBibleBookSuggestions,
  getBibleChapterCount,
  resolveBibleBookName,
} from "@zero1/shared";
import {
  fetchChapterFooter,
  createBookmark,
  createHighlightViaSync,
  createLibraryMap,
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

export interface LibraryMapDraftForm {
  bundleId: string;
  title: string;
}

export interface ReaderState {
  book: string;
  chapter: number;
  verses: BibleChapterVerse[];
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

function createDefaultBookmarkDraft(): BookmarkDraftForm {
  return {
    book: "Genesis",
    chapter: "1",
    verse: "1",
  };
}

function createDefaultLibraryMapDraft(): LibraryMapDraftForm {
  return {
    bundleId: "",
    title: "",
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
  libraryMapDraft: LibraryMapDraftForm;
  setLibraryMapDraft: (
    value:
      | LibraryMapDraftForm
      | ((current: LibraryMapDraftForm) => LibraryMapDraftForm),
  ) => void;
  libraryMapBundleSuggestions: string[];
  selectLibraryMapBundleSuggestion: (bundleId: string) => void;
  libraryMapMutationBusy: boolean;
  libraryMapMutationError: string | null;
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
  handleCreateLibraryMap: () => Promise<void>;
  handleDeleteLibraryMap: (id: string) => Promise<void>;
  navigateReaderTo: (book: string, chapter: number) => Promise<void>;
  goToPreviousReaderChapter: () => Promise<void>;
  goToNextReaderChapter: () => Promise<void>;
  selectReaderVerse: (verse: number) => Promise<void>;
  clearReaderVerseSelection: () => void;
  handleReaderBookmarkVerse: (verse: number) => Promise<void>;
  handleReaderHighlightVerse: (verse: number, text: string) => Promise<void>;
  handleReaderHighlightSelection: (
    verses: number[],
    text: string,
    color?: string,
  ) => Promise<void>;
  handleReaderRemoveHighlightSelection: (verses: number[]) => Promise<void>;
  handleCreateBookmark: () => Promise<void>;
  handleDeleteBookmark: (id: string) => Promise<void>;
  handleCreateHighlight: () => Promise<void>;
  handleSaveHighlightEdits: () => Promise<void>;
  handleDeleteHighlight: (id: string) => Promise<void>;
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
  const [libraryMapDraft, setLibraryMapDraft] = useState<LibraryMapDraftForm>(
    createDefaultLibraryMapDraft(),
  );
  const [libraryMapMutationBusy, setLibraryMapMutationBusy] = useState(false);
  const [libraryMapMutationError, setLibraryMapMutationError] = useState<
    string | null
  >(null);
  const [reader, setReader] = useState<ReaderState>(createDefaultReaderState());
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
    void AsyncStorage.setItem(
      READER_HIGHLIGHT_COLOR_STORAGE_KEY,
      readerHighlightColor,
    ).catch(() => {});
  }, [readerHighlightColor]);

  function setReaderHighlightColor(value: string) {
    if (!isReaderHighlightColor(value)) return;
    setReaderHighlightColorState(value);
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
  const libraryMapBundleSuggestions = useMemo(() => {
    const query = libraryMapDraft.bundleId.trim().toLowerCase();
    const candidates = Array.from(
      new Set(
        [
          ...libraryConnections.map((item) => item.bundleId),
          ...libraryMaps.map((item) => item.bundleId),
        ]
          .filter((value): value is string => Boolean(value && value.trim()))
          .map((value) => value.trim()),
      ),
    ).sort((a, b) => a.localeCompare(b));

    if (!query) {
      return candidates.slice(0, 6);
    }

    return candidates
      .filter((value) => value.toLowerCase().includes(query))
      .slice(0, 6);
  }, [libraryConnections, libraryMaps, libraryMapDraft.bundleId]);

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

  function selectLibraryMapBundleSuggestion(bundleId: string) {
    setLibraryMapDraft((current) => ({
      ...current,
      bundleId,
    }));
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
      setProbeResult(null);
      setProbeError(null);
      setLibraryConnections([]);
      setLibraryError(null);
      setLibraryLoadedAt(null);
      setLibraryMaps([]);
      setLibraryMapsError(null);
      setLibraryMapsLoadedAt(null);
      setLibraryMapDraft(createDefaultLibraryMapDraft());
      setLibraryMapMutationError(null);
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
      await supabase.auth.signOut();
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

    setReaderLoading(true);
    setReaderError(null);
    setReaderSelectedVerse(null);
    setReaderCrossReferences([]);
    setReaderCrossReferencesError(null);
    setReaderFooterLoading(true);
    setReaderFooterError(null);

    try {
      const [bookResult, footerResult] = await Promise.allSettled([
        getBibleBook(canonicalBook),
        fetchChapterFooter({
          apiBaseUrl: MOBILE_ENV.API_URL,
          book: canonicalBook,
          chapter: boundedChapter,
        }),
      ]);

      if (bookResult.status !== "fulfilled") {
        throw bookResult.reason;
      }

      const chapterData = bookResult.value.chapters.find(
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

      if (footerResult.status === "fulfilled") {
        setReaderFooter(footerResult.value);
        setReaderFooterError(null);
      } else {
        setReaderFooter(null);
        setReaderFooterError(
          footerResult.reason instanceof Error
            ? footerResult.reason.message
            : String(footerResult.reason),
        );
      }
    } catch (error) {
      setReaderError(error instanceof Error ? error.message : String(error));
      setReaderFooter(null);
    } finally {
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

  async function handleReaderBookmarkVerse(verse: number) {
    const canonicalBook = resolveBibleBookName(reader.book);
    if (!canonicalBook) {
      setBookmarkMutationError("Reader book could not be resolved.");
      return;
    }
    if (!Number.isInteger(verse) || verse <= 0) {
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
      const filteredHighlights = highlights.filter(
        (item) =>
          !(
            item.book.toLowerCase() === canonicalBook.toLowerCase() &&
            item.chapter === reader.chapter &&
            item.verses.some((verse) => selectedVerseSet.has(verse))
          ),
      );
      const nextHighlights = await withAccessToken((accessToken) =>
        createHighlightViaSync({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          currentHighlights: filteredHighlights,
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

  async function handleCreateLibraryMap() {
    const bundleId = libraryMapDraft.bundleId.trim();
    const title = libraryMapDraft.title.trim();

    if (!bundleId) {
      setLibraryMapMutationError("Bundle ID is required to create a map.");
      return;
    }

    setLibraryMapMutationBusy(true);
    setLibraryMapMutationError(null);
    try {
      const created = await withAccessToken((accessToken) =>
        createLibraryMap({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          payload: {
            bundleId,
            title: title.length > 0 ? title : undefined,
          },
        }),
      );
      setLibraryMaps((current) => [created, ...current]);
      setLibraryMapsLoadedAt(new Date().toISOString());
      setLibraryMapDraft((current) => ({
        ...current,
        title: "",
      }));
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

  async function handleDeleteBookmark(id: string) {
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
    } catch (error) {
      setBookmarkMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to delete bookmark.",
      );
    } finally {
      setBookmarkMutationBusy(false);
    }
  }

  async function handleCreateHighlight() {
    const verses = parseVersesInput(highlightCreateDraft.verses);
    const chapter = Number(highlightCreateDraft.chapter.trim());
    const text = highlightCreateDraft.text.trim();
    const book = highlightCreateDraft.book.trim();

    if (!book || !Number.isInteger(chapter) || chapter <= 0 || !text) {
      setHighlightMutationError(
        "Book, positive chapter, and highlight text are required.",
      );
      return;
    }
    if (verses.length === 0) {
      setHighlightMutationError("Enter at least one verse number.");
      return;
    }

    const nowIso = new Date().toISOString();
    const verseLabel =
      verses.length === 1 ? String(verses[0]) : `${verses[0]}-${verses.at(-1)}`;
    const newItem: MobileHighlightItem = {
      id: makeUuidLike(),
      book,
      chapter,
      verses,
      text,
      color: (highlightCreateDraft.color || "#facc15").trim(),
      note: highlightCreateDraft.note.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
      referenceLabel: `${book} ${chapter}:${verseLabel}`,
    };

    setHighlightMutationBusy(true);
    setHighlightMutationError(null);
    try {
      const selectedVerseSet = new Set(verses);
      const filteredHighlights = highlights.filter(
        (item) =>
          !(
            item.book.toLowerCase() === book.toLowerCase() &&
            item.chapter === chapter &&
            item.verses.some((verse) => selectedVerseSet.has(verse))
          ),
      );
      const nextHighlights = await withAccessToken((accessToken) =>
        createHighlightViaSync({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          currentHighlights: filteredHighlights,
          newHighlight: newItem,
        }),
      );
      setHighlights(nextHighlights);
      setHighlightsLoadedAt(new Date().toISOString());
      setSelectedHighlightId(newItem.id);
      setHighlightCreateDraft((current) => ({
        ...current,
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

  async function handleSaveHighlightEdits() {
    if (!selectedHighlight) {
      setHighlightMutationError("Select a highlight to edit.");
      return;
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
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to update highlight.",
      );
    } finally {
      setHighlightMutationBusy(false);
    }
  }

  async function handleDeleteHighlight(id: string) {
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
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
      );
      notify(
        "error",
        error instanceof Error ? error.message : "Failed to delete highlight.",
      );
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
    libraryMapDraft,
    setLibraryMapDraft,
    libraryMapBundleSuggestions,
    selectLibraryMapBundleSuggestion,
    libraryMapMutationBusy,
    libraryMapMutationError,
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
    handleCreateLibraryMap,
    handleDeleteLibraryMap,
    navigateReaderTo,
    goToPreviousReaderChapter,
    goToNextReaderChapter,
    selectReaderVerse,
    clearReaderVerseSelection,
    handleReaderBookmarkVerse,
    handleReaderHighlightVerse,
    handleReaderHighlightSelection,
    handleReaderRemoveHighlightSelection,
    handleCreateBookmark,
    handleDeleteBookmark,
    handleCreateHighlight,
    handleSaveHighlightEdits,
    handleDeleteHighlight,
  };
}
