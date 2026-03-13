function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (!value || value.trim().length === 0) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function parseCsv(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

function parseNumber(
  value: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (!value || value.trim().length === 0) {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

const mode = process.env.NODE_ENV || "development";
const isProduction = mode === "production";
const strictEnv = parseBoolean(process.env.EXPO_PUBLIC_STRICT_ENV, false);

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || "";
const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const rawMagicLinkRedirectTo =
  process.env.EXPO_PUBLIC_MAGIC_LINK_REDIRECT_TO || "";
const rawEnableGoogleOAuth = process.env.EXPO_PUBLIC_ENABLE_GOOGLE_OAUTH || "";
const rawEnableAppleOAuth = process.env.EXPO_PUBLIC_ENABLE_APPLE_OAUTH || "";
const rawSentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || "";
const rawWebAppUrl = process.env.EXPO_PUBLIC_WEB_APP_URL || "";
const rawEnableWebShell = process.env.EXPO_PUBLIC_ENABLE_WEB_SHELL || "";
const rawWebShellAllowAnyHost =
  process.env.EXPO_PUBLIC_WEB_SHELL_ALLOW_ANY_HOST || "";
const rawWebAppAllowedHosts =
  process.env.EXPO_PUBLIC_WEB_APP_ALLOWED_HOSTS || "biblelot.vercel.app";
const rawWebShellFallbackToNative =
  process.env.EXPO_PUBLIC_WEB_SHELL_FALLBACK_TO_NATIVE || "";
const rawWebShellTimeoutMs = process.env.EXPO_PUBLIC_WEB_SHELL_TIMEOUT_MS || "";

const normalizedApiUrl = trimTrailingSlashes(rawApiUrl);
const normalizedSupabaseUrl = trimTrailingSlashes(rawSupabaseUrl);
const normalizedWebAppUrl = trimTrailingSlashes(rawWebAppUrl);
const webAppHost = (() => {
  if (!normalizedWebAppUrl) return "";
  try {
    return new URL(normalizedWebAppUrl).host.toLowerCase();
  } catch {
    return "";
  }
})();
const webAppAllowedHosts = parseCsv(rawWebAppAllowedHosts);
const webShellEnabledRequested = parseBoolean(
  rawEnableWebShell,
  normalizedWebAppUrl.length > 0,
);
const webShellAllowAnyHost = parseBoolean(
  rawWebShellAllowAnyHost,
  !isProduction,
);
const webShellFallbackToNative = parseBoolean(
  rawWebShellFallbackToNative,
  true,
);
const webShellTimeoutMs = parseNumber(
  rawWebShellTimeoutMs,
  15000,
  3000,
  120000,
);

let webShellEnabled = webShellEnabledRequested;
if (webShellEnabledRequested && !normalizedWebAppUrl) {
  webShellEnabled = false;
  console.warn(
    "[MOBILE WEB SHELL] Disabled because EXPO_PUBLIC_WEB_APP_URL is not set.",
  );
}
if (webShellEnabledRequested && normalizedWebAppUrl && !webAppHost) {
  webShellEnabled = false;
  console.warn(
    `[MOBILE WEB SHELL] Disabled because EXPO_PUBLIC_WEB_APP_URL is invalid: ${normalizedWebAppUrl}`,
  );
}
if (
  webShellEnabled &&
  isProduction &&
  !webShellAllowAnyHost &&
  webAppAllowedHosts.length > 0 &&
  !webAppAllowedHosts.includes(webAppHost)
) {
  webShellEnabled = false;
  console.warn(
    `[MOBILE WEB SHELL] Disabled because host "${webAppHost}" is not in EXPO_PUBLIC_WEB_APP_ALLOWED_HOSTS.`,
  );
}

const missingRequiredVars: string[] = [];
if (!normalizedApiUrl) missingRequiredVars.push("EXPO_PUBLIC_API_URL");
if (!normalizedSupabaseUrl)
  missingRequiredVars.push("EXPO_PUBLIC_SUPABASE_URL");
if (!rawSupabaseAnonKey)
  missingRequiredVars.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");

if (missingRequiredVars.length > 0) {
  if (strictEnv) {
    throw new Error(
      `[MOBILE ENV] Missing required environment variables: ${missingRequiredVars.join(", ")}.`,
    );
  }
  console.warn(
    `[MOBILE ENV] Missing environment variables (continuing without strict env): ${missingRequiredVars.join(", ")}.`,
  );
}

export const MOBILE_ENV = {
  MODE: mode,
  IS_PRODUCTION: isProduction,
  STRICT_ENV: strictEnv,
  API_URL: normalizedApiUrl,
  SUPABASE_URL: normalizedSupabaseUrl,
  SUPABASE_ANON_KEY: rawSupabaseAnonKey,
  MAGIC_LINK_REDIRECT_TO: rawMagicLinkRedirectTo,
  ENABLE_GOOGLE_OAUTH: parseBoolean(rawEnableGoogleOAuth, false),
  ENABLE_APPLE_OAUTH: parseBoolean(rawEnableAppleOAuth, false),
  SENTRY_DSN: rawSentryDsn,
  WEB_APP_URL: normalizedWebAppUrl,
  WEB_APP_HOST: webAppHost,
  WEB_SHELL_ENABLED: webShellEnabled,
  WEB_SHELL_ALLOWED_HOSTS: webAppAllowedHosts,
  WEB_SHELL_ALLOW_ANY_HOST: webShellAllowAnyHost,
  WEB_SHELL_FALLBACK_TO_NATIVE: webShellFallbackToNative,
  WEB_SHELL_TIMEOUT_MS: webShellTimeoutMs,
};
