function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
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

const LOCAL_DESKTOP_CORS_PORTS = [
  ...Array.from({ length: 18 }, (_unused, index) => 5173 + index),
  4173,
];
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1"];
const LOCAL_DESKTOP_CORS_ORIGINS = [
  ...LOOPBACK_HOSTS.flatMap((host) =>
    LOCAL_DESKTOP_CORS_PORTS.map((port) => `http://${host}:${port}`),
  ),
  "null",
];

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const configuredCorsOrigins = parseCsv(process.env.CORS_ALLOWED_ORIGINS);
const strictEnv = parseBoolean(process.env.STRICT_ENV, isProduction);
const requestedAiProvider = (process.env.AI_PROVIDER || "openai")
  .trim()
  .toLowerCase();
const aiProvider = "openai";
const requestedEmbeddingProvider = (process.env.EMBEDDING_PROVIDER || "openai")
  .trim()
  .toLowerCase();
const embeddingProvider = "openai";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const groqApiKey = process.env.GROQ_API_KEY || "";
const groqBaseUrl =
  process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
const groqModelName = process.env.GROQ_MODEL_NAME || "openai/gpt-oss-20b";
const groqFastModelName = process.env.GROQ_FAST_MODEL || groqModelName;
const groqSmartModelName = process.env.GROQ_SMART_MODEL || groqModelName;
const openaiModelName = process.env.OPENAI_MODEL_NAME || "gpt-5-mini";
const defaultEmbeddingModel =
  process.env.EMBEDDING_MODEL_NAME ||
  process.env.OPENAI_EMBEDDING_MODEL ||
  "text-embedding-3-small";
const embeddingModelName = defaultEmbeddingModel;
const defaultProviderModel = openaiModelName;
const aiApiKey = openaiApiKey;
const embeddingApiKey = openaiApiKey;
const resolvedFastModel =
  process.env.OPENAI_FAST_MODEL ||
  process.env.OPENAI_MODEL_NAME ||
  "gpt-5-mini";
const resolvedSmartModel =
  process.env.OPENAI_SMART_MODEL ||
  process.env.OPENAI_MODEL_NAME ||
  "gpt-5-nano";
const mergedProductionCorsOrigins = Array.from(
  new Set([...configuredCorsOrigins, ...LOCAL_DESKTOP_CORS_ORIGINS]),
);
const resolvedCorsAllowedOrigins =
  configuredCorsOrigins.length > 0
    ? isProduction
      ? mergedProductionCorsOrigins
      : configuredCorsOrigins
    : isProduction
      ? []
      : LOCAL_DESKTOP_CORS_ORIGINS;

export const ENV = {
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: isProduction,
  STRICT_ENV: strictEnv,
  PORT: Number(process.env.PORT || 3001),
  AI_PROVIDER: aiProvider,
  AI_API_KEY: aiApiKey,
  EMBEDDING_PROVIDER: embeddingProvider,
  EMBEDDING_API_KEY: embeddingApiKey,
  EMBEDDING_MODEL_NAME: embeddingModelName,
  GROQ_API_KEY: groqApiKey,
  GROQ_BASE_URL: groqBaseUrl,
  GROQ_MODEL_NAME: groqModelName,
  GROQ_FAST_MODEL: groqFastModelName,
  GROQ_SMART_MODEL: groqSmartModelName,
  OPENAI_API_KEY: openaiApiKey,
  OPENAI_MODEL_NAME: defaultProviderModel,
  OPENAI_FAST_MODEL: resolvedFastModel,
  OPENAI_SMART_MODEL: resolvedSmartModel,
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
  CORS_ALLOWED_ORIGINS: resolvedCorsAllowedOrigins,
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

if (requestedAiProvider !== "openai") {
  console.warn(
    `[WARN] AI_PROVIDER=${requestedAiProvider} requested, but Groq is disabled for now. Using OpenAI.`,
  );
}

if (requestedEmbeddingProvider !== "openai") {
  console.warn(
    `[WARN] EMBEDDING_PROVIDER=${requestedEmbeddingProvider} requested, but Groq embeddings are disabled for now. Using OpenAI.`,
  );
}

if (!ENV.AI_API_KEY) {
  console.warn(
    "[WARN] Missing OPENAI_API_KEY. /api/ai routes will return 503 until you set it.",
  );
}

if (!ENV.EMBEDDING_API_KEY) {
  console.warn(
    "[WARN] Missing OPENAI_API_KEY for embeddings. Embedding-backed routes will degrade gracefully.",
  );
}

if (!ENV.EMBEDDING_MODEL_NAME) {
  console.warn(
    "[WARN] EMBEDDING_MODEL_NAME is empty. Embedding-backed routes will degrade gracefully.",
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

if (ENV.IS_PRODUCTION && configuredCorsOrigins.length > 0) {
  console.log(
    "[INFO] CORS allowlist merged with localhost/127.0.0.1 + null origins for desktop/Electron clients.",
  );
}

console.log(
  `[AI] Active provider=${ENV.AI_PROVIDER} default=${ENV.OPENAI_MODEL_NAME} fast=${ENV.OPENAI_FAST_MODEL} smart=${ENV.OPENAI_SMART_MODEL}`,
);
console.log(
  `[AI] Embeddings provider=${ENV.EMBEDDING_PROVIDER} model=${ENV.EMBEDDING_MODEL_NAME || "(unset)"}`,
);
