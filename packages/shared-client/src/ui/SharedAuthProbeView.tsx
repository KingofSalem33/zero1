import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { CSSProperties } from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { buildAuthSessionPayload } from "@zero1/shared";
import {
  createProtectedApiClient,
  type Bookmark,
  type Highlight,
  type LibraryConnection,
} from "../api/createProtectedApiClient";
import {
  attachTokenRefreshObserver,
  type TokenRefreshSnapshot,
} from "../auth/attachTokenRefreshObserver";
import { createAuthFetch } from "../auth/createAuthFetch";

interface SharedAuthProbeViewProps {
  appLabel: string;
  apiBaseUrl: string;
  strictEnv: boolean;
  runtimeVersionLabel?: string;
  magicLinkRedirectTo?: string;
  enableGoogleOAuth?: boolean;
  enableAppleOAuth?: boolean;
  sessionPersistenceLabel?: string;
  supabase: SupabaseClient;
}

interface ApiProbeResult {
  bookmarks: Bookmark[];
  highlights: Highlight[];
  connections: LibraryConnection[];
}

const containerStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: 960,
  padding: 24,
};

const cardStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const rowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  marginBottom: 12,
};

const fieldStyle: CSSProperties = {
  flex: "1 1 220px",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: 10,
};

const buttonStyle: CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: "10px 14px",
  background: "#1f2937",
  color: "#ffffff",
  cursor: "pointer",
};

const MOBILE_BREAKPOINT_PX = 768;

export function SharedAuthProbeView({
  appLabel,
  apiBaseUrl,
  strictEnv,
  runtimeVersionLabel,
  magicLinkRedirectTo,
  enableGoogleOAuth,
  enableAppleOAuth,
  sessionPersistenceLabel,
  supabase,
}: SharedAuthProbeViewProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [probeResult, setProbeResult] = useState<ApiProbeResult | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [tokenRefreshCount, setTokenRefreshCount] = useState(0);
  const [lastTokenRefreshAt, setLastTokenRefreshAt] = useState<string | null>(
    null,
  );
  const [isCompactLayout, setIsCompactLayout] = useState(() => {
    const runtimeWindow = globalThis as { innerWidth?: number };
    return (
      (runtimeWindow.innerWidth ?? MOBILE_BREAKPOINT_PX + 1) <=
      MOBILE_BREAKPOINT_PX
    );
  });

  const authFetch = useMemo(() => createAuthFetch(supabase), [supabase]);
  const apiClient = useMemo(
    () =>
      createProtectedApiClient({
        apiBaseUrl,
        authFetch,
      }),
    [apiBaseUrl, authFetch],
  );
  const authSessionPayload = useMemo(
    () =>
      buildAuthSessionPayload({
        session,
        user,
        strictEnv,
        tokenRefreshCount,
        lastTokenRefreshAt,
      }),
    [lastTokenRefreshAt, session, strictEnv, tokenRefreshCount, user],
  );
  const oauthRedirectTo = useMemo(() => {
    if (magicLinkRedirectTo && magicLinkRedirectTo.trim().length > 0) {
      return magicLinkRedirectTo.trim();
    }
    const runtimeLocation = (globalThis as { location?: { origin?: string } })
      .location;
    if (runtimeLocation?.origin) {
      return `${runtimeLocation.origin}/ops/shared-probe`;
    }
    return undefined;
  }, [magicLinkRedirectTo]);
  const showGoogleOAuth = enableGoogleOAuth ?? true;
  const showAppleOAuth = enableAppleOAuth ?? true;
  const resolvedContainerStyle = useMemo<CSSProperties>(
    () => ({
      ...containerStyle,
      maxWidth: isCompactLayout ? 640 : 960,
      padding: isCompactLayout ? 12 : 24,
    }),
    [isCompactLayout],
  );
  const resolvedCardStyle = useMemo<CSSProperties>(
    () => ({
      ...cardStyle,
      borderRadius: isCompactLayout ? 10 : 12,
      padding: isCompactLayout ? 12 : 16,
      marginBottom: isCompactLayout ? 12 : 16,
    }),
    [isCompactLayout],
  );
  const resolvedRowStyle = useMemo<CSSProperties>(
    () => ({
      ...rowStyle,
      flexDirection: isCompactLayout ? "column" : "row",
      flexWrap: isCompactLayout ? "nowrap" : "wrap",
      gap: isCompactLayout ? 8 : 12,
    }),
    [isCompactLayout],
  );
  const resolvedFieldStyle = useMemo<CSSProperties>(
    () => ({
      ...fieldStyle,
      flex: isCompactLayout ? "1 1 100%" : "1 1 220px",
      minWidth: 0,
    }),
    [isCompactLayout],
  );
  const resolvedInputStyle = useMemo<CSSProperties>(
    () => ({
      ...inputStyle,
      padding: isCompactLayout ? 12 : 10,
    }),
    [isCompactLayout],
  );
  const baseButtonResolvedStyle = useMemo<CSSProperties>(
    () => ({
      ...buttonStyle,
      width: isCompactLayout ? "100%" : undefined,
      minHeight: 44,
    }),
    [isCompactLayout],
  );

  useEffect(() => {
    const runtime = globalThis as {
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
      innerWidth?: number;
    };

    if (!runtime.addEventListener || !runtime.removeEventListener) return;

    const handleResize = () => {
      setIsCompactLayout(
        (runtime.innerWidth ?? MOBILE_BREAKPOINT_PX + 1) <=
          MOBILE_BREAKPOINT_PX,
      );
    };

    runtime.addEventListener("resize", handleResize);
    return () => runtime.removeEventListener?.("resize", handleResize);
  }, []);

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
  }, [supabase]);

  useEffect(() => {
    return attachTokenRefreshObserver(
      supabase,
      (snapshot: TokenRefreshSnapshot) => {
        setTokenRefreshCount((current) => current + 1);
        setLastTokenRefreshAt(snapshot.refreshedAtIso);
      },
    );
  }, [supabase]);

  const authLabel = user
    ? `Signed in as ${user.email ?? user.id}`
    : "Not signed in";

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        throw error;
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink() {
    const emailAddress = email.trim();
    if (!emailAddress) {
      setAuthError("Email is required to send a magic link.");
      return;
    }

    setBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailAddress,
        ...(magicLinkRedirectTo
          ? {
              options: {
                emailRedirectTo: magicLinkRedirectTo,
              },
            }
          : {}),
      });

      if (error) {
        throw error;
      }

      setAuthInfo("Magic link sent. Check your email to continue sign-in.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithOAuth(provider: "google" | "apple") {
    setBusy(true);
    setAuthError(null);
    setAuthInfo(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        ...(oauthRedirectTo
          ? {
              options: {
                redirectTo: oauthRedirectTo,
              },
            }
          : {}),
      });

      if (error) {
        throw error;
      }

      const label = provider === "google" ? "Google" : "Apple";
      setAuthInfo(`Redirecting to ${label} sign-in...`);
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

  async function runApiProbe() {
    setBusy(true);
    setProbeError(null);
    try {
      const [bookmarks, highlights, connections] = await Promise.all([
        apiClient.getBookmarks(),
        apiClient.getHighlights(),
        apiClient.getLibraryConnections(),
      ]);
      setProbeResult({
        bookmarks,
        highlights,
        connections,
      });
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={resolvedContainerStyle}>
      <section style={resolvedCardStyle}>
        <h1>{appLabel}</h1>
        <p>
          {runtimeVersionLabel ? `${runtimeVersionLabel} | ` : ""}API:{" "}
          {apiBaseUrl}
        </p>
        <p>{authLabel}</p>
        <p>
          Session: {authSessionPayload.sessionActive ? "active" : "none"} |
          Strict env: {String(authSessionPayload.strictEnv)}
        </p>
        <p>
          Token refresh events: {authSessionPayload.tokenRefreshCount}
          {authSessionPayload.lastTokenRefreshAt
            ? ` | Last refresh: ${authSessionPayload.lastTokenRefreshAt}`
            : ""}
        </p>
        {sessionPersistenceLabel ? <p>{sessionPersistenceLabel}</p> : null}
      </section>

      <section style={resolvedCardStyle}>
        <h2>Supabase Auth</h2>
        {!user ? (
          <form onSubmit={signIn}>
            <div style={resolvedRowStyle}>
              <div style={resolvedFieldStyle}>
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  style={resolvedInputStyle}
                />
              </div>
              <div style={resolvedFieldStyle}>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  style={resolvedInputStyle}
                />
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: isCompactLayout ? "column" : "row",
                gap: 8,
                alignItems: "stretch",
              }}
            >
              <button
                type="submit"
                disabled={busy}
                style={baseButtonResolvedStyle}
              >
                Sign in
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendMagicLink()}
                style={{ ...baseButtonResolvedStyle, background: "#334155" }}
              >
                Send magic link
              </button>
            </div>
            {showGoogleOAuth || showAppleOAuth ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: isCompactLayout ? "column" : "row",
                  gap: 8,
                  marginTop: 8,
                  alignItems: "stretch",
                }}
              >
                {showGoogleOAuth ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void signInWithOAuth("google")}
                    style={{
                      ...baseButtonResolvedStyle,
                      background: "#2563eb",
                    }}
                  >
                    Continue with Google
                  </button>
                ) : null}
                {showAppleOAuth ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void signInWithOAuth("apple")}
                    style={{
                      ...baseButtonResolvedStyle,
                      background: "#111827",
                    }}
                  >
                    Continue with Apple
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOut()}
            style={baseButtonResolvedStyle}
          >
            Sign out
          </button>
        )}
        {authError ? <p>{authError}</p> : null}
        {authInfo ? <p>{authInfo}</p> : null}
      </section>

      <section style={resolvedCardStyle}>
        <h2>Protected API Probe</h2>
        <p>Uses bearer token from Supabase session via shared auth client.</p>
        <button
          type="button"
          disabled={busy || !user}
          onClick={() => void runApiProbe()}
          style={baseButtonResolvedStyle}
        >
          Fetch bookmarks, highlights, and library connections
        </button>
        {probeError ? <p>{probeError}</p> : null}
        {probeResult ? <pre>{JSON.stringify(probeResult, null, 2)}</pre> : null}
      </section>
    </main>
  );
}
