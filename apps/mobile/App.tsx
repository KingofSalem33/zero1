import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Session, User } from "@supabase/supabase-js";
import { MOBILE_ENV } from "./src/lib/env";
import {
  fetchBookmarks,
  createBookmark,
  deleteBookmark,
  fetchHighlights,
  createHighlightViaSync,
  deleteHighlight,
  fetchLibraryConnections,
  type MobileBookmarkItem,
  type MobileHighlightItem,
  fetchProtectedProbe,
  updateHighlight,
  type LibraryConnectionItem,
  type ProtectedProbeResult,
} from "./src/lib/api";
import {
  getOAuthRedirectUrl,
  handleSupabaseAuthRedirect,
} from "./src/lib/authRedirect";
import { MobileRootNavigator } from "./src/navigation/MobileRootNavigator";
import { supabase } from "./src/lib/supabase";
import { MOBILE_TOKENS } from "./src/theme/tokens";

WebBrowser.maybeCompleteAuthSession();

const T = MOBILE_TOKENS;

function formatRelativeDate(value?: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString();
}

function ConnectionCard({ item }: { item: LibraryConnectionItem }) {
  return (
    <View style={styles.featureCard}>
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.fromVerse.reference} {"->"} {item.toVerse.reference}
        </Text>
        <Text style={styles.connectionType}>{item.connectionType}</Text>
      </View>
      <Text style={styles.connectionSynopsis} numberOfLines={3}>
        {item.synopsis}
      </Text>
      <View style={styles.connectionMetaWrap}>
        <Text style={styles.metaPill}>
          Similarity {Math.round(item.similarity * 100)}%
        </Text>
        {item.bundleMeta?.anchorRef ? (
          <Text style={styles.metaPill}>
            Anchor {item.bundleMeta.anchorRef}
          </Text>
        ) : null}
        {item.tags.length > 0 ? (
          <Text style={styles.metaPill}>Tags {item.tags.join(", ")}</Text>
        ) : null}
      </View>
      {item.note ? (
        <Text style={styles.connectionNote}>Note: {item.note}</Text>
      ) : null}
      {item.createdAt ? (
        <Text style={styles.connectionTimestamp}>
          {formatRelativeDate(item.createdAt)}
        </Text>
      ) : null}
    </View>
  );
}

function BookmarkCard({
  item,
  selected,
  onPress,
}: {
  item: MobileBookmarkItem;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
    >
      <Text style={styles.bookmarkText} numberOfLines={4}>
        {item.text || "Empty bookmark"}
      </Text>
      {item.createdAt ? (
        <Text style={styles.connectionTimestamp}>
          Saved {formatRelativeDate(item.createdAt)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function HighlightCard({
  item,
  selected,
  onPress,
}: {
  item: MobileHighlightItem;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.featureCard, selected && styles.featureCardSelected]}
    >
      <View style={styles.connectionHeaderRow}>
        <Text style={styles.connectionRoute} numberOfLines={1}>
          {item.referenceLabel}
        </Text>
        <View style={styles.highlightColorBadgeWrap}>
          <View
            style={[styles.highlightColorDot, { backgroundColor: item.color }]}
          />
          <Text style={styles.highlightColorCode} numberOfLines={1}>
            {item.color}
          </Text>
        </View>
      </View>
      <Text style={styles.connectionSynopsis} numberOfLines={3}>
        {item.text || "No highlight text"}
      </Text>
      {item.note ? (
        <Text style={styles.connectionNote}>Note: {item.note}</Text>
      ) : null}
      {item.updatedAt ? (
        <Text style={styles.connectionTimestamp}>
          Updated {formatRelativeDate(item.updatedAt)}
        </Text>
      ) : null}
    </Pressable>
  );
}

interface HighlightDraftForm {
  book: string;
  chapter: string;
  verses: string;
  text: string;
  color: string;
  note: string;
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

export default function App() {
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
  const [bookmarkDraftText, setBookmarkDraftText] = useState("");
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

  async function processAuthRedirect(
    url: string,
    source: "initial" | "event" | "authSession",
  ) {
    if (processedAuthUrlsRef.current.has(url)) {
      return;
    }
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
      setBookmarkDraftText("");
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

  const authLabel = useMemo(() => {
    if (!user) return "Not signed in";
    return `Signed in as ${user.email ?? user.id}`;
  }, [user]);

  const selectedHighlight = useMemo(
    () => highlights.find((item) => item.id === selectedHighlightId) ?? null,
    [highlights, selectedHighlightId],
  );

  useEffect(() => {
    if (!selectedHighlight) return;
    setHighlightEditColor(selectedHighlight.color || "#facc15");
    setHighlightEditNote(selectedHighlight.note ?? "");
  }, [selectedHighlight?.id]);

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
    const text = bookmarkDraftText.trim();
    if (!text) {
      setBookmarkMutationError("Bookmark text is required.");
      return;
    }

    setBookmarkMutationBusy(true);
    setBookmarkMutationError(null);
    try {
      const created = await withAccessToken((accessToken) =>
        createBookmark({
          apiBaseUrl: MOBILE_ENV.API_URL,
          accessToken,
          text,
        }),
      );
      setBookmarks((current) => [created, ...current]);
      setBookmarksLoadedAt(new Date().toISOString());
      setBookmarkDraftText("");
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

  function renderAuthScreen() {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Sign In</Text>
        <Text style={styles.panelSubtitle}>
          Mobile auth is production-ready now. Use Google, Apple, or email
          fallback.
        </Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={T.colors.textMuted}
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          autoCapitalize="none"
          autoComplete="password"
          placeholder="Password"
          placeholderTextColor={T.colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        <View style={styles.row}>
          <Pressable
            disabled={busy}
            onPress={() => void startOAuth("google")}
            style={[
              styles.providerButton,
              styles.googleButton,
              busy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.providerButtonLabel}>Google</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void startOAuth("apple")}
            style={[
              styles.providerButton,
              styles.appleButton,
              busy && styles.buttonDisabled,
            ]}
          >
            <Text
              style={[
                styles.providerButtonLabel,
                styles.providerButtonLabelInverse,
              ]}
            >
              Apple
            </Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            disabled={busy}
            onPress={() => void signIn()}
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonLabel}>Email sign in</Text>
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => void sendMagicLink()}
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryButtonLabel}>Magic link</Text>
          </Pressable>
        </View>
        <View style={styles.calloutMuted}>
          <Text style={styles.calloutMutedText}>
            Callback: {getOAuthRedirectUrl()}
          </Text>
        </View>
        {authError ? <Text style={styles.error}>{authError}</Text> : null}
        {authInfo ? <Text style={styles.info}>{authInfo}</Text> : null}
      </View>
    );
  }

  function renderHomeTab(nav: {
    openLibrary: () => void;
    openBookmarks: () => void;
    openHighlights: () => void;
  }) {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}>
        <View style={styles.heroCard}>
          <Text style={styles.heroEyebrow}>Zero1 Mobile</Text>
          <Text style={styles.heroTitle}>
            Authenticated mobile shell is live.
          </Text>
          <Text style={styles.heroSubtitle}>
            Provider login, session restore, and protected API access now work
            on the iOS dev client.
          </Text>
          <View style={styles.row}>
            <Pressable
              disabled={busy}
              onPress={() => void refreshDashboard()}
              style={[styles.primaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonLabel}>Refresh dashboard</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={nav.openLibrary}
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonLabel}>Open library</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              disabled={busy}
              onPress={nav.openBookmarks}
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonLabel}>Bookmarks</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={nav.openHighlights}
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonLabel}>Highlights</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Quick Stats</Text>
          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Bookmarks</Text>
              <Text style={styles.statValue}>
                {probeResult?.bookmarksCount ?? "-"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Highlights</Text>
              <Text style={styles.statValue}>
                {probeResult?.highlightsCount ?? "-"}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Connections</Text>
              <Text style={styles.statValue}>
                {probeResult?.libraryConnectionsCount ?? "-"}
              </Text>
            </View>
          </View>
          {probeError ? <Text style={styles.error}>{probeError}</Text> : null}
          {libraryError ? (
            <Text style={styles.error}>{libraryError}</Text>
          ) : null}
          {bookmarksError ? (
            <Text style={styles.error}>{bookmarksError}</Text>
          ) : null}
          {highlightsError ? (
            <Text style={styles.error}>{highlightsError}</Text>
          ) : null}
          {libraryLoadedAt ? (
            <Text style={styles.caption}>
              Library synced {formatRelativeDate(libraryLoadedAt)}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  function renderBookmarksTab(nav: {
    openCreate: () => void;
    openDetail: (bookmarkId: string) => void;
  }) {
    return (
      <View style={styles.tabScreen}>
        <View style={styles.panel}>
          <View style={styles.spaceBetweenRow}>
            <View style={styles.flex1}>
              <Text style={styles.panelTitle}>Bookmarks</Text>
              <Text style={styles.panelSubtitle}>
                Authenticated mobile list backed by `/api/bookmarks`.
              </Text>
            </View>
            <Pressable
              disabled={bookmarksLoading || busy}
              onPress={() => void loadBookmarks()}
              style={[
                styles.ghostButton,
                (bookmarksLoading || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.ghostButtonLabel}>
                {bookmarksLoading ? "Loading..." : "Refresh"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              disabled={bookmarkMutationBusy || busy}
              onPress={nav.openCreate}
              style={[
                styles.primaryButton,
                (bookmarkMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>New bookmark</Text>
            </Pressable>
          </View>
          {bookmarksError ? (
            <Text style={styles.error}>{bookmarksError}</Text>
          ) : null}
          {bookmarksLoadedAt ? (
            <Text style={styles.caption}>
              Last sync {formatRelativeDate(bookmarksLoadedAt)}
            </Text>
          ) : null}
          {bookmarkMutationError ? (
            <Text style={styles.error}>{bookmarkMutationError}</Text>
          ) : null}
        </View>

        <View style={styles.listHintRow}>
          <Text style={styles.caption}>
            Tap a bookmark to open its route screen.
          </Text>
        </View>
        <FlatList
          data={bookmarks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={bookmarksLoading}
          onRefresh={() => void loadBookmarks()}
          renderItem={({ item }) => (
            <BookmarkCard
              item={item}
              selected={item.id === selectedBookmarkId}
              onPress={() => nav.openDetail(item.id)}
            />
          )}
          ListEmptyComponent={
            bookmarksLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={T.colors.accent} />
                <Text style={styles.emptyTitle}>Loading bookmarks...</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No bookmarks yet</Text>
                <Text style={styles.emptySubtitle}>
                  Use New bookmark to create one, then pull down to sync.
                </Text>
              </View>
            )
          }
        />
      </View>
    );
  }

  function renderHighlightsTab(nav: {
    openCreate: () => void;
    openDetail: (highlightId: string) => void;
  }) {
    return (
      <View style={styles.tabScreen}>
        <View style={styles.panel}>
          <View style={styles.spaceBetweenRow}>
            <View style={styles.flex1}>
              <Text style={styles.panelTitle}>Highlights</Text>
              <Text style={styles.panelSubtitle}>
                Authenticated mobile list backed by `/api/highlights`.
              </Text>
            </View>
            <Pressable
              disabled={highlightsLoading || busy}
              onPress={() => void loadHighlights()}
              style={[
                styles.ghostButton,
                (highlightsLoading || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.ghostButtonLabel}>
                {highlightsLoading ? "Loading..." : "Refresh"}
              </Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              disabled={highlightMutationBusy || busy}
              onPress={nav.openCreate}
              style={[
                styles.primaryButton,
                (highlightMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>New highlight</Text>
            </Pressable>
          </View>
          {highlightsError ? (
            <Text style={styles.error}>{highlightsError}</Text>
          ) : null}
          {highlightsLoadedAt ? (
            <Text style={styles.caption}>
              Last sync {formatRelativeDate(highlightsLoadedAt)}
            </Text>
          ) : null}
          {highlightMutationError ? (
            <Text style={styles.error}>{highlightMutationError}</Text>
          ) : null}
        </View>

        <View style={styles.listHintRow}>
          <Text style={styles.caption}>
            Tap a highlight to open its route screen.
          </Text>
        </View>
        <FlatList
          data={highlights}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={highlightsLoading}
          onRefresh={() => void loadHighlights()}
          renderItem={({ item }) => (
            <HighlightCard
              item={item}
              selected={item.id === selectedHighlightId}
              onPress={() => nav.openDetail(item.id)}
            />
          )}
          ListEmptyComponent={
            highlightsLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={T.colors.accent} />
                <Text style={styles.emptyTitle}>Loading highlights...</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No highlights yet</Text>
                <Text style={styles.emptySubtitle}>
                  Use New highlight to create one, then pull down to sync.
                </Text>
              </View>
            )
          }
        />
      </View>
    );
  }

  function renderBookmarkCreateRoute() {
    return (
      <ScrollView contentContainerStyle={styles.routeScrollContent}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>New Bookmark</Text>
          <Text style={styles.panelSubtitle}>
            Create a bookmark directly from the mobile app shell.
          </Text>
          <TextInput
            multiline
            placeholder="Paste verse text, note, or reference snippet..."
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.textAreaInput]}
            value={bookmarkDraftText}
            onChangeText={setBookmarkDraftText}
          />
          {bookmarkMutationError ? (
            <Text style={styles.error}>{bookmarkMutationError}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              disabled={bookmarkMutationBusy || busy}
              onPress={() => void handleCreateBookmark()}
              style={[
                styles.primaryButton,
                (bookmarkMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>
                {bookmarkMutationBusy ? "Saving..." : "Save bookmark"}
              </Text>
            </Pressable>
            <Pressable
              disabled={bookmarkMutationBusy || busy || !bookmarkDraftText}
              onPress={() => setBookmarkDraftText("")}
              style={[
                styles.secondaryButton,
                (bookmarkMutationBusy || busy || !bookmarkDraftText) &&
                  styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  function renderBookmarkDetailRoute(bookmarkId: string) {
    const bookmark = bookmarks.find((item) => item.id === bookmarkId) ?? null;
    if (!bookmark) {
      return (
        <View style={styles.tabScreen}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Bookmark not found</Text>
            <Text style={styles.emptySubtitle}>
              It may have been deleted. Return to the list and refresh.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.routeScrollContent}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Bookmark Detail</Text>
          <Text style={styles.bookmarkText}>{bookmark.text}</Text>
          {bookmark.createdAt ? (
            <Text style={styles.caption}>
              Saved {formatRelativeDate(bookmark.createdAt)}
            </Text>
          ) : null}
          {bookmarkMutationError ? (
            <Text style={styles.error}>{bookmarkMutationError}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              disabled={bookmarkMutationBusy || busy}
              onPress={() => void handleDeleteBookmark(bookmark.id)}
              style={[
                styles.dangerButton,
                (bookmarkMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.dangerButtonLabel}>
                {bookmarkMutationBusy ? "Deleting..." : "Delete"}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  function renderHighlightCreateRoute() {
    return (
      <ScrollView contentContainerStyle={styles.routeScrollContent}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>New Highlight</Text>
          <Text style={styles.panelSubtitle}>
            Create a highlight using the existing sync endpoint and shared auth.
          </Text>
          <View style={styles.row}>
            <TextInput
              placeholder="Book"
              placeholderTextColor={T.colors.textMuted}
              style={[styles.input, styles.flex1]}
              value={highlightCreateDraft.book}
              onChangeText={(value) =>
                setHighlightCreateDraft((current) => ({
                  ...current,
                  book: value,
                }))
              }
            />
            <TextInput
              keyboardType="number-pad"
              placeholder="Chapter"
              placeholderTextColor={T.colors.textMuted}
              style={[styles.input, styles.inputCompact]}
              value={highlightCreateDraft.chapter}
              onChangeText={(value) =>
                setHighlightCreateDraft((current) => ({
                  ...current,
                  chapter: value,
                }))
              }
            />
          </View>
          <TextInput
            placeholder="Verses (comma-separated, e.g. 1,2,3)"
            placeholderTextColor={T.colors.textMuted}
            style={styles.input}
            value={highlightCreateDraft.verses}
            onChangeText={(value) =>
              setHighlightCreateDraft((current) => ({
                ...current,
                verses: value,
              }))
            }
          />
          <TextInput
            multiline
            placeholder="Highlight text"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.textAreaInput]}
            value={highlightCreateDraft.text}
            onChangeText={(value) =>
              setHighlightCreateDraft((current) => ({
                ...current,
                text: value,
              }))
            }
          />
          <View style={styles.row}>
            <TextInput
              autoCapitalize="none"
              placeholder="#facc15"
              placeholderTextColor={T.colors.textMuted}
              style={[styles.input, styles.flex1]}
              value={highlightCreateDraft.color}
              onChangeText={(value) =>
                setHighlightCreateDraft((current) => ({
                  ...current,
                  color: value,
                }))
              }
            />
            <View style={styles.colorPreviewWrap}>
              <View
                style={[
                  styles.colorPreviewDot,
                  {
                    backgroundColor:
                      highlightCreateDraft.color.trim() || "#facc15",
                  },
                ]}
              />
              <Text style={styles.caption}>Preview</Text>
            </View>
          </View>
          <TextInput
            multiline
            placeholder="Optional note"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.textAreaInputSmall]}
            value={highlightCreateDraft.note}
            onChangeText={(value) =>
              setHighlightCreateDraft((current) => ({
                ...current,
                note: value,
              }))
            }
          />
          {highlightMutationError ? (
            <Text style={styles.error}>{highlightMutationError}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              disabled={highlightMutationBusy || busy}
              onPress={() => void handleCreateHighlight()}
              style={[
                styles.primaryButton,
                (highlightMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>
                {highlightMutationBusy ? "Saving..." : "Create highlight"}
              </Text>
            </Pressable>
            <Pressable
              disabled={highlightMutationBusy || busy}
              onPress={() =>
                setHighlightCreateDraft((current) => ({
                  ...current,
                  text: "",
                  note: "",
                }))
              }
              style={[
                styles.secondaryButton,
                (highlightMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonLabel}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  function renderHighlightDetailRoute(highlightId: string) {
    const highlight =
      highlights.find((item) => item.id === highlightId) ?? null;
    if (!highlight) {
      return (
        <View style={styles.tabScreen}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Highlight not found</Text>
            <Text style={styles.emptySubtitle}>
              It may have been deleted. Return to the list and refresh.
            </Text>
          </View>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.routeScrollContent}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Highlight Detail</Text>
          <Text style={styles.meta}>{highlight.referenceLabel}</Text>
          <Text style={styles.connectionSynopsis}>{highlight.text}</Text>
          <TextInput
            autoCapitalize="none"
            placeholder="#facc15"
            placeholderTextColor={T.colors.textMuted}
            style={styles.input}
            value={highlightEditColor}
            onChangeText={setHighlightEditColor}
          />
          <TextInput
            multiline
            placeholder="Note"
            placeholderTextColor={T.colors.textMuted}
            style={[styles.input, styles.textAreaInputSmall]}
            value={highlightEditNote}
            onChangeText={setHighlightEditNote}
          />
          {highlightMutationError ? (
            <Text style={styles.error}>{highlightMutationError}</Text>
          ) : null}
          <View style={styles.row}>
            <Pressable
              disabled={highlightMutationBusy || busy}
              onPress={() => void handleSaveHighlightEdits()}
              style={[
                styles.primaryButton,
                (highlightMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonLabel}>
                {highlightMutationBusy ? "Saving..." : "Save changes"}
              </Text>
            </Pressable>
            <Pressable
              disabled={highlightMutationBusy || busy}
              onPress={() => void handleDeleteHighlight(highlight.id)}
              style={[
                styles.dangerButton,
                (highlightMutationBusy || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.dangerButtonLabel}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  function renderLibraryTab() {
    return (
      <View style={styles.tabScreen}>
        <View style={styles.panel}>
          <View style={styles.spaceBetweenRow}>
            <View style={styles.flex1}>
              <Text style={styles.panelTitle}>Library Connections</Text>
              <Text style={styles.panelSubtitle}>
                First production feature route on mobile. Data is pulled from
                the same authenticated backend as desktop/web.
              </Text>
            </View>
            <Pressable
              disabled={libraryLoading || busy}
              onPress={() => void loadLibraryConnections()}
              style={[
                styles.ghostButton,
                (libraryLoading || busy) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.ghostButtonLabel}>
                {libraryLoading ? "Loading..." : "Refresh"}
              </Text>
            </Pressable>
          </View>
          {libraryError ? (
            <Text style={styles.error}>{libraryError}</Text>
          ) : null}
          {libraryLoadedAt ? (
            <Text style={styles.caption}>
              Last sync {formatRelativeDate(libraryLoadedAt)}
            </Text>
          ) : null}
        </View>
        <FlatList
          data={libraryConnections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshing={libraryLoading}
          onRefresh={() => void loadLibraryConnections()}
          renderItem={({ item }) => <ConnectionCard item={item} />}
          ListEmptyComponent={
            libraryLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator color={T.colors.accent} />
                <Text style={styles.emptyTitle}>Loading connections...</Text>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No saved connections yet</Text>
                <Text style={styles.emptySubtitle}>
                  Create or save connections in your existing app flows, then
                  return here and refresh.
                </Text>
              </View>
            )
          }
        />
      </View>
    );
  }

  function renderAccountTab() {
    return (
      <ScrollView contentContainerStyle={styles.tabContent}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Account</Text>
          <Text style={styles.meta}>{authLabel}</Text>
          <Text style={styles.meta}>
            Session: {session ? "active" : "none"} | Strict env:{" "}
            {String(MOBILE_ENV.STRICT_ENV)}
          </Text>
          <Text style={styles.meta}>API: {MOBILE_ENV.API_URL}</Text>
          <Text style={styles.meta}>Mode: {MOBILE_ENV.MODE}</Text>
          <Text style={styles.meta}>
            Google OAuth: {MOBILE_ENV.ENABLE_GOOGLE_OAUTH ? "enabled" : "off"} |
            Apple OAuth: {MOBILE_ENV.ENABLE_APPLE_OAUTH ? "enabled" : "off"}
          </Text>
          {authError ? <Text style={styles.error}>{authError}</Text> : null}
          {authInfo ? <Text style={styles.info}>{authInfo}</Text> : null}
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Session Actions</Text>
          <View style={styles.row}>
            <Pressable
              disabled={busy}
              onPress={() => void runProbe()}
              style={[styles.primaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonLabel}>Run Protected Probe</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void signOut()}
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonLabel}>Sign out</Text>
            </Pressable>
          </View>
          {probeResult ? (
            <Text style={styles.caption}>
              Probe: {probeResult.bookmarksCount} bookmarks,{" "}
              {probeResult.highlightsCount} highlights,{" "}
              {probeResult.libraryConnectionsCount} connections
            </Text>
          ) : null}
          {probeError ? <Text style={styles.error}>{probeError}</Text> : null}
        </View>
      </ScrollView>
    );
  }

  function renderAuthFlow() {
    return (
      <ScrollView
        contentContainerStyle={styles.rootScrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.rootFrame}>
          {renderAuthScreen()}
          {busy ? <ActivityIndicator color={T.colors.accentStrong} /> : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appBackground}>
        <View style={styles.backdropBlobA} />
        <View style={styles.backdropBlobB} />
        <MobileRootNavigator
          isAuthenticated={Boolean(user)}
          renderAuth={renderAuthFlow}
          renderHome={renderHomeTab}
          renderLibrary={renderLibraryTab}
          renderBookmarks={renderBookmarksTab}
          renderHighlights={renderHighlightsTab}
          renderAccount={renderAccountTab}
          renderBookmarkCreate={renderBookmarkCreateRoute}
          renderBookmarkDetail={renderBookmarkDetailRoute}
          renderHighlightCreate={renderHighlightCreateRoute}
          renderHighlightDetail={renderHighlightDetailRoute}
        />
        {busy ? (
          <View style={styles.globalBusyOverlay} pointerEvents="none">
            <ActivityIndicator color={T.colors.accentStrong} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  appBackground: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  backdropBlobA: {
    position: "absolute",
    top: -80,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: T.colors.accentSoft,
    opacity: 0.8,
  },
  backdropBlobB: {
    position: "absolute",
    bottom: 60,
    left: -70,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: T.colors.pineSoft,
    opacity: 0.9,
  },
  rootScrollContent: {
    padding: T.spacing.lg,
    paddingBottom: T.spacing.xxl,
  },
  rootFrame: {
    gap: T.spacing.md,
  },
  authenticatedRootFrame: {
    flex: 1,
    padding: T.spacing.lg,
    gap: T.spacing.md,
  },
  globalBusyOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    backgroundColor: T.colors.surfaceRaised,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: T.spacing.lg,
    gap: T.spacing.sm,
    shadowColor: T.colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1,
  },
  panelTitle: {
    color: T.colors.text,
    fontSize: T.typography.heading,
    fontWeight: "700",
  },
  panelSubtitle: {
    color: T.colors.textMuted,
    fontSize: T.typography.body,
    lineHeight: 20,
  },
  input: {
    backgroundColor: T.colors.surface,
    borderColor: T.colors.border,
    borderWidth: 1,
    borderRadius: T.radius.md,
    paddingHorizontal: T.spacing.md,
    paddingVertical: T.spacing.md,
    color: T.colors.text,
    fontSize: T.typography.body,
  },
  textAreaInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  textAreaInputSmall: {
    minHeight: 68,
    textAlignVertical: "top",
  },
  inputCompact: {
    width: 110,
  },
  row: {
    flexDirection: "row",
    gap: T.spacing.sm,
  },
  spaceBetweenRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: T.spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  providerButton: {
    flex: 1,
    borderRadius: T.radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  googleButton: {
    backgroundColor: T.colors.surface,
    borderColor: T.colors.border,
  },
  appleButton: {
    backgroundColor: T.colors.ink,
    borderColor: T.colors.ink,
  },
  providerButtonLabel: {
    color: T.colors.text,
    fontWeight: "700",
    fontSize: T.typography.body,
  },
  providerButtonLabelInverse: {
    color: T.colors.canvas,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: T.colors.accent,
    borderRadius: T.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: T.spacing.md,
  },
  primaryButtonLabel: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: T.typography.body,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: T.colors.canvasMuted,
    borderColor: T.colors.border,
    borderWidth: 1,
    borderRadius: T.radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: T.spacing.md,
  },
  secondaryButtonLabel: {
    color: T.colors.text,
    fontWeight: "700",
    fontSize: T.typography.body,
  },
  ghostButton: {
    borderRadius: T.radius.md,
    borderColor: T.colors.border,
    borderWidth: 1,
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.md,
    paddingVertical: 10,
  },
  ghostButtonLabel: {
    color: T.colors.text,
    fontWeight: "600",
    fontSize: T.typography.body,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  calloutMuted: {
    backgroundColor: T.colors.canvasMuted,
    borderRadius: T.radius.md,
    padding: T.spacing.sm,
  },
  calloutMutedText: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
  },
  error: {
    color: T.colors.danger,
    fontSize: T.typography.body,
  },
  info: {
    color: T.colors.pine,
    fontSize: T.typography.body,
  },
  meta: {
    color: T.colors.textMuted,
    fontSize: T.typography.body,
  },
  caption: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
  },
  shell: {
    gap: T.spacing.md,
  },
  shellHeader: {
    backgroundColor: T.colors.ink,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    gap: T.spacing.xs,
  },
  shellHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.spacing.sm,
  },
  shellTitle: {
    color: T.colors.canvas,
    fontSize: T.typography.title,
    fontWeight: "800",
  },
  shellSubtitle: {
    color: "#D9CCB5",
    fontSize: T.typography.body,
  },
  shellBackButton: {
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: T.spacing.md,
    paddingVertical: 10,
  },
  shellBackButtonLabel: {
    color: T.colors.canvas,
    fontWeight: "700",
    fontSize: T.typography.body,
  },
  shellBody: {
    minHeight: 520,
  },
  tabContent: {
    gap: T.spacing.md,
    paddingBottom: T.spacing.md,
  },
  routeScrollContent: {
    gap: T.spacing.md,
    paddingBottom: T.spacing.xl,
  },
  tabScreen: {
    gap: T.spacing.md,
  },
  heroCard: {
    backgroundColor: T.colors.ink,
    borderRadius: T.radius.lg,
    padding: T.spacing.lg,
    gap: T.spacing.sm,
  },
  heroEyebrow: {
    color: "#D7C79E",
    fontSize: T.typography.caption,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontWeight: "700",
  },
  heroTitle: {
    color: T.colors.canvas,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  heroSubtitle: {
    color: "#D8CCB8",
    fontSize: T.typography.body,
    lineHeight: 20,
  },
  statGrid: {
    flexDirection: "row",
    gap: T.spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: T.radius.md,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: T.spacing.sm,
    gap: 4,
  },
  statLabel: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
  },
  statValue: {
    color: T.colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  listContent: {
    gap: T.spacing.md,
    paddingBottom: T.spacing.xl,
  },
  featureCard: {
    backgroundColor: T.colors.surfaceRaised,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: T.spacing.lg,
    gap: T.spacing.sm,
  },
  featureCardSelected: {
    borderColor: T.colors.accent,
    backgroundColor: "#FFF4E3",
  },
  connectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: T.spacing.sm,
  },
  connectionRoute: {
    flex: 1,
    color: T.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  connectionType: {
    color: T.colors.pine,
    backgroundColor: T.colors.pineSoft,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 4,
    borderRadius: T.radius.pill,
    fontSize: T.typography.caption,
    overflow: "hidden",
  },
  bookmarkText: {
    color: T.colors.text,
    fontSize: T.typography.body,
    lineHeight: 20,
  },
  highlightColorBadgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: T.spacing.xs,
    backgroundColor: T.colors.canvasMuted,
    borderRadius: T.radius.pill,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 4,
    maxWidth: 132,
  },
  highlightColorDot: {
    width: 10,
    height: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  highlightColorCode: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
    flexShrink: 1,
  },
  connectionSynopsis: {
    color: T.colors.text,
    fontSize: T.typography.body,
    lineHeight: 20,
  },
  connectionMetaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: T.spacing.xs,
  },
  metaPill: {
    color: T.colors.textMuted,
    backgroundColor: T.colors.canvasMuted,
    borderRadius: T.radius.pill,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 4,
    fontSize: T.typography.caption,
    overflow: "hidden",
  },
  connectionNote: {
    color: T.colors.textMuted,
    fontSize: T.typography.body,
    fontStyle: "italic",
  },
  connectionTimestamp: {
    color: T.colors.textMuted,
    fontSize: T.typography.caption,
  },
  emptyState: {
    backgroundColor: T.colors.surfaceRaised,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: T.spacing.xl,
    alignItems: "center",
    gap: T.spacing.sm,
  },
  emptyTitle: {
    color: T.colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    color: T.colors.textMuted,
    fontSize: T.typography.body,
    textAlign: "center",
    lineHeight: 20,
  },
  listHintRow: {
    paddingHorizontal: T.spacing.xs,
  },
  colorPreviewWrap: {
    minWidth: 92,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: T.spacing.sm,
    paddingVertical: 8,
  },
  colorPreviewDot: {
    width: 18,
    height: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.18)",
  },
  dangerButton: {
    flex: 1,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.danger,
    backgroundColor: T.colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: T.spacing.md,
  },
  dangerButtonLabel: {
    color: T.colors.danger,
    fontWeight: "700",
    fontSize: T.typography.body,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: T.colors.surfaceRaised,
    borderRadius: T.radius.lg,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: T.spacing.xs,
    gap: T.spacing.xs,
  },
  tabButton: {
    flex: 1,
    borderRadius: T.radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: T.colors.accentSoft,
  },
  tabButtonLabel: {
    color: T.colors.textMuted,
    fontWeight: "700",
    fontSize: T.typography.body,
  },
  tabButtonLabelActive: {
    color: T.colors.accentStrong,
  },
});
