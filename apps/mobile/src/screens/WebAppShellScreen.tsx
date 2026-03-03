import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { WebView } from "react-native-webview";
import type {
  WebView as WebViewType,
  WebViewMessageEvent,
} from "react-native-webview";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type WebShellErrorType = "network" | "http" | "timeout";

interface WebShellError {
  type: WebShellErrorType;
  message: string;
  url?: string;
  statusCode?: number;
  occurredAtIso: string;
}

interface WebAppShellScreenProps {
  webUrl: string;
  webHost: string;
  loadTimeoutMs: number;
  allowFallbackToNative: boolean;
  authSession: WebShellAuthSession | null;
  onFallbackToNative?: () => void;
  onInteractive?: () => void;
}

interface WebShellAuthSession {
  accessToken: string;
  refreshToken: string;
}

interface NativeAuthBridgeMessage {
  source: "zero1-mobile";
  type: "native-auth-session";
  payload: WebShellAuthSession | null;
  emittedAtIso: string;
}

function buildNativeAuthBridgeScript(
  authSession: WebShellAuthSession | null,
): string {
  const bridgeMessage: NativeAuthBridgeMessage = {
    source: "zero1-mobile",
    type: "native-auth-session",
    payload: authSession,
    emittedAtIso: new Date().toISOString(),
  };

  return `
    (function () {
      try {
        var message = ${JSON.stringify(bridgeMessage)};
        window.dispatchEvent(new MessageEvent("message", { data: message }));
        window.dispatchEvent(new CustomEvent("zero1:native-auth-session", { detail: message }));
      } catch (error) {
        console.warn("[WebShellBridge] Failed to dispatch auth session", error);
      }
    })();
    true;
  `;
}

function authSessionFingerprint(
  authSession: WebShellAuthSession | null,
): string {
  if (!authSession) {
    return "signed-out";
  }
  return `${authSession.accessToken}:${authSession.refreshToken}`;
}

export function WebAppShellScreen({
  webUrl,
  webHost,
  loadTimeoutMs,
  allowFallbackToNative,
  authSession,
  onFallbackToNative,
  onInteractive,
}: WebAppShellScreenProps) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebViewType>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAuthFingerprintRef = useRef<string | null>(null);
  const lastExternalUrlRef = useRef<string | null>(null);
  const [loadError, setLoadError] = useState<WebShellError | null>(null);
  const [lastHttpStatus, setLastHttpStatus] = useState<number | null>(null);
  const [isInteractive, setIsInteractive] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  const clearLoadTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startLoadTimeout = useCallback(() => {
    clearLoadTimeout();
    timeoutRef.current = setTimeout(() => {
      setLoadError({
        type: "timeout",
        message: `Web shell load timed out after ${Math.round(loadTimeoutMs / 1000)}s.`,
        url: webUrl,
        occurredAtIso: new Date().toISOString(),
      });
    }, loadTimeoutMs);
  }, [clearLoadTimeout, loadTimeoutMs, webUrl]);

  useEffect(() => {
    return () => {
      clearLoadTimeout();
    };
  }, [clearLoadTimeout]);

  const markInteractive = useCallback(() => {
    if (isInteractive) return;
    setIsInteractive(true);
    onInteractive?.();
  }, [isInteractive, onInteractive]);

  const pushAuthSessionToWebView = useCallback(
    (nextAuthSession: WebShellAuthSession | null) => {
      const nextFingerprint = authSessionFingerprint(nextAuthSession);
      if (lastAuthFingerprintRef.current === nextFingerprint) {
        return;
      }

      lastAuthFingerprintRef.current = nextFingerprint;
      webViewRef.current?.injectJavaScript(
        buildNativeAuthBridgeScript(nextAuthSession),
      );
    },
    [],
  );

  useEffect(() => {
    pushAuthSessionToWebView(authSession);
  }, [authSession, pushAuthSessionToWebView]);

  const handleReload = useCallback(() => {
    setLoadError(null);
    setLastHttpStatus(null);
    setIsInteractive(false);
    setIsReloading(true);
    setLoadProgress(0);
    lastAuthFingerprintRef.current = null;
    startLoadTimeout();
    webViewRef.current?.reload();
  }, [startLoadTimeout]);

  const handleExternalRequest = useCallback(async (url: string) => {
    if (!url || lastExternalUrlRef.current === url) {
      return;
    }
    lastExternalUrlRef.current = url;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      try {
        await Linking.openURL(url);
      } catch {
        // best-effort external handoff
      }
    }
  }, []);

  const handleShouldStartLoadWithRequest = useCallback(
    (request: { url: string; isTopFrame?: boolean }): boolean => {
      const requestUrl = request.url || "";
      let parsed: URL;
      try {
        parsed = new URL(requestUrl);
      } catch {
        return false;
      }

      const isHttp =
        parsed.protocol.toLowerCase() === "https:" ||
        parsed.protocol.toLowerCase() === "http:";
      if (!isHttp) {
        void handleExternalRequest(requestUrl);
        return false;
      }

      const host = parsed.host.toLowerCase();
      const isTopFrame = request.isTopFrame ?? true;
      const isSameHost = host === webHost.toLowerCase();
      if (isSameHost || !isTopFrame) {
        return true;
      }

      void handleExternalRequest(requestUrl);
      return false;
    },
    [handleExternalRequest, webHost],
  );

  const diagnostics = useMemo(
    () => [
      `Host: ${webHost || "unknown"}`,
      `URL: ${webUrl}`,
      `Timeout: ${loadTimeoutMs}ms`,
      `Last HTTP: ${lastHttpStatus ?? "n/a"}`,
      `Last Error At: ${loadError?.occurredAtIso ?? "n/a"}`,
    ],
    [webHost, webUrl, loadTimeoutMs, lastHttpStatus, loadError?.occurredAtIso],
  );

  if (loadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View
          style={[
            styles.errorContainer,
            {
              paddingTop: Math.max(14, insets.top + 6),
              paddingBottom: Math.max(14, insets.bottom + 6),
            },
          ]}
        >
          <Text style={styles.errorTitle}>Web App Load Failed</Text>
          <Text style={styles.errorMessage}>{loadError.message}</Text>
          <View style={styles.diagnosticsPanel}>
            {diagnostics.map((line) => (
              <Text key={line} style={styles.diagnosticsLine}>
                {line}
              </Text>
            ))}
          </View>
          <View style={styles.buttonRow}>
            <Pressable onPress={handleReload} style={styles.reloadButton}>
              <Text style={styles.reloadButtonLabel}>Retry</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void handleExternalRequest(webUrl);
              }}
              style={styles.browserButton}
            >
              <Text style={styles.browserButtonLabel}>Open in Browser</Text>
            </Pressable>
            {allowFallbackToNative && onFallbackToNative ? (
              <Pressable
                onPress={onFallbackToNative}
                style={styles.fallbackButton}
              >
                <Text style={styles.fallbackButtonLabel}>Use Native Shell</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const showLoadingBanner = !isInteractive || isReloading || loadProgress < 1;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {showLoadingBanner ? (
          <View
            pointerEvents="none"
            style={[
              styles.loadingBanner,
              {
                paddingTop: Math.max(8, insets.top + 4),
              },
            ]}
          >
            <View style={styles.loadingHeaderRow}>
              <Text style={styles.loadingTitle}>Loading app experience...</Text>
              <Text style={styles.loadingMeta}>
                {Math.round(loadProgress * 100)}%
              </Text>
            </View>
            <View style={styles.loadingTrack}>
              <View
                style={[
                  styles.loadingFill,
                  { width: `${Math.max(8, loadProgress * 100)}%` },
                ]}
              />
            </View>
          </View>
        ) : null}
        <WebView
          ref={webViewRef}
          source={{ uri: webUrl }}
          style={styles.webView}
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator />
            </View>
          )}
          onLoadStart={() => {
            setLoadError(null);
            setIsReloading(true);
            setLoadProgress(0.05);
            startLoadTimeout();
          }}
          onLoadProgress={(event) => {
            const nextProgress = event.nativeEvent.progress || 0;
            setLoadProgress(nextProgress);
          }}
          onLoadEnd={() => {
            clearLoadTimeout();
            setIsReloading(false);
            setLoadProgress(1);
          }}
          onLoad={() => {
            markInteractive();
            pushAuthSessionToWebView(authSession);
          }}
          onMessage={(event: WebViewMessageEvent) => {
            try {
              const data = JSON.parse(event.nativeEvent.data) as {
                source?: string;
                type?: string;
              };
              if (
                data.source === "zero1-web" &&
                data.type === "native-auth-bridge-ready"
              ) {
                lastAuthFingerprintRef.current = null;
                pushAuthSessionToWebView(authSession);
              }
            } catch {
              // Ignore non-JSON messages from the web app.
            }
          }}
          onError={(event) => {
            clearLoadTimeout();
            const description =
              event.nativeEvent.description || "Unknown WebView error.";
            setLoadError({
              type: "network",
              message: description,
              url: event.nativeEvent.url || webUrl,
              occurredAtIso: new Date().toISOString(),
            });
          }}
          onHttpError={(event) => {
            clearLoadTimeout();
            setLastHttpStatus(event.nativeEvent.statusCode);
            setLoadError({
              type: "http",
              message: `HTTP ${event.nativeEvent.statusCode} while loading ${event.nativeEvent.url}`,
              url: event.nativeEvent.url,
              statusCode: event.nativeEvent.statusCode,
              occurredAtIso: new Date().toISOString(),
            });
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loadingBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 7,
  },
  loadingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loadingTitle: {
    color: "#1f2937",
    fontSize: 12,
    fontWeight: "700",
  },
  loadingMeta: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },
  loadingTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
    overflow: "hidden",
  },
  loadingFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "#0f766e",
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "#ffffff",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 14,
    textAlign: "center",
    color: "#334155",
    marginBottom: 14,
  },
  diagnosticsPanel: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    backgroundColor: "#f8fafc",
  },
  diagnosticsLine: {
    fontSize: 12,
    lineHeight: 18,
    color: "#0f172a",
    fontFamily: "monospace",
  },
  buttonRow: {
    width: "100%",
    gap: 10,
  },
  reloadButton: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
  },
  reloadButtonLabel: {
    color: "#ffffff",
    fontWeight: "600",
  },
  browserButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#0f766e",
    backgroundColor: "#f0fdfa",
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
  },
  browserButtonLabel: {
    color: "#115e59",
    fontWeight: "700",
  },
  fallbackButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
  },
  fallbackButtonLabel: {
    color: "#0f172a",
    fontWeight: "600",
  },
});
