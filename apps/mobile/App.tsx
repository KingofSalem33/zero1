import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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

    return () => subscription.unsubscribe();
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
        options: MOBILE_ENV.MAGIC_LINK_REDIRECT_TO
          ? { emailRedirectTo: MOBILE_ENV.MAGIC_LINK_REDIRECT_TO }
          : undefined,
      });
      if (error) throw error;
      setAuthInfo("Magic link sent. Check your email.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
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
          <Text style={styles.meta}>{authLabel}</Text>
          <Text style={styles.meta}>
            Session: {session ? "active" : "none"} | Strict env:{" "}
            {String(MOBILE_ENV.STRICT_ENV)}
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
