import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCallback, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import type { WebView as WebViewType } from "react-native-webview";

interface WebAppShellScreenProps {
  webUrl: string;
}

export function WebAppShellScreen({ webUrl }: WebAppShellScreenProps) {
  const webViewRef = useRef<WebViewType>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleReload = useCallback(() => {
    setLoadError(null);
    webViewRef.current?.reload();
  }, []);

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Web App Load Failed</Text>
        <Text style={styles.errorMessage}>{loadError}</Text>
        <Pressable onPress={handleReload} style={styles.reloadButton}>
          <Text style={styles.reloadButtonLabel}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: webUrl }}
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loadingContainer}>
          <ActivityIndicator />
        </View>
      )}
      onError={(event) => {
        const description =
          event.nativeEvent.description || "Unknown webview error.";
        setLoadError(description);
      }}
      onHttpError={(event) => {
        setLoadError(
          `HTTP ${event.nativeEvent.statusCode} while loading ${event.nativeEvent.url}`,
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
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
    marginBottom: 16,
  },
  reloadButton: {
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  reloadButtonLabel: {
    color: "#ffffff",
    fontWeight: "600",
  },
});
