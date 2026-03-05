import type { ReactNode } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { MOBILE_TOKENS } from "../theme/tokens";

type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

type AppStackParamList = {
  Tabs: undefined;
  MapViewer: { title?: string; bundle?: unknown } | undefined;
  LibraryMapCreate: undefined;
  BookmarkCreate: undefined;
  BookmarkDetail: { bookmarkId: string };
  HighlightCreate: undefined;
  HighlightDetail: { highlightId: string };
};

type ChatRouteParams = {
  prompt?: string;
  autoSend?: boolean;
};

type AppTabsParamList = {
  Reader: undefined;
  Chat: ChatRouteParams | undefined;
  Library: undefined;
  Account: undefined;
};

export interface MobileRootNavigatorProps {
  isAuthenticated: boolean;
  renderAuth: () => ReactNode;
  renderReader: (nav: {
    openChat: (prompt: string, autoSend?: boolean) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
  }) => ReactNode;
  renderChat: (nav: {
    openMapViewer: (title?: string, bundle?: unknown) => void;
    openReader: (book: string, chapter: number) => void;
    pendingPrompt?: string;
    autoSend?: boolean;
    clearPendingPrompt: () => void;
  }) => ReactNode;
  renderLibrary: (nav: {
    openMapCreate: () => void;
    openBookmarkCreate: () => void;
    openBookmarkDetail: (bookmarkId: string) => void;
    openHighlightCreate: () => void;
    openHighlightDetail: (highlightId: string) => void;
    openMapViewer: (title?: string, bundle?: unknown) => void;
    openChat: (prompt: string, autoSend?: boolean) => void;
  }) => ReactNode;
  renderAccount: () => ReactNode;
  renderMapViewer: (payload: { title?: string; bundle?: unknown }) => ReactNode;
  renderLibraryMapCreate: () => ReactNode;
  renderBookmarkCreate: () => ReactNode;
  renderBookmarkDetail: (bookmarkId: string) => ReactNode;
  renderHighlightCreate: () => ReactNode;
  renderHighlightDetail: (highlightId: string) => ReactNode;
}

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<AppTabsParamList>();

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

function resolveTabIcon(
  route: keyof AppTabsParamList,
  focused: boolean,
): keyof typeof Ionicons.glyphMap {
  switch (route) {
    case "Reader":
      return focused ? "document-text" : "document-text-outline";
    case "Chat":
      return focused ? "chatbubble" : "chatbubble-outline";
    case "Library":
      return focused ? "book" : "book-outline";
    case "Account":
      return focused ? "person-circle" : "person-circle-outline";
    default:
      return "ellipse";
  }
}

export function resolveRootFlow(
  isAuthenticated: boolean,
): keyof RootStackParamList {
  return isAuthenticated ? "App" : "Auth";
}

export const APP_DETAIL_ROUTES: Array<keyof AppStackParamList> = [
  "MapViewer",
  "LibraryMapCreate",
  "BookmarkCreate",
  "BookmarkDetail",
  "HighlightCreate",
  "HighlightDetail",
];

function AppTabsNavigator(
  props: Omit<MobileRootNavigatorProps, "isAuthenticated" | "renderAuth">,
) {
  return (
    <Tabs.Navigator
      initialRouteName="Reader"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: T.colors.surfaceRaised,
          borderTopColor: T.colors.border,
          height: 66,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: T.typography.caption,
          fontWeight: "700",
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarIcon: ({ color, focused, size }) => (
          <Ionicons
            name={resolveTabIcon(route.name, focused)}
            size={size}
            color={color}
          />
        ),
        tabBarActiveTintColor: T.colors.accent,
        tabBarInactiveTintColor: T.colors.textMuted,
      })}
    >
      <Tabs.Screen name="Reader" options={{ tabBarLabel: "Reader" }}>
        {({ navigation }) =>
          props.renderReader({
            openChat: (prompt, autoSend = true) =>
              navigation.navigate("Chat", { prompt, autoSend }),
            openMapViewer: (title, bundle) =>
              navigation
                .getParent()
                ?.navigate("MapViewer", { title, bundle } as never),
          })
        }
      </Tabs.Screen>
      <Tabs.Screen name="Chat" options={{ tabBarLabel: "Chat" }}>
        {({ navigation, route }) =>
          props.renderChat({
            openMapViewer: (title, bundle) =>
              navigation
                .getParent()
                ?.navigate("MapViewer", { title, bundle } as never),
            openReader: (_book, _chapter) => navigation.navigate("Reader"),
            pendingPrompt: route.params?.prompt,
            autoSend: route.params?.autoSend,
            clearPendingPrompt: () =>
              navigation.setParams({
                prompt: undefined,
                autoSend: undefined,
              }),
          })
        }
      </Tabs.Screen>
      <Tabs.Screen name="Library" options={{ tabBarLabel: "Library" }}>
        {({ navigation }) =>
          props.renderLibrary({
            openMapCreate: () =>
              navigation.getParent()?.navigate("LibraryMapCreate" as never),
            openBookmarkCreate: () =>
              navigation.getParent()?.navigate("BookmarkCreate" as never),
            openBookmarkDetail: (bookmarkId) =>
              navigation
                .getParent()
                ?.navigate("BookmarkDetail" as never, { bookmarkId } as never),
            openHighlightCreate: () =>
              navigation.getParent()?.navigate("HighlightCreate" as never),
            openHighlightDetail: (highlightId) =>
              navigation
                .getParent()
                ?.navigate(
                  "HighlightDetail" as never,
                  { highlightId } as never,
                ),
            openMapViewer: (title, bundle) =>
              navigation
                .getParent()
                ?.navigate("MapViewer", { title, bundle } as never),
            openChat: (prompt, autoSend = true) =>
              navigation.navigate("Chat", { prompt, autoSend }),
          })
        }
      </Tabs.Screen>
      <Tabs.Screen name="Account" options={{ tabBarLabel: "Account" }}>
        {() => props.renderAccount()}
      </Tabs.Screen>
    </Tabs.Navigator>
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
        {() => <AppTabsNavigator {...props} />}
      </AppStack.Screen>
      <AppStack.Screen
        name="MapViewer"
        options={({ route }) => ({ title: route.params?.title || "Map" })}
      >
        {({ route }) =>
          props.renderMapViewer({
            title: route.params?.title,
            bundle: route.params?.bundle,
          })
        }
      </AppStack.Screen>
      <AppStack.Screen name="LibraryMapCreate" options={{ title: "New Map" }}>
        {() => props.renderLibraryMapCreate()}
      </AppStack.Screen>
      <AppStack.Screen
        name="BookmarkCreate"
        options={{ title: "New Bookmark" }}
      >
        {() => props.renderBookmarkCreate()}
      </AppStack.Screen>
      <AppStack.Screen
        name="BookmarkDetail"
        options={{ title: "Bookmark Detail" }}
      >
        {({ route }) => props.renderBookmarkDetail(route.params.bookmarkId)}
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
    renderLibraryMapCreate: props.renderLibraryMapCreate,
    renderBookmarkCreate: props.renderBookmarkCreate,
    renderBookmarkDetail: props.renderBookmarkDetail,
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
