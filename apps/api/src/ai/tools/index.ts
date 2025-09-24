import type { ChatCompletionTool } from "openai/resources";
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

// OpenAI function tool definitions
export const toolSpecs: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information using DuckDuckGo HTML scraping (no API key required)",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description: "Search query",
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
  },
  {
    type: "function",
    function: {
      name: "http_fetch",
      description: "Fetch and read content from a specific URL",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            format: "uri",
            description: "URL to fetch content from",
          },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
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
  },
  {
    type: "function",
    function: {
      name: "file_search",
      description:
        "Search through uploaded files to find relevant content based on a query",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to find relevant files and content",
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
