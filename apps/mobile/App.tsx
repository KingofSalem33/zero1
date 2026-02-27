import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { MobileRootNavigator } from "./src/navigation/MobileRootNavigator";
import { MobileAppProvider } from "./src/context/MobileAppContext";
import { useMobileAppController } from "./src/hooks/useMobileAppController";
import {
  AccountScreen,
  AuthScreen,
  HomeScreen,
} from "./src/screens/AuthHomeAccountScreens";
import {
  BookmarksScreen,
  HighlightsScreen,
  LibraryScreen,
} from "./src/screens/DataListScreens";
import {
  BookmarkCreateScreen,
  BookmarkDetailScreen,
  HighlightCreateScreen,
  HighlightDetailScreen,
} from "./src/screens/DetailScreens";
import { styles, T } from "./src/theme/mobileStyles";

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  const controller = useMobileAppController();

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
