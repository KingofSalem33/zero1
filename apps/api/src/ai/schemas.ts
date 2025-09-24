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

export type WebSearchParams = z.infer<typeof webSearchSchema>;
export type HttpFetchParams = z.infer<typeof httpFetchSchema>;
export type CalculatorParams = z.infer<typeof calculatorSchema>;
export type FileSearchParams = z.infer<typeof fileSearchSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatJsonResponse = z.infer<typeof chatJsonResponseSchema>;
