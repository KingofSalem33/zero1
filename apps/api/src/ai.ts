import OpenAI from "openai";
import { ENV } from "./env";

export function makeOpenAI() {
  if (!ENV.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
}
