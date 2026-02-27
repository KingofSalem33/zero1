import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { MobileRootNavigator } from "./src/navigation/MobileRootNavigator";
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
        <MobileRootNavigator
          isAuthenticated={Boolean(controller.user)}
          renderAuth={() => <AuthScreen controller={controller} />}
          renderHome={(nav) => <HomeScreen controller={controller} nav={nav} />}
          renderLibrary={() => <LibraryScreen controller={controller} />}
          renderBookmarks={(nav) => (
            <BookmarksScreen controller={controller} nav={nav} />
          )}
          renderHighlights={(nav) => (
            <HighlightsScreen controller={controller} nav={nav} />
          )}
          renderAccount={() => <AccountScreen controller={controller} />}
          renderBookmarkCreate={() => (
            <BookmarkCreateScreen controller={controller} />
          )}
          renderBookmarkDetail={(bookmarkId) => (
            <BookmarkDetailScreen
              controller={controller}
              bookmarkId={bookmarkId}
            />
          )}
          renderHighlightCreate={() => (
            <HighlightCreateScreen controller={controller} />
          )}
          renderHighlightDetail={(highlightId) => (
            <HighlightDetailScreen
              controller={controller}
              highlightId={highlightId}
            />
          )}
        />
        {controller.busy ? (
          <View style={styles.globalBusyOverlay} pointerEvents="none">
            <ActivityIndicator color={T.colors.accentStrong} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
