import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { fetchProtectedProbe, type ProtectedProbeResult } from "./src/lib/api";
import {
  getOAuthRedirectUrl,
  handleSupabaseAuthRedirect,
} from "./src/lib/authRedirect";
import { supabase } from "./src/lib/supabase";

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
  const processedAuthUrlsRef = useRef<Set<string>>(new Set());

  async function processAuthRedirect(url: string, source: "initial" | "event") {
    if (processedAuthUrlsRef.current.has(url)) {
      return;
    }
    processedAuthUrlsRef.current.add(url);

    const outcome = await handleSupabaseAuthRedirect(url);
    if (outcome.kind === "ignored") {
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

  const authLabel = useMemo(() => {
    if (!user) return "Not signed in";
    return `Signed in as ${user.email ?? user.id}`;
  }, [user]);

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
      await Linking.openURL(data.url);
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
    setProbeResult(null);
    setProbeError(null);
    try {
      await supabase.auth.signOut();
    } finally {
      setBusy(false);
    }
  }

  async function runProbe() {
    setBusy(true);
    setProbeError(null);
    setProbeResult(null);
    try {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        throw new Error("Sign in required before running protected probe.");
      }
      const result = await fetchProtectedProbe({
        apiBaseUrl: MOBILE_ENV.API_URL,
        accessToken: currentSession.access_token,
      });
      setProbeResult(result);
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Zero1 Mobile Foundation</Text>
        <View style={styles.card}>
          <Text style={styles.meta}>API: {MOBILE_ENV.API_URL}</Text>
          <Text style={styles.meta}>Mode: {MOBILE_ENV.MODE}</Text>
          <Text style={styles.meta}>
            Auth redirect: {getOAuthRedirectUrl()}
          </Text>
          <Text style={styles.meta}>{authLabel}</Text>
          <Text style={styles.meta}>
            Session: {session ? "active" : "none"} | Strict env:{" "}
            {String(MOBILE_ENV.STRICT_ENV)}
          </Text>
          <Text style={styles.meta}>
            Google OAuth: {MOBILE_ENV.ENABLE_GOOGLE_OAUTH ? "enabled" : "off"} |
            Apple OAuth: {MOBILE_ENV.ENABLE_APPLE_OAUTH ? "enabled" : "off"}
          </Text>
        </View>

        {!user ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Supabase Auth</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor="#6b7280"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              autoCapitalize="none"
              autoComplete="password"
              placeholder="Password"
              placeholderTextColor="#6b7280"
              secureTextEntry
              style={styles.input}
              value={password}
              onChangeText={setPassword}
            />
            <View style={styles.row}>
              <Pressable
                disabled={busy}
                onPress={() => void startOAuth("google")}
                style={[styles.buttonGoogle, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonLabel}>Google</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => void startOAuth("apple")}
                style={[styles.buttonApple, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonLabel}>Apple</Text>
              </Pressable>
            </View>
            <View style={styles.row}>
              <Pressable
                disabled={busy}
                onPress={() => void signIn()}
                style={[styles.button, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonLabel}>Sign in</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => void sendMagicLink()}
                style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonLabel}>Magic link</Text>
              </Pressable>
            </View>
            <Text style={styles.meta}>
              Email/password + magic link remain available as fallback. OAuth
              callbacks are handled via deep link `auth/callback`.
            </Text>
            {authError ? <Text style={styles.error}>{authError}</Text> : null}
            {authInfo ? <Text style={styles.info}>{authInfo}</Text> : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Session Controls</Text>
            <View style={styles.row}>
              <Pressable
                disabled={busy}
                onPress={() => void runProbe()}
                style={[styles.button, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonLabel}>Run Protected Probe</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => void signOut()}
                style={[styles.buttonSecondary, busy && styles.buttonDisabled]}
              >
                <Text style={styles.buttonLabel}>Sign out</Text>
              </Pressable>
            </View>
            {probeError ? <Text style={styles.error}>{probeError}</Text> : null}
            {probeResult ? (
              <Text style={styles.result}>
                bookmarks={probeResult.bookmarksCount}, highlights=
                {probeResult.highlightsCount}, libraryConnections=
                {probeResult.libraryConnectionsCount}
              </Text>
            ) : null}
          </View>
        )}

        {busy ? <ActivityIndicator color="#f8fafc" /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  container: {
    padding: 20,
    gap: 16,
  },
  title: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
  meta: {
    color: "#94a3b8",
    fontSize: 13,
  },
  input: {
    borderColor: "#334155",
    borderWidth: 1,
    borderRadius: 10,
    color: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#020617",
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  buttonSecondary: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  buttonGoogle: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#1f2937",
    borderColor: "#475569",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  buttonApple: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#111827",
    borderColor: "#64748b",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: "#f8fafc",
    fontWeight: "600",
    fontSize: 14,
  },
  error: {
    color: "#fda4af",
    fontSize: 13,
  },
  info: {
    color: "#93c5fd",
    fontSize: 13,
  },
  result: {
    color: "#e2e8f0",
    fontSize: 13,
  },
});
