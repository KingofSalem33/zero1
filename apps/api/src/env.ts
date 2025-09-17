export const ENV = {
  PORT: Number(process.env.PORT || 3001),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  OPENAI_MODEL_NAME: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
};

if (!ENV.OPENAI_API_KEY) {
  console.warn(
    "[WARN] Missing OPENAI_API_KEY. /api/ai routes will return 503 until you set it.",
  );
}
