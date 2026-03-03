import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MOBILE_ENV } from "../lib/env";
import { getOAuthRedirectUrl } from "../lib/authRedirect";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";
import { formatRelativeDate } from "./common/EntityCards";

export function AuthScreen() {
  const controller = useMobileApp();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const stackButtons = width < 390;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Math.max(insets.top, T.spacing.sm)}
      >
        <ScrollView
          contentContainerStyle={[
            styles.rootScrollContent,
            {
              paddingTop: Math.max(T.spacing.lg, insets.top + T.spacing.sm),
              paddingBottom: Math.max(T.spacing.xxl, insets.bottom + T.spacing.lg),
            },
          ]}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rootFrame}>
            <View style={styles.authHeroPanel}>
              <Text style={styles.heroEyebrow}>Zero1</Text>
              <Text style={styles.heroTitle}>Welcome back</Text>
              <Text style={styles.heroSubtitle}>
                Secure sign in keeps your library, highlights, and maps synced
                across devices.
              </Text>
            </View>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Sign in to continue</Text>
              <Text style={styles.panelSubtitle}>
                Continue with Google or Apple for the fastest flow.
              </Text>

              <View style={[styles.row, stackButtons && styles.rowStack]}>
                <Pressable
                  disabled={controller.busy}
                  onPress={() => void controller.startOAuth("google")}
                  style={[
                    styles.providerButton,
                    styles.googleButton,
                    controller.busy && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.providerButtonLabel}>Continue with Google</Text>
                </Pressable>
                <Pressable
                  disabled={controller.busy}
                  onPress={() => void controller.startOAuth("apple")}
                  style={[
                    styles.providerButton,
                    styles.appleButton,
                    controller.busy && styles.buttonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.providerButtonLabel,
                      styles.providerButtonLabelInverse,
                    ]}
                  >
                    Continue with Apple
                  </Text>
                </Pressable>
              </View>

              <View style={styles.authDividerRow}>
                <View style={styles.authDividerLine} />
                <Text style={styles.authDividerLabel}>or use email</Text>
                <View style={styles.authDividerLine} />
              </View>

              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor={T.colors.textMuted}
                style={styles.input}
                value={controller.email}
                onChangeText={controller.setEmail}
              />
              <TextInput
                autoCapitalize="none"
                autoComplete="password"
                placeholder="Password"
                placeholderTextColor={T.colors.textMuted}
                secureTextEntry
                style={styles.input}
                value={controller.password}
                onChangeText={controller.setPassword}
              />

              <View style={[styles.row, stackButtons && styles.rowStack]}>
                <Pressable
                  disabled={controller.busy}
                  onPress={() => void controller.signIn()}
                  style={[
                    styles.primaryButton,
                    controller.busy && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.primaryButtonLabel}>
                    {controller.busy ? "Signing in..." : "Sign in with email"}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={controller.busy}
                  onPress={() => void controller.sendMagicLink()}
                  style={[
                    styles.secondaryButton,
                    controller.busy && styles.buttonDisabled,
                  ]}
                >
                  <Text style={styles.secondaryButtonLabel}>Send magic link</Text>
                </Pressable>
              </View>

              <View style={styles.calloutMuted}>
                <Text style={styles.calloutMutedText}>
                  Callback: {getOAuthRedirectUrl()}
                </Text>
              </View>

              {controller.authError ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorCardText}>{controller.authError}</Text>
                </View>
              ) : null}
              {controller.authInfo ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoCardText}>{controller.authInfo}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function HomeScreen({
  nav,
}: {
  nav: {
    openLibrary: () => void;
    openBookmarks: () => void;
    openHighlights: () => void;
  };
}) {
  const controller = useMobileApp();
  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>Zero1 Mobile</Text>
        <Text style={styles.heroTitle}>
          Authenticated mobile shell is live.
        </Text>
        <Text style={styles.heroSubtitle}>
          Provider login, session restore, and protected API access now work on
          the iOS dev client.
        </Text>
        <View style={styles.row}>
          <Pressable
            disabled={controller.busy}
            onPress={() => void controller.refreshDashboard()}
            style={[
              styles.primaryButton,
              controller.busy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>Refresh dashboard</Text>
          </Pressable>
          <Pressable
            disabled={controller.busy}
            onPress={nav.openLibrary}
            style={[
              styles.secondaryButton,
              controller.busy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Open library</Text>
          </Pressable>
        </View>
        <View style={styles.row}>
          <Pressable
            disabled={controller.busy}
            onPress={nav.openBookmarks}
            style={[
              styles.secondaryButton,
              controller.busy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Bookmarks</Text>
          </Pressable>
          <Pressable
            disabled={controller.busy}
            onPress={nav.openHighlights}
            style={[
              styles.secondaryButton,
              controller.busy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Highlights</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Quick Stats</Text>
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Bookmarks</Text>
            <Text style={styles.statValue}>
              {controller.probeResult?.bookmarksCount ?? "-"}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Highlights</Text>
            <Text style={styles.statValue}>
              {controller.probeResult?.highlightsCount ?? "-"}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Connections</Text>
            <Text style={styles.statValue}>
              {controller.probeResult?.libraryConnectionsCount ?? "-"}
            </Text>
          </View>
        </View>
        {controller.probeError ? (
          <Text style={styles.error}>{controller.probeError}</Text>
        ) : null}
        {controller.libraryError ? (
          <Text style={styles.error}>{controller.libraryError}</Text>
        ) : null}
        {controller.bookmarksError ? (
          <Text style={styles.error}>{controller.bookmarksError}</Text>
        ) : null}
        {controller.highlightsError ? (
          <Text style={styles.error}>{controller.highlightsError}</Text>
        ) : null}
        {controller.libraryLoadedAt ? (
          <Text style={styles.caption}>
            Library synced {formatRelativeDate(controller.libraryLoadedAt)}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

export function AccountScreen() {
  const controller = useMobileApp();
  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Account</Text>
        <Text style={styles.meta}>{controller.authLabel}</Text>
        <Text style={styles.meta}>
          Session: {controller.session ? "active" : "none"} | Strict env:{" "}
          {String(MOBILE_ENV.STRICT_ENV)}
        </Text>
        <Text style={styles.meta}>API: {MOBILE_ENV.API_URL}</Text>
        <Text style={styles.meta}>Mode: {MOBILE_ENV.MODE}</Text>
        <Text style={styles.meta}>
          Google OAuth: {MOBILE_ENV.ENABLE_GOOGLE_OAUTH ? "enabled" : "off"} |
          Apple OAuth: {MOBILE_ENV.ENABLE_APPLE_OAUTH ? "enabled" : "off"}
        </Text>
        {controller.authError ? (
          <Text style={styles.error}>{controller.authError}</Text>
        ) : null}
        {controller.authInfo ? (
          <Text style={styles.info}>{controller.authInfo}</Text>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Session Actions</Text>
        <View style={styles.row}>
          <Pressable
            disabled={controller.busy}
            onPress={() => void controller.runProbe()}
            style={[
              styles.primaryButton,
              controller.busy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonLabel}>Run Protected Probe</Text>
          </Pressable>
          <Pressable
            disabled={controller.busy}
            onPress={() => void controller.signOut()}
            style={[
              styles.secondaryButton,
              controller.busy && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.secondaryButtonLabel}>Sign out</Text>
          </Pressable>
        </View>
        {controller.probeResult ? (
          <Text style={styles.caption}>
            Probe: {controller.probeResult.bookmarksCount} bookmarks,{" "}
            {controller.probeResult.highlightsCount} highlights,{" "}
            {controller.probeResult.libraryConnectionsCount} connections
          </Text>
        ) : null}
        {controller.probeError ? (
          <Text style={styles.error}>{controller.probeError}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
