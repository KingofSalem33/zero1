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
  fetchLibraryConnections,
  fetchProtectedProbe,
  type LibraryConnectionItem,
  type ProtectedProbeResult,
} from "./src/lib/api";
import {
  getOAuthRedirectUrl,
  handleSupabaseAuthRedirect,
} from "./src/lib/authRedirect";
import { supabase } from "./src/lib/supabase";
import { MOBILE_TOKENS, type MobileTabKey } from "./src/theme/tokens";

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
  const [activeTab, setActiveTab] = useState<MobileTabKey>("home");
  const [libraryConnections, setLibraryConnections] = useState<
    LibraryConnectionItem[]
  >([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryLoadedAt, setLibraryLoadedAt] = useState<string | null>(null);
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
      setActiveTab("home");
      setProbeResult(null);
      setProbeError(null);
      setLibraryConnections([]);
      setLibraryError(null);
      setLibraryLoadedAt(null);
      return;
    }

    void refreshDashboard();
  }, [user]);

  const authLabel = useMemo(() => {
    if (!user) return "Not signed in";
    return `Signed in as ${user.email ?? user.id}`;
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

  async function refreshDashboard() {
    await Promise.all([runProbe(), loadLibraryConnections()]);
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

  function renderHomeTab() {
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
              onPress={() => setActiveTab("library")}
              style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonLabel}>Open library</Text>
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
          {libraryLoadedAt ? (
            <Text style={styles.caption}>
              Library synced {formatRelativeDate(libraryLoadedAt)}
            </Text>
          ) : null}
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

  function renderAuthenticatedShell() {
    return (
      <View style={styles.shell}>
        <View style={styles.shellHeader}>
          <Text style={styles.shellTitle}>Zero1</Text>
          <Text style={styles.shellSubtitle}>
            {activeTab === "home"
              ? "Home"
              : activeTab === "library"
                ? "Library"
                : "Account"}
          </Text>
        </View>

        <View style={styles.shellBody}>
          {activeTab === "home" ? renderHomeTab() : null}
          {activeTab === "library" ? renderLibraryTab() : null}
          {activeTab === "account" ? renderAccountTab() : null}
        </View>

        <View style={styles.tabBar}>
          {(
            [
              ["home", "Home"],
              ["library", "Library"],
              ["account", "Account"],
            ] as Array<[MobileTabKey, string]>
          ).map(([key, label]) => {
            const isActive = activeTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setActiveTab(key)}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
              >
                <Text
                  style={[
                    styles.tabButtonLabel,
                    isActive && styles.tabButtonLabelActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.appBackground}>
        <View style={styles.backdropBlobA} />
        <View style={styles.backdropBlobB} />
        {!user ? (
          <ScrollView
            contentContainerStyle={styles.rootScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.rootFrame}>
              {renderAuthScreen()}
              {busy ? (
                <ActivityIndicator color={T.colors.accentStrong} />
              ) : null}
            </View>
          </ScrollView>
        ) : (
          <View style={styles.authenticatedRootFrame}>
            {renderAuthenticatedShell()}
            {busy ? <ActivityIndicator color={T.colors.accentStrong} /> : null}
          </View>
        )}
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
  shellTitle: {
    color: T.colors.canvas,
    fontSize: T.typography.title,
    fontWeight: "800",
  },
  shellSubtitle: {
    color: "#D9CCB5",
    fontSize: T.typography.body,
  },
  shellBody: {
    minHeight: 520,
  },
  tabContent: {
    gap: T.spacing.md,
    paddingBottom: T.spacing.md,
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
