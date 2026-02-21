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

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

const mode = process.env.NODE_ENV || "development";
const isProduction = mode === "production";
const strictEnv = parseBoolean(
  process.env.EXPO_PUBLIC_STRICT_ENV,
  isProduction,
);

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || "";
const rawSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const rawSupabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const rawMagicLinkRedirectTo =
  process.env.EXPO_PUBLIC_MAGIC_LINK_REDIRECT_TO || "";

const normalizedApiUrl = trimTrailingSlashes(rawApiUrl);
const normalizedSupabaseUrl = trimTrailingSlashes(rawSupabaseUrl);

const missingRequiredVars: string[] = [];
if (!normalizedApiUrl) missingRequiredVars.push("EXPO_PUBLIC_API_URL");
if (!normalizedSupabaseUrl)
  missingRequiredVars.push("EXPO_PUBLIC_SUPABASE_URL");
if (!rawSupabaseAnonKey)
  missingRequiredVars.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");

if (strictEnv && missingRequiredVars.length > 0) {
  throw new Error(
    `[MOBILE ENV] Missing required environment variables: ${missingRequiredVars.join(", ")}.`,
  );
}

if (!strictEnv && missingRequiredVars.length > 0) {
  console.warn(
    `[MOBILE ENV] Missing environment variables: ${missingRequiredVars.join(", ")}.`,
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
};
