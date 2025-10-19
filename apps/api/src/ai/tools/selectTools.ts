import { toolSpecs, toolMap } from "./index";
import type { ToolMap } from "./index";

/**
 * Dynamically select relevant tools based on user query intent.
 * Reduces token usage by only including tools that are likely to be needed.
 *
 * @param userQuery - The current user message
 * @param conversationHistory - Optional history for context
 * @returns { toolSpecs, toolMap } - Filtered tools
 */
export function selectRelevantTools(
  userQuery: string,
  conversationHistory?: Array<{ role: string; content: string }>,
): {
  toolSpecs: typeof toolSpecs;
  toolMap: Partial<ToolMap>;
} {
  const query = userQuery.toLowerCase();
  const selectedTools: string[] = [];

  // Heuristics for tool selection
  const needsWebSearch =
    /\b(search|find|look up|what is|who is|when|where|latest|current|news|today|recent)\b/.test(
      query,
    ) ||
    /\?/.test(query) || // Questions often need web search
    /\b(google|duckduckgo|bing)\b/.test(query);

  const needsHttpFetch =
    /\b(fetch|get|read|load|download|url|http|https|link|page|website|article)\b/.test(
      query,
    ) || /https?:\/\//.test(query); // Contains URL

  const needsCalculator =
    /\b(calculate|compute|math|number|sum|total|multiply|divide|subtract|add|equation|formula|\d+\s*[+\-*/]\s*\d+)\b/.test(
      query,
    );

  const needsFileSearch =
    /\b(file|document|doc|uploaded|attachment|pdf|text file|my file|the file|search file|in the doc)\b/.test(
      query,
    ) ||
    conversationHistory?.some((msg) =>
      /\b(uploaded|file|document|attachment)\b/.test(msg.content.toLowerCase()),
    );

  // Add selected tools
  if (needsWebSearch) selectedTools.push("web_search");
  if (needsHttpFetch) selectedTools.push("http_fetch");
  if (needsCalculator) selectedTools.push("calculator");
  if (needsFileSearch) selectedTools.push("file_search");

  // Do NOT default to web_search. If nothing matches, provide no tools.

  // Build filtered toolSpecs and toolMap
  const filteredSpecs = toolSpecs.filter(
    (spec) => spec.type === "function" && selectedTools.includes(spec.name),
  );

  const filteredMap: Partial<ToolMap> = {};
  for (const toolName of selectedTools) {
    if (toolName in toolMap) {
      (filteredMap as any)[toolName] =
        toolMap[toolName as keyof typeof toolMap];
    }
  }

  console.log(
    `[Tool Selection] User query keywords matched: ${selectedTools.join(", ")} (${selectedTools.length}/${toolSpecs.length} tools)`,
  );

  return {
    toolSpecs: filteredSpecs,
    toolMap: filteredMap,
  };
}
