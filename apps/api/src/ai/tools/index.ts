import { webSearch } from "./webSearch";
import { http_fetch } from "./httpFetch";
import { calculator } from "./calculator";
import { file_search } from "./fileSearch";
import {
  webSearchSchema,
  httpFetchSchema,
  calculatorSchema,
  fileSearchSchema,
} from "../schemas";

// Responses API function tool definitions (flat structure)
// See: https://platform.openai.com/docs/api-reference/responses/create
export const toolSpecs = [
  {
    type: "function" as const,
    name: "web_search",
    description:
      "Search the PUBLIC INTERNET for current, external information. REQUIRED: You must provide a complete, specific search query string in 'q'. For regulations/laws, include jurisdiction + topic + 'site:.gov'. Examples: web_search({q: 'Minnesota cottage food law site:mn.gov'}), web_search({q: 'Dakota County MN food service license requirements site:co.dakota.mn.us'}), web_search({q: 'California commercial kitchen health department regulations site:ca.gov'}). DO NOT call without a valid 'q' string.",
    parameters: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description:
            "REQUIRED: Complete search query string. Must include specific keywords (e.g., 'Minnesota cottage food law', 'health department permit requirements'). For official info, add 'site:.gov' or specific domain.",
          minLength: 3,
        },
        count: {
          type: "number",
          description: "Number of results (1-10, default 5)",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["q"],
    },
  },
  {
    type: "function" as const,
    name: "http_fetch",
    description:
      "Fetch and read content from a specific PUBLIC URL (websites, APIs, government sites, documentation). Use when you have an exact URL to retrieve. Example: http_fetch({url: 'https://www.fda.gov/food/cottage-food'})",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          format: "uri",
          description: "Full URL to fetch - must be a valid http/https URL",
          minLength: 1,
        },
      },
      required: ["url"],
    },
  },
  {
    type: "function" as const,
    name: "calculator",
    description:
      "Perform mathematical calculations with support for basic arithmetic operations",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description:
            'Mathematical expression to evaluate (e.g., "2 + 2", "10 * 3 / 2")',
        },
      },
      required: ["expression"],
    },
  },
  {
    type: "function" as const,
    name: "file_search",
    description:
      "Search ONLY through USER-UPLOADED files (docs, PDFs, code that user provided). DO NOT use for: laws, regulations, permits, government requirements, news, or anything on the internet. Only use when user mentions 'uploaded files', 'my documents', 'this file', 'our notes', etc. Example: file_search({query: 'API endpoints in uploaded code'})",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query to find relevant content in uploaded files - must be a non-empty string",
          minLength: 1,
        },
        topK: {
          type: "number",
          description: "Number of top results to return (1-10, default 5)",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["query"],
    },
  },
];

// Tool function map with validation
export const toolMap = {
  web_search: async (args: unknown) => {
    const params = webSearchSchema.parse(args);
    return await webSearch(params);
  },
  http_fetch: async (args: unknown) => {
    const params = httpFetchSchema.parse(args);
    return await http_fetch(params);
  },
  calculator: async (args: unknown) => {
    const params = calculatorSchema.parse(args);
    return await calculator(params);
  },
  file_search: async (args: unknown) => {
    const params = fileSearchSchema.parse(args);
    return await file_search(params);
  },
} as const;

export type ToolName = keyof typeof toolMap;
export type ToolMap = typeof toolMap;
