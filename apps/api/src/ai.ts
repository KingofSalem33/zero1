import OpenAI from "openai";
import { ENV } from "./env";

export function makeOpenAI() {
  if (!ENV.AI_API_KEY) return null;
  return new OpenAI({
    apiKey: ENV.AI_API_KEY,
  });
}

export function makeEmbeddingClient() {
  if (!ENV.EMBEDDING_API_KEY || !ENV.EMBEDDING_MODEL_NAME) return null;
  return new OpenAI({
    apiKey: ENV.EMBEDDING_API_KEY,
  });
}
