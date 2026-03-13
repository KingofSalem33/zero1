function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value.trim().length === 0) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

const mode = import.meta.env.MODE;
const isProduction = import.meta.env.PROD;
const strictEnv = parseBoolean(import.meta.env.VITE_STRICT_ENV, isProduction);

const defaultDevApiUrl = "http://localhost:3001";
const rawApiUrl =
  import.meta.env.VITE_API_URL ||
  (!strictEnv && !isProduction ? defaultDevApiUrl : "");
const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const rawMagicLinkRedirectTo = import.meta.env.VITE_MAGIC_LINK_REDIRECT_TO || "";

const normalizedApiUrl = trimTrailingSlashes(rawApiUrl);
const normalizedSupabaseUrl = trimTrailingSlashes(rawSupabaseUrl);

const missingRequiredVars: string[] = [];
if (!normalizedApiUrl) missingRequiredVars.push("VITE_API_URL");
if (!normalizedSupabaseUrl) missingRequiredVars.push("VITE_SUPABASE_URL");
if (!rawSupabaseAnonKey) missingRequiredVars.push("VITE_SUPABASE_ANON_KEY");

if (strictEnv && missingRequiredVars.length > 0) {
  throw new Error(
    `[DESKTOP ENV] Missing required environment variables: ${missingRequiredVars.join(", ")}.`,
  );
}

if (!strictEnv && missingRequiredVars.length > 0) {
  console.warn(
    `[DESKTOP ENV] Missing environment variables: ${missingRequiredVars.join(", ")}.`,
  );
}

export const DESKTOP_ENV = {
  MODE: mode,
  IS_PRODUCTION: isProduction,
  STRICT_ENV: strictEnv,
  API_URL: normalizedApiUrl,
  SUPABASE_URL: normalizedSupabaseUrl,
  SUPABASE_ANON_KEY: rawSupabaseAnonKey,
  MAGIC_LINK_REDIRECT_TO: rawMagicLinkRedirectTo,
};
