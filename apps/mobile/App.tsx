import { Component, type ReactNode, Suspense, lazy } from "react";
import { ScrollView, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LoadingDotsNative } from "./src/components/native/loading/LoadingDotsNative";
import { styles } from "./src/theme/mobileStyles";

const AppRuntime = lazy(() => import("./src/AppRuntime"));

interface BootBoundaryState {
  error: Error | null;
}

class BootErrorBoundary extends Component<
  { children: ReactNode },
  BootBoundaryState
> {
  state: BootBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BootBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[MOBILE BOOT] Startup failure captured by boundary.", error);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <ScrollView contentContainerStyle={styles.rootScrollContent}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Startup Error</Text>
          <Text style={styles.error}>{this.state.error.message}</Text>
          {this.state.error.stack ? (
            <Text style={styles.caption}>{this.state.error.stack}</Text>
          ) : null}
        </View>
      </ScrollView>
    );
  }
}

function BootFallback() {
  return (
    <View style={styles.globalBusyOverlay}>
      <View style={styles.panel}>
        <LoadingDotsNative label="Loading app experience..." />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BootErrorBoundary>
          <Suspense fallback={<BootFallback />}>
            <AppRuntime />
          </Suspense>
        </BootErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
