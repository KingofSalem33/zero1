import type { ChatCompletionTool } from "openai/resources";
import { webSearch } from "./webSearch";
import { httpFetch } from "./httpFetch";
import { calculator } from "./calculator";
import { webSearchSchema, httpFetchSchema, calculatorSchema } from "../schemas";

// OpenAI function tool definitions
export const toolSpecs: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for current information on any topic",
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
];

// Tool function map with validation
export const toolMap = {
  web_search: async (args: unknown) => {
    const params = webSearchSchema.parse(args);
    return await webSearch(params);
  },
  http_fetch: async (args: unknown) => {
    const params = httpFetchSchema.parse(args);
    return await httpFetch(params);
  },
  calculator: async (args: unknown) => {
    const params = calculatorSchema.parse(args);
    return await calculator(params);
  },
} as const;

export type ToolName = keyof typeof toolMap;
