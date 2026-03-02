import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { MobileRootNavigator } from "./navigation/MobileRootNavigator";
import { MobileAppProvider } from "./context/MobileAppContext";
import { useMobileAppController } from "./hooks/useMobileAppController";
import {
  AccountScreen,
  AuthScreen,
  HomeScreen,
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
      <StatusBar style="dark" />
      <View style={styles.appBackground}>
        <View style={styles.backdropBlobA} />
        <View style={styles.backdropBlobB} />
        <MobileAppProvider value={controller}>
          <MobileRootNavigator
            isAuthenticated={Boolean(controller.user)}
            renderAuth={() => <AuthScreen />}
            renderHome={(nav) => <HomeScreen nav={nav} />}
            renderLibrary={() => <LibraryScreen />}
            renderBookmarks={(nav) => <BookmarksScreen nav={nav} />}
            renderHighlights={(nav) => <HighlightsScreen nav={nav} />}
            renderAccount={() => <AccountScreen />}
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
  const webShellEnabled = MOBILE_ENV.WEB_SHELL_ENABLED;
  const webAppUrl = MOBILE_ENV.WEB_APP_URL;

  if (webShellEnabled && webAppUrl && !forceNativeShell) {
    return (
      <WebAppShellScreen
        webUrl={webAppUrl}
        webHost={MOBILE_ENV.WEB_APP_HOST}
        loadTimeoutMs={MOBILE_ENV.WEB_SHELL_TIMEOUT_MS}
        allowFallbackToNative={MOBILE_ENV.WEB_SHELL_FALLBACK_TO_NATIVE}
        onFallbackToNative={() => {
          setForceNativeShell(true);
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
