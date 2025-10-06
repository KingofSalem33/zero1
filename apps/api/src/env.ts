export const ENV = {
  PORT: Number(process.env.PORT || 3001),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL_NAME: process.env.OPENAI_MODEL_NAME || "gpt-5-mini",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || "",
};

if (!ENV.OPENAI_API_KEY) {
  console.warn(
    "[WARN] Missing OPENAI_API_KEY. /api/ai routes will return 503 until you set it.",
  );
}

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
  console.warn(
    "[WARN] Missing Supabase credentials. Database operations will fail.",
  );
}
