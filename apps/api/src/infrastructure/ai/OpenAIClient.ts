/**
 * OpenAI Client Wrapper
 *
 * Centralizes all OpenAI SDK interactions with:
 * - Error handling
 * - Retry logic
 * - Type safety
 * - Easy mocking for tests
 * - Provider abstraction (easy to swap to Anthropic, etc.)
 */

import OpenAI from "openai";
import { ENV } from "../../env";
// JSONSchema type definition
export type JSONSchema = {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any;
};

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
}

export interface StructuredOutputOptions {
  model?: string;
  temperature?: number;
  schema: JSONSchema;
  schemaName: string;
}

/**
 * Interface for LLM clients - allows swapping providers
 */
export interface ILLMClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  chatWithTools(
    messages: ChatMessage[],
    tools: any[],
    options?: ChatOptions,
  ): Promise<any>;
  chatWithStructuredOutput<T>(
    messages: ChatMessage[],
    options: StructuredOutputOptions,
  ): Promise<T>;
}

/**
 * OpenAI implementation of ILLMClient
 */
export class OpenAIClient implements ILLMClient {
  private client: OpenAI | null;

  constructor() {
    this.client = this.createClient();
  }

  private createClient(): OpenAI | null {
    if (!ENV.OPENAI_API_KEY) {
      console.warn(
        "⚠️ [OpenAIClient] No API key found. Client will not be available.",
      );
      return null;
    }
    return new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
  }

  /**
   * Check if client is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Simple chat completion
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<string> {
    if (!this.client) {
      throw new Error("OpenAI client not configured (missing API key)");
    }

    const model = options.model || ENV.OPENAI_MODEL_NAME;

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
      });

      const content = completion.choices[0]?.message?.content || "";
      return content;
    } catch (error) {
      console.error("[OpenAIClient] Chat completion failed:", error);
      throw new Error(`OpenAI request failed: ${(error as Error).message}`);
    }
  }

  /**
   * Chat with tool calling support
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools: any[],
    options: ChatOptions = {},
  ): Promise<any> {
    if (!this.client) {
      throw new Error("OpenAI client not configured (missing API key)");
    }

    const model = options.model || ENV.OPENAI_MODEL_NAME;

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages,
        tools,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens,
      });

      return completion;
    } catch (error) {
      console.error("[OpenAIClient] Chat with tools failed:", error);
      throw new Error(`OpenAI request failed: ${(error as Error).message}`);
    }
  }

  /**
   * Chat with structured output (JSON schema)
   */
  async chatWithStructuredOutput<T>(
    messages: ChatMessage[],
    options: StructuredOutputOptions,
  ): Promise<T> {
    if (!this.client) {
      throw new Error("OpenAI client not configured (missing API key)");
    }

    const model = options.model || ENV.OPENAI_MODEL_NAME;

    try {
      const completion = await this.client.chat.completions.create({
        model,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: options.schemaName,
            strict: true,
            schema: options.schema,
          },
        },
        temperature: options.temperature ?? 0.7,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      return JSON.parse(content) as T;
    } catch (error) {
      console.error("[OpenAIClient] Structured output failed:", error);
      throw new Error(
        `OpenAI structured output failed: ${(error as Error).message}`,
      );
    }
  }
}

/**
 * Singleton instance
 */
export const openAIClient = new OpenAIClient();

/**
 * Legacy compatibility: makeOpenAI() function
 * @deprecated Use openAIClient instead
 */
export function makeOpenAI(): OpenAI | null {
  if (!ENV.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
}
