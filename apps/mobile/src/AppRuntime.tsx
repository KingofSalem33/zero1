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

function NativeAppRuntime() {
  const controller = useMobileAppController();

  useEffect(() => {
    const timer = setTimeout(() => {
      finishPerfSpan(coldStartSpanId, "success");
    }, 0);

    return () => clearTimeout(timer);
  }, []);

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
  const webAppUrl = MOBILE_ENV.WEB_APP_URL;

  useEffect(() => {
    if (!webAppUrl) {
      return;
    }
    const timer = setTimeout(() => {
      finishPerfSpan(coldStartSpanId, "success", { mode: "web_shell" });
    }, 0);
    return () => clearTimeout(timer);
  }, [webAppUrl]);

  if (webAppUrl) {
    return <WebAppShellScreen webUrl={webAppUrl} />;
  }

  return <NativeAppRuntime />;
}
