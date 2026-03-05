import { useEffect } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { MobileRootNavigator } from "./navigation/MobileRootNavigator";
import { MobileAppProvider } from "./context/MobileAppContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { useMobileAppController } from "./hooks/useMobileAppController";
import { ToastViewport } from "./components/native/ToastViewport";
import { AccountScreen, AuthScreen } from "./screens/AuthHomeAccountScreens";
import { LibraryScreen } from "./screens/DataListScreens";
import { ReaderScreen } from "./screens/ReaderScreen";
import { ChatScreen, MapViewerScreen } from "./screens/ChatMapScreens";
import {
  BookmarkCreateScreen,
  BookmarkDetailScreen,
  HighlightCreateScreen,
  HighlightDetailScreen,
  LibraryMapCreateScreen,
} from "./screens/DetailScreens";
import { styles } from "./theme/mobileStyles";
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
  const { showToast } = useToast();
  const controller = useMobileAppController({
    onToast: showToast,
  });

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
            renderReader={(nav) => <ReaderScreen nav={nav} />}
            renderChat={(nav) => <ChatScreen nav={nav} />}
            renderLibrary={(nav) => <LibraryScreen nav={nav} />}
            renderAccount={() => <AccountScreen />}
            renderMapViewer={(payload) => (
              <MapViewerScreen title={payload.title} bundle={payload.bundle} />
            )}
            renderLibraryMapCreate={() => <LibraryMapCreateScreen />}
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
        <ToastViewport />
      </View>
    </View>
  );
}

export default function AppRuntime() {
  return (
    <ToastProvider>
      <NativeAppRuntime
        onInteractive={() => {
          markColdStartInteractive({ mode: "native_shell" });
        }}
      />
    </ToastProvider>
  );
}
