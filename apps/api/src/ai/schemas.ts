import { z } from "zod";

export const webSearchSchema = z.object({
  q: z.string().describe("Search query"),
  count: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of results (1-10, default 5)"),
});

export const httpFetchSchema = z.object({
  url: z.string().url().describe("URL to fetch content from"),
});

export const calculatorSchema = z.object({
  expression: z.string().describe("Mathematical expression to evaluate"),
});

export const fileSearchSchema = z.object({
  query: z.string().describe("Search query to find relevant files"),
  topK: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Number of top results to return (1-10, default 5)"),
});

export const chatRequestSchema = z.object({
  message: z.string().describe("User message"),
  format: z.enum(["text", "json"]).optional().describe("Response format"),
  userId: z.string().optional().describe("User ID for memory/personalization"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .optional()
    .describe("Conversation history"),
});

export const chatJsonResponseSchema = z.object({
  answer: z.string().describe("The response to the user's question"),
  sources: z.array(z.string()).optional().describe("Source URLs referenced"),
});

// OpenAI JSON Schema for structured outputs (strict mode)
export const chatResponseJsonSchema = {
  name: "chat_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description: "The response to the user's question",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "Source URLs referenced (if applicable)",
      },
    },
    required: ["answer"],
    additionalProperties: false,
  },
} as const;

// Phase generation response schema
export const phaseGenerationJsonSchema = {
  name: "phase_generation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      phases: {
        type: "array",
        items: {
          type: "object",
          properties: {
            phase_id: { type: "string" },
            goal: { type: "string" },
            why_it_matters: { type: "string" },
            acceptance_criteria: {
              type: "array",
              items: { type: "string" },
            },
            rollback_plan: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "phase_id",
            "goal",
            "why_it_matters",
            "acceptance_criteria",
            "rollback_plan",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["phases"],
    additionalProperties: false,
  },
} as const;

// Substep generation response schema
export const substepGenerationJsonSchema = {
  name: "substep_generation",
  strict: true,
  schema: {
    type: "object",
    properties: {
      substeps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            substep_id: { type: "string" },
            step_number: { type: "number" },
            label: { type: "string" },
            prompt_to_send: { type: "string" },
          },
          required: ["substep_id", "step_number", "label", "prompt_to_send"],
          additionalProperties: false,
        },
      },
    },
    required: ["substeps"],
    additionalProperties: false,
  },
} as const;

export type WebSearchParams = z.infer<typeof webSearchSchema>;
export type HttpFetchParams = z.infer<typeof httpFetchSchema>;
export type CalculatorParams = z.infer<typeof calculatorSchema>;
export type FileSearchParams = z.infer<typeof fileSearchSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatJsonResponse = z.infer<typeof chatJsonResponseSchema>;
