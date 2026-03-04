import type { ReactNode } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { MOBILE_TOKENS } from "../theme/tokens";

type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};

type AppStackParamList = {
  Tabs: undefined;
  BookmarkCreate: undefined;
  BookmarkDetail: { bookmarkId: string };
  HighlightCreate: undefined;
  HighlightDetail: { highlightId: string };
};

type AppTabsParamList = {
  Library: undefined;
  Bookmarks: undefined;
  Highlights: undefined;
  Account: undefined;
  MapFallback: undefined;
};

export interface MobileRootNavigatorProps {
  isAuthenticated: boolean;
  renderAuth: () => ReactNode;
  renderLibrary: () => ReactNode;
  renderBookmarks: (nav: {
    openCreate: () => void;
    openDetail: (bookmarkId: string) => void;
  }) => ReactNode;
  renderHighlights: (nav: {
    openCreate: () => void;
    openDetail: (highlightId: string) => void;
  }) => ReactNode;
  renderAccount: () => ReactNode;
  renderBookmarkCreate: () => ReactNode;
  renderBookmarkDetail: (bookmarkId: string) => ReactNode;
  renderHighlightCreate: () => ReactNode;
  renderHighlightDetail: (highlightId: string) => ReactNode;
  renderMapFallback: () => ReactNode;
}

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const Tabs = createBottomTabNavigator<AppTabsParamList>();

const T = MOBILE_TOKENS;

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: T.colors.canvas,
    card: T.colors.surfaceRaised,
    text: T.colors.text,
    border: T.colors.border,
    primary: T.colors.accentStrong,
  },
};

export function resolveRootFlow(
  isAuthenticated: boolean,
): keyof RootStackParamList {
  return isAuthenticated ? "App" : "Auth";
}

export const APP_DETAIL_ROUTES: Array<keyof AppStackParamList> = [
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
      initialRouteName="Library"
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: T.colors.surfaceRaised,
          borderTopColor: T.colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: T.typography.caption,
          fontWeight: "700",
        },
        tabBarActiveTintColor: T.colors.accentStrong,
        tabBarInactiveTintColor: T.colors.textMuted,
      }}
    >
      <Tabs.Screen name="Library" options={{ tabBarLabel: "Library" }}>
        {() => props.renderLibrary()}
      </Tabs.Screen>
      <Tabs.Screen name="Bookmarks" options={{ tabBarLabel: "Marks" }}>
        {({ navigation }) =>
          props.renderBookmarks({
            openCreate: () =>
              navigation.getParent()?.navigate("BookmarkCreate" as never),
            openDetail: (bookmarkId) =>
              navigation
                .getParent()
                ?.navigate("BookmarkDetail" as never, { bookmarkId } as never),
          })
        }
      </Tabs.Screen>
      <Tabs.Screen name="Highlights" options={{ tabBarLabel: "Light" }}>
        {({ navigation }) =>
          props.renderHighlights({
            openCreate: () =>
              navigation.getParent()?.navigate("HighlightCreate" as never),
            openDetail: (highlightId) =>
              navigation
                .getParent()
                ?.navigate(
                  "HighlightDetail" as never,
                  { highlightId } as never,
                ),
          })
        }
      </Tabs.Screen>
      <Tabs.Screen name="Account" options={{ tabBarLabel: "Account" }}>
        {() => props.renderAccount()}
      </Tabs.Screen>
      <Tabs.Screen name="MapFallback" options={{ tabBarLabel: "Map (Beta)" }}>
        {() => props.renderMapFallback()}
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
        headerTintColor: T.colors.canvas,
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
    renderLibrary: props.renderLibrary,
    renderBookmarks: props.renderBookmarks,
    renderHighlights: props.renderHighlights,
    renderAccount: props.renderAccount,
    renderBookmarkCreate: props.renderBookmarkCreate,
    renderBookmarkDetail: props.renderBookmarkDetail,
    renderHighlightCreate: props.renderHighlightCreate,
    renderHighlightDetail: props.renderHighlightDetail,
    renderMapFallback: props.renderMapFallback,
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
