import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
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
import { styles, T } from "./theme/mobileStyles";
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
  return (
    <NativeAppRuntime
      onInteractive={() => {
        markColdStartInteractive({ mode: "native_shell" });
      }}
    />
  );
}
