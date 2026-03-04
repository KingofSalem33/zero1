import {
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { ActionButton } from "../components/native/ActionButton";
import { SurfaceCard } from "../components/native/SurfaceCard";
import { MOBILE_ENV } from "../lib/env";
import { getOAuthRedirectUrl } from "../lib/authRedirect";
import { useMobileApp } from "../context/MobileAppContext";
import { styles, T } from "../theme/mobileStyles";

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
              paddingBottom: Math.max(
                T.spacing.xxl,
                insets.bottom + T.spacing.lg,
              ),
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

            <SurfaceCard>
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
                  <Text style={styles.providerButtonLabel}>
                    Continue with Google
                  </Text>
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
                <ActionButton
                  disabled={controller.busy}
                  label={controller.busy ? "Signing in..." : "Sign in with email"}
                  onPress={() => void controller.signIn()}
                  variant="primary"
                />
                <ActionButton
                  disabled={controller.busy}
                  label="Send magic link"
                  onPress={() => void controller.sendMagicLink()}
                  variant="secondary"
                />
              </View>

              <View style={styles.calloutMuted}>
                <Text style={styles.calloutMutedText}>
                  Callback: {getOAuthRedirectUrl()}
                </Text>
              </View>

              {controller.authError ? (
                <View style={styles.errorCard}>
                  <Text style={styles.errorCardText}>
                    {controller.authError}
                  </Text>
                </View>
              ) : null}
              {controller.authInfo ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoCardText}>{controller.authInfo}</Text>
                </View>
              ) : null}
            </SurfaceCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AccountScreen() {
  const controller = useMobileApp();
  const showDiagnostics = MOBILE_ENV.MODE !== "production";

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>Account</Text>
        <Text style={styles.meta}>Signed in as {controller.authLabel}</Text>
        <Text style={styles.meta}>
          Session status: {controller.session ? "Active" : "Not signed in"}
        </Text>
        {controller.authError ? (
          <Text style={styles.error}>{controller.authError}</Text>
        ) : null}
        {controller.authInfo ? (
          <Text style={styles.info}>{controller.authInfo}</Text>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <Text style={styles.panelTitle}>Session actions</Text>
        <View style={styles.row}>
          <ActionButton
            disabled={controller.busy}
            label="Run Protected Probe"
            onPress={() => void controller.runProbe()}
            variant="primary"
          />
          <ActionButton
            disabled={controller.busy}
            label="Sign out"
            onPress={() => void controller.signOut()}
            variant="secondary"
          />
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
      </SurfaceCard>

      {showDiagnostics ? (
        <SurfaceCard>
          <Text style={styles.panelTitle}>Diagnostics</Text>
          <Text style={styles.meta}>Mode: {MOBILE_ENV.MODE}</Text>
          <Text style={styles.meta}>API: {MOBILE_ENV.API_URL}</Text>
          <Text style={styles.meta}>
            Google OAuth:{" "}
            {MOBILE_ENV.ENABLE_GOOGLE_OAUTH ? "enabled" : "off"} | Apple OAuth:{" "}
            {MOBILE_ENV.ENABLE_APPLE_OAUTH ? "enabled" : "off"}
          </Text>
          <Text style={styles.meta}>
            Strict env validation: {String(MOBILE_ENV.STRICT_ENV)}
          </Text>
        </SurfaceCard>
      ) : null}
    </ScrollView>
  );
}

export function MapFallbackScreen() {
  const webLibraryUrl = MOBILE_ENV.WEB_APP_URL
    ? `${MOBILE_ENV.WEB_APP_URL}/library`
    : null;

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <SurfaceCard>
        <Text style={styles.panelTitle}>Map (Beta Fallback)</Text>
        <Text style={styles.panelSubtitle}>
          Native map UX is in progress. Use the web fallback for map workflows
          while native routes land.
        </Text>
        <Text style={styles.meta}>
          Fallback URL: {webLibraryUrl ?? "Not configured"}
        </Text>
        <View style={styles.row}>
          <ActionButton
            disabled={!webLibraryUrl}
            label="Open map fallback in browser"
            onPress={() => {
              if (!webLibraryUrl) return;
              void Linking.openURL(webLibraryUrl);
            }}
            variant="primary"
          />
        </View>
        <Text style={styles.caption}>
          This keeps core mobile flows native while map remains isolated to beta
          fallback.
        </Text>
      </SurfaceCard>
    </ScrollView>
  );
}
