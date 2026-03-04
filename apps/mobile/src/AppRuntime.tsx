import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { MobileRootNavigator } from "./navigation/MobileRootNavigator";
import { MobileAppProvider } from "./context/MobileAppContext";
import { useMobileAppController } from "./hooks/useMobileAppController";
import {
  AccountScreen,
  AuthScreen,
  MapFallbackScreen,
} from "./screens/AuthHomeAccountScreens";
import {
  BookmarksScreen,
  HighlightsScreen,
  LibraryScreen,
} from "./screens/DataListScreens";
import {
  BookmarkCreateScreen,
  BookmarkDetailScreen,
  HighlightCreateScreen,
  HighlightDetailScreen,
} from "./screens/DetailScreens";
import { WebAppShellScreen } from "./screens/WebAppShellScreen";
import { styles, T } from "./theme/mobileStyles";
import { MOBILE_ENV } from "./lib/env";
import { finishPerfSpan, startPerfSpan } from "./lib/perfTelemetry";
import { supabase } from "./lib/supabase";

WebBrowser.maybeCompleteAuthSession();
const coldStartSpanId = startPerfSpan("cold_start_to_interactive");
let coldStartMarked = false;

function markColdStartInteractive(meta?: Record<string, unknown>) {
  if (coldStartMarked) return;
  coldStartMarked = true;
  finishPerfSpan(coldStartSpanId, "success", meta);
}

function NativeAppRuntime({ onInteractive }: { onInteractive: () => void }) {
  const controller = useMobileAppController();

  useEffect(() => {
    const timer = setTimeout(() => {
      onInteractive();
    }, 0);

    return () => clearTimeout(timer);
  }, [onInteractive]);

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appBackground}>
        <View style={styles.backdropBlobA} />
        <View style={styles.backdropBlobB} />
        <MobileAppProvider value={controller}>
          <MobileRootNavigator
            isAuthenticated={Boolean(controller.user)}
            renderAuth={() => <AuthScreen />}
            renderLibrary={() => <LibraryScreen />}
            renderBookmarks={(nav) => <BookmarksScreen nav={nav} />}
            renderHighlights={(nav) => <HighlightsScreen nav={nav} />}
            renderAccount={() => <AccountScreen />}
            renderMapFallback={() => <MapFallbackScreen />}
            renderBookmarkCreate={() => <BookmarkCreateScreen />}
            renderBookmarkDetail={(bookmarkId) => (
              <BookmarkDetailScreen bookmarkId={bookmarkId} />
            )}
            renderHighlightCreate={() => <HighlightCreateScreen />}
            renderHighlightDetail={(highlightId) => (
              <HighlightDetailScreen highlightId={highlightId} />
            )}
          />
        </MobileAppProvider>
        {controller.busy ? (
          <View style={styles.globalBusyOverlay} pointerEvents="none">
            <ActivityIndicator color={T.colors.accentStrong} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function AppRuntime() {
  const [forceNativeShell, setForceNativeShell] = useState(false);
  const [launchWebShell, setLaunchWebShell] = useState(false);
  const [webShellSession, setWebShellSession] = useState<Session | null>(null);
  const webShellEnabled = MOBILE_ENV.WEB_SHELL_ENABLED;
  const webAppUrl = MOBILE_ENV.WEB_APP_URL;
  const webShellConfigured = webShellEnabled && Boolean(webAppUrl);
  const webShellAuthSession = useMemo(() => {
    if (!webShellSession?.access_token || !webShellSession.refresh_token) {
      return null;
    }
    return {
      accessToken: webShellSession.access_token,
      refreshToken: webShellSession.refresh_token,
    };
  }, [webShellSession]);

  useEffect(() => {
    if (!webShellConfigured || forceNativeShell) {
      return;
    }

    let isMounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setWebShellSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setWebShellSession(nextSession);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [forceNativeShell, webShellConfigured]);

  const canRenderWebShell =
    webShellConfigured &&
    launchWebShell &&
    !forceNativeShell &&
    Boolean(webShellAuthSession);

  if (canRenderWebShell) {
    return (
      <WebAppShellScreen
        webUrl={webAppUrl}
        webHost={MOBILE_ENV.WEB_APP_HOST}
        loadTimeoutMs={MOBILE_ENV.WEB_SHELL_TIMEOUT_MS}
        allowFallbackToNative={MOBILE_ENV.WEB_SHELL_FALLBACK_TO_NATIVE}
        authSession={webShellAuthSession}
        onFallbackToNative={() => {
          setForceNativeShell(true);
          setLaunchWebShell(false);
        }}
        onInteractive={() => {
          markColdStartInteractive({ mode: "web_shell" });
        }}
      />
    );
  }

  return (
    <NativeAppRuntime
      onInteractive={() => {
        markColdStartInteractive({
          mode: forceNativeShell ? "native_shell_fallback" : "native_shell",
        });
      }}
    />
  );
}
