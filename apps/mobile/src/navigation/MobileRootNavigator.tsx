import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  NavigationContainer,
  DarkTheme,
  type RouteProp,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { IconButton } from "../components/native/IconButton";
import { MOBILE_TOKENS } from "../theme/tokens";
import type { MobileGoDeeperPayload } from "../types/chat";

type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

type AppMode = "Reader" | "Chat" | "Library" | "Account";

type AppStackParamList = {
  Tabs:
    | { mode?: AppMode; prompt?: MobileGoDeeperPayload; autoSend?: boolean }
    | undefined;
  MapViewer:
    | { title?: string; bundle?: unknown; traceQuery?: string }
    | undefined;
  HighlightCreate: undefined;
  HighlightDetail: { highlightId: string };
};

export interface MobileRootNavigatorProps {
  isAuthenticated: boolean;
  renderAuth: () => ReactNode;
  renderReader: (nav: {
    openChat: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
    openMapViewer: (
      title?: string,
      bundle?: unknown,
      traceQuery?: string,
    ) => void;
    openModeMenu: () => void;
  }) => ReactNode;
  renderChat: (nav: {
    openMapViewer: (
      title?: string,
      bundle?: unknown,
      traceQuery?: string,
    ) => void;
    openReader: (book: string, chapter: number) => void;
    isActive: boolean;
    pendingPrompt?: MobileGoDeeperPayload;
    autoSend?: boolean;
    clearPendingPrompt: () => void;
  }) => ReactNode;
  renderLibrary: (nav: {
    openHighlightCreate: () => void;
    openHighlightDetail: (highlightId: string) => void;
    openMapViewer: (
      title?: string,
      bundle?: unknown,
      traceQuery?: string,
    ) => void;
    openChat: (prompt: MobileGoDeeperPayload, autoSend?: boolean) => void;
  }) => ReactNode;
  renderAccount: () => ReactNode;
  renderMapViewer: (payload: {
    title?: string;
    bundle?: unknown;
    traceQuery?: string;
  }) => ReactNode;
  renderHighlightCreate: () => ReactNode;
  renderHighlightDetail: (highlightId: string) => ReactNode;
}

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

const T = MOBILE_TOKENS;

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: T.colors.canvas,
    card: T.colors.surfaceRaised,
    text: T.colors.text,
    border: T.colors.border,
    primary: T.colors.accent,
  },
};

const MODE_META: Record<
  Exclude<AppMode, "Account">,
  { label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  Reader: { label: "Bible", icon: "book-outline" },
  Chat: { label: "Chat", icon: "chatbubble-outline" },
  Library: { label: "Library", icon: "library-outline" },
};

export function resolveRootFlow(
  isAuthenticated: boolean,
): keyof RootStackParamList {
  return isAuthenticated ? "App" : "Auth";
}

export const APP_DETAIL_ROUTES: Array<keyof AppStackParamList> = [
  "MapViewer",
  "HighlightCreate",
  "HighlightDetail",
];

function drawerButtonStyle(active: boolean): ViewStyle {
  return {
    ...localStyles.drawerButton,
    ...(active
      ? {
          borderColor: T.colors.accent,
          backgroundColor: T.colors.accentSoft,
        }
      : null),
  };
}

function ModeShellScreen({
  route,
  navigation,
  props,
}: {
  route: RouteProp<AppStackParamList, "Tabs">;
  navigation: NativeStackNavigationProp<AppStackParamList, "Tabs">;
  props: Omit<MobileRootNavigatorProps, "isAuthenticated" | "renderAuth">;
}) {
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<AppMode>(
    route.params?.mode ?? "Reader",
  );
  const [pendingPrompt, setPendingPrompt] = useState<
    MobileGoDeeperPayload | undefined
  >(route.params?.prompt);
  const [pendingAutoSend, setPendingAutoSend] = useState<boolean | undefined>(
    route.params?.autoSend,
  );

  useEffect(() => {
    if (route.params?.mode) {
      setActiveMode(route.params.mode);
    }
    if (route.params?.prompt !== undefined) {
      setPendingPrompt(route.params.prompt);
      setPendingAutoSend(route.params?.autoSend);
      setActiveMode("Chat");
    }
  }, [route.params?.mode, route.params?.prompt, route.params?.autoSend]);

  useEffect(() => {
    if (activeMode !== "Chat") {
      Keyboard.dismiss();
    }
  }, [activeMode]);

  const viewTitle = useMemo(() => {
    if (activeMode === "Reader") return "";
    if (activeMode === "Chat") return "";
    if (activeMode === "Library") return "Library";
    return "Settings";
  }, [activeMode]);

  function openChat(prompt: MobileGoDeeperPayload, autoSend = true) {
    setPendingPrompt(prompt);
    setPendingAutoSend(autoSend);
    setActiveMode("Chat");
  }

  function openMapViewer(
    title?: string,
    bundle?: unknown,
    traceQuery?: string,
  ) {
    navigation.navigate("MapViewer", { title, bundle, traceQuery });
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={localStyles.shellSafeArea}>
      <View style={localStyles.shellRoot}>
        {activeMode === "Reader" ? null : (
          <View style={localStyles.topBar}>
            <IconButton
              accessibilityLabel="Open mode menu"
              onPress={() => {
                Keyboard.dismiss();
                setDrawerOpen(true);
              }}
              style={localStyles.topBarIconButton}
              icon={
                <Ionicons color={T.colors.textMuted} name="menu" size={20} />
              }
            />
            <Text style={localStyles.topBarTitle}>{viewTitle}</Text>
            <View style={localStyles.topBarSpacer} />
          </View>
        )}

        <View style={localStyles.modeContentWrap}>
          <View
            pointerEvents={activeMode === "Reader" ? "auto" : "none"}
            style={[
              localStyles.modePanel,
              activeMode === "Reader"
                ? localStyles.modePanelVisible
                : localStyles.modePanelHidden,
            ]}
          >
            {props.renderReader({
              openChat,
              openMapViewer,
              openModeMenu: () => setDrawerOpen(true),
            })}
          </View>

          <View
            pointerEvents={activeMode === "Chat" ? "auto" : "none"}
            style={[
              localStyles.modePanel,
              activeMode === "Chat"
                ? localStyles.modePanelVisible
                : localStyles.modePanelHidden,
            ]}
          >
            {props.renderChat({
              openMapViewer,
              openReader: () => setActiveMode("Reader"),
              isActive: activeMode === "Chat",
              pendingPrompt,
              autoSend: pendingAutoSend,
              clearPendingPrompt: () => {
                setPendingPrompt(undefined);
                setPendingAutoSend(undefined);
              },
            })}
          </View>

          <View
            pointerEvents={activeMode === "Library" ? "auto" : "none"}
            style={[
              localStyles.modePanel,
              activeMode === "Library"
                ? localStyles.modePanelVisible
                : localStyles.modePanelHidden,
            ]}
          >
            {props.renderLibrary({
              openHighlightCreate: () => navigation.navigate("HighlightCreate"),
              openHighlightDetail: (highlightId) =>
                navigation.navigate("HighlightDetail", { highlightId }),
              openMapViewer,
              openChat,
            })}
          </View>

          <View
            pointerEvents={activeMode === "Account" ? "auto" : "none"}
            style={[
              localStyles.modePanel,
              activeMode === "Account"
                ? localStyles.modePanelVisible
                : localStyles.modePanelHidden,
            ]}
          >
            {props.renderAccount()}
          </View>
        </View>

        {drawerOpen ? (
          <View style={localStyles.drawerOverlay}>
            <View
              style={[localStyles.drawerPanel, { paddingTop: insets.top + 8 }]}
            >
              <View style={localStyles.drawerHeaderRow}>
                <Text style={localStyles.drawerTitle}>Biblelot</Text>
                <IconButton
                  accessibilityLabel="Close mode menu"
                  onPress={() => {
                    Keyboard.dismiss();
                    setDrawerOpen(false);
                  }}
                  style={localStyles.drawerCloseButton}
                  icon={
                    <Ionicons
                      color={T.colors.textMuted}
                      name="close"
                      size={20}
                    />
                  }
                />
              </View>

              <View style={localStyles.drawerModesWrap}>
                {Object.entries(MODE_META).map(([key, meta]) => {
                  const modeKey = key as Exclude<AppMode, "Account">;
                  const active = activeMode === modeKey;
                  return (
                    <Pressable
                      key={modeKey}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`Open ${meta.label}`}
                      onPress={() => {
                        Keyboard.dismiss();
                        setActiveMode(modeKey);
                        setDrawerOpen(false);
                      }}
                      style={drawerButtonStyle(active)}
                    >
                      <Ionicons
                        color={active ? T.colors.accent : T.colors.textMuted}
                        name={meta.icon}
                        size={18}
                      />
                      <Text
                        style={[
                          localStyles.drawerButtonLabel,
                          active ? localStyles.drawerButtonLabelActive : null,
                        ]}
                      >
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={localStyles.drawerFooter}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeMode === "Account" }}
                  accessibilityLabel="Open settings"
                  onPress={() => {
                    Keyboard.dismiss();
                    setActiveMode("Account");
                    setDrawerOpen(false);
                  }}
                  style={drawerButtonStyle(activeMode === "Account")}
                >
                  <Ionicons
                    color={
                      activeMode === "Account"
                        ? T.colors.accent
                        : T.colors.textMuted
                    }
                    name="person-circle-outline"
                    size={18}
                  />
                  <Text
                    style={[
                      localStyles.drawerButtonLabel,
                      activeMode === "Account"
                        ? localStyles.drawerButtonLabelActive
                        : null,
                    ]}
                  >
                    Settings
                  </Text>
                </Pressable>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close mode menu"
              onPress={() => {
                Keyboard.dismiss();
                setDrawerOpen(false);
              }}
              style={localStyles.drawerBackdrop}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function AppStackNavigator(
  props: Omit<MobileRootNavigatorProps, "isAuthenticated" | "renderAuth">,
) {
  return (
    <AppStack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: T.colors.ink,
        },
        headerTintColor: T.colors.text,
        headerTitleStyle: {
          fontWeight: "800",
        },
        contentStyle: {
          backgroundColor: T.colors.canvas,
        },
      }}
    >
      <AppStack.Screen name="Tabs" options={{ headerShown: false }}>
        {({ navigation, route }) => (
          <ModeShellScreen
            navigation={navigation}
            props={props}
            route={route}
          />
        )}
      </AppStack.Screen>
      <AppStack.Screen
        name="MapViewer"
        options={({ route }) => ({ title: route.params?.title || "Map" })}
      >
        {({ route }) =>
          props.renderMapViewer({
            title: route.params?.title,
            bundle: route.params?.bundle,
            traceQuery: route.params?.traceQuery,
          })
        }
      </AppStack.Screen>
      <AppStack.Screen
        name="HighlightCreate"
        options={{ title: "New Highlight" }}
      >
        {() => props.renderHighlightCreate()}
      </AppStack.Screen>
      <AppStack.Screen
        name="HighlightDetail"
        options={{ title: "Highlight Detail" }}
      >
        {({ route }) => props.renderHighlightDetail(route.params.highlightId)}
      </AppStack.Screen>
    </AppStack.Navigator>
  );
}

export function MobileRootNavigator(props: MobileRootNavigatorProps) {
  const rootFlow = resolveRootFlow(props.isAuthenticated);
  const appProps = {
    renderReader: props.renderReader,
    renderChat: props.renderChat,
    renderLibrary: props.renderLibrary,
    renderAccount: props.renderAccount,
    renderMapViewer: props.renderMapViewer,
    renderHighlightCreate: props.renderHighlightCreate,
    renderHighlightDetail: props.renderHighlightDetail,
  };

  return (
    <NavigationContainer theme={navTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {rootFlow === "App" ? (
          <RootStack.Screen name="App">
            {() => <AppStackNavigator {...appProps} />}
          </RootStack.Screen>
        ) : (
          <RootStack.Screen name="Auth">
            {() => props.renderAuth()}
          </RootStack.Screen>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const localStyles = StyleSheet.create({
  shellSafeArea: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  shellRoot: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  topBar: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(24,24,27,0.94)",
  },
  topBarIconButton: {
    width: T.touchTarget.min,
    height: T.touchTarget.min,
    borderRadius: T.radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(39,39,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    textAlign: "center",
    color: T.colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  topBarSpacer: {
    width: T.touchTarget.min,
    height: T.touchTarget.min,
  },
  modeContentWrap: {
    flex: 1,
    position: "relative",
  },
  modePanel: {
    ...StyleSheet.absoluteFillObject,
  },
  modePanelVisible: {
    display: "flex",
  },
  modePanelHidden: {
    display: "none",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    zIndex: 50,
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawerPanel: {
    width: "84%",
    maxWidth: 340,
    backgroundColor: T.colors.ink,
    borderRightWidth: 1,
    borderColor: T.colors.border,
    paddingHorizontal: T.spacing.md,
    paddingBottom: T.spacing.lg,
  },
  drawerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: T.spacing.sm,
    marginBottom: T.spacing.md,
  },
  drawerTitle: {
    color: T.colors.text,
    fontWeight: "800",
    fontSize: T.typography.subheading,
  },
  drawerCloseButton: {
    width: T.touchTarget.min,
    height: T.touchTarget.min,
  },
  drawerModesWrap: {
    gap: T.spacing.sm,
  },
  drawerButton: {
    minHeight: T.touchTarget.min,
    borderRadius: T.radius.md,
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
    paddingHorizontal: T.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: T.spacing.sm,
  },
  drawerButtonLabel: {
    color: T.colors.text,
    fontWeight: "700",
    fontSize: T.typography.body,
  },
  drawerButtonLabelActive: {
    color: T.colors.accent,
  },
  drawerFooter: {
    marginTop: "auto",
    paddingTop: T.spacing.lg,
  },
});
