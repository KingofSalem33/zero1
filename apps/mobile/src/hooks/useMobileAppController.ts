import { useEffect, useMemo, useRef, useState } from "react";
import { Linking } from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import {
  formatBookmarkReference,
  getBibleBookSuggestions,
  getBibleChapterCount,
  resolveBibleBookName,
} from "@zero1/shared";
import {
  createBookmark,
  createHighlightViaSync,
  deleteBookmark,
  deleteHighlight,
  fetchBookmarks,
  fetchHighlights,
  fetchLibraryConnections,
  fetchProtectedProbe,
  type LibraryConnectionItem,
  type MobileBookmarkItem,
  type MobileHighlightItem,
  type ProtectedProbeResult,
  updateHighlight,
} from "../lib/api";
import { MOBILE_ENV } from "../lib/env";
import {
  getOAuthRedirectUrl,
  handleSupabaseAuthRedirect,
} from "../lib/authRedirect";
import { supabase } from "../lib/supabase";

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

function parseVersesInput(value: string): number[] {
  const numbers = value
    .split(",")
    .map((segment) => Number(segment.trim()))
    .filter((entry) => Number.isInteger(entry) && entry > 0);
  return Array.from(new Set(numbers)).sort((a, b) => a - b);
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
  libraryLoading: boolean;
  libraryError: string | null;
  libraryLoadedAt: string | null;
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
  loadBookmarks: () => Promise<void>;
  loadHighlights: () => Promise<void>;
  refreshDashboard: () => Promise<void>;
  handleCreateBookmark: () => Promise<void>;
  handleDeleteBookmark: (id: string) => Promise<void>;
  handleCreateHighlight: () => Promise<void>;
  handleSaveHighlightEdits: () => Promise<void>;
  handleDeleteHighlight: (id: string) => Promise<void>;
}

export function useMobileAppController(): MobileAppController {
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
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoadedAt, setLibraryLoadedAt] = useState<string | null>(null);
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

  const selectedHighlight = useMemo(
    () => highlights.find((item) => item.id === selectedHighlightId) ?? null,
    [highlights, selectedHighlightId],
  );
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
      setAuthError(outcome.message);
      setAuthInfo(null);
      return;
    }

    const sessionUser = outcome.session?.user;
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

  async function withAccessToken<T>(
    fn: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();
    if (!currentSession?.access_token) {
      throw new Error("Sign in required before running this action.");
    }
    return fn(currentSession.access_token);
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
        setAuthInfo(`${provider} sign-in cancelled.`);
      } else {
        setAuthInfo(
          `${provider} sign-in returned: ${authSessionResult.type}. Waiting for callback...`,
        );
      }
    } catch (error) {
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
      loadBookmarks(),
      loadHighlights(),
    ]);
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
      setBookmarkDraft((current) => ({
        ...current,
        book: canonicalBook,
        verse: "",
      }));
      setSelectedBookmarkId(created.id);
      await runProbe();
    } catch (error) {
      setBookmarkMutationError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
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
      await runProbe();
    } catch (error) {
      setBookmarkMutationError(
        error instanceof Error ? error.message : String(error),
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
      const nextHighlights = await withAccessToken((accessToken) =>
        createHighlightViaSync({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          currentHighlights: highlights,
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
      await runProbe();
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
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
      await runProbe();
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
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
      await runProbe();
    } catch (error) {
      setHighlightMutationError(
        error instanceof Error ? error.message : String(error),
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
    libraryLoading,
    libraryError,
    libraryLoadedAt,
    bookmarks,
    bookmarksLoading,
    bookmarksError,
    bookmarksLoadedAt,
    bookmarkDraft,
    setBookmarkDraft,
    bookmarkBookSuggestions,
    bookmarkChapterHint,
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
    loadBookmarks,
    loadHighlights,
    refreshDashboard,
    handleCreateBookmark,
    handleDeleteBookmark,
    handleCreateHighlight,
    handleSaveHighlightEdits,
    handleDeleteHighlight,
  };
}
