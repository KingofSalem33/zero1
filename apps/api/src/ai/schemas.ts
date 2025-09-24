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

export type WebSearchParams = z.infer<typeof webSearchSchema>;
export type HttpFetchParams = z.infer<typeof httpFetchSchema>;
export type CalculatorParams = z.infer<typeof calculatorSchema>;
