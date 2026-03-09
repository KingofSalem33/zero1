import OpenAI from "openai";
import { ENV } from "./env";

export function makeOpenAI() {
  if (!ENV.AI_API_KEY) return null;
  return new OpenAI({
    apiKey: ENV.AI_API_KEY,
    ...(ENV.AI_PROVIDER === "groq" ? { baseURL: ENV.GROQ_BASE_URL } : {}),
  });
}
