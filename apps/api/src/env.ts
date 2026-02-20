function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value.trim().length === 0) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
}

const DEFAULT_DEV_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
  "http://localhost:5179",
  "http://localhost:5180",
  "http://localhost:5181",
  "http://localhost:5182",
  "http://localhost:5183",
  "http://localhost:5184",
  "http://localhost:5185",
  "http://localhost:5186",
  "http://localhost:5187",
  "http://localhost:5188",
  "http://localhost:5189",
  "http://localhost:5190",
  "http://localhost:4173",
];

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const configuredCorsOrigins = parseCsv(process.env.CORS_ALLOWED_ORIGINS);
const strictEnv = parseBoolean(process.env.STRICT_ENV, isProduction);

export const ENV = {
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: isProduction,
  STRICT_ENV: strictEnv,
  PORT: Number(process.env.PORT || 3001),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL_NAME: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
  OPENAI_FAST_MODEL:
    process.env.OPENAI_FAST_MODEL ||
    process.env.OPENAI_MODEL_NAME ||
    "gpt-4.1-nano",
  OPENAI_SMART_MODEL:
    process.env.OPENAI_SMART_MODEL ||
    process.env.OPENAI_MODEL_NAME ||
    "gpt-4.1-mini",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
  CORS_ALLOWED_ORIGINS:
    configuredCorsOrigins.length > 0
      ? configuredCorsOrigins
      : isProduction
        ? []
        : DEFAULT_DEV_CORS_ORIGINS,
  PERICOPE_SOURCE: process.env.PERICOPE_SOURCE || "SIL_AI",
  DEEPER_VOTE_DEBUG:
    process.env.DEEPER_VOTE_DEBUG === "1" ||
    process.env.DEEPER_VOTE_DEBUG === "true",
};

const missingRequiredVars: string[] = [];
if (!ENV.SUPABASE_URL) missingRequiredVars.push("SUPABASE_URL");
if (!ENV.SUPABASE_ANON_KEY) missingRequiredVars.push("SUPABASE_ANON_KEY");
if (!ENV.SUPABASE_SERVICE_KEY) missingRequiredVars.push("SUPABASE_SERVICE_KEY");
if (ENV.IS_PRODUCTION && ENV.CORS_ALLOWED_ORIGINS.length === 0) {
  missingRequiredVars.push("CORS_ALLOWED_ORIGINS");
}

if (ENV.STRICT_ENV && missingRequiredVars.length > 0) {
  throw new Error(
    `[ENV] Missing required environment variables: ${missingRequiredVars.join(", ")}.`,
  );
}

if (!ENV.OPENAI_API_KEY) {
  console.warn(
    "[WARN] Missing OPENAI_API_KEY. /api/ai routes will return 503 until you set it.",
  );
}

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
  console.warn(
    "[WARN] Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
  );
}

if (!ENV.SUPABASE_SERVICE_KEY) {
  console.warn(
    "[WARN] Missing SUPABASE_SERVICE_KEY. Privileged API operations will fail until it is set.",
  );
}

if (!ENV.IS_PRODUCTION && configuredCorsOrigins.length === 0) {
  console.warn(
    "[WARN] CORS_ALLOWED_ORIGINS not set. Using development localhost defaults.",
  );
}
