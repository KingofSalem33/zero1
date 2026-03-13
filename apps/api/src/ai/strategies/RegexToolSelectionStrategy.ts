import { IToolSelectionStrategy } from "./IToolSelectionStrategy";

/**
 * Regex-based tool selection strategy
 * Uses pattern matching to determine tool relevance
 */
export class RegexToolSelectionStrategy implements IToolSelectionStrategy {
  selectTools(
    userQuery: string,
    conversationHistory?: Array<{ role: string; content: string }>,
  ): string[] {
    const query = userQuery.toLowerCase();
    const selectedTools: string[] = [];

    // Web search patterns
    const needsWebSearch =
      /\b(search|find|look up|what is|who is|when|where|latest|current|news|today|recent)\b/.test(
        query,
      ) ||
      /\?/.test(query) ||
      /\b(google|duckduckgo|bing)\b/.test(query);

    // HTTP fetch patterns
    const needsHttpFetch =
      /\b(fetch|get|read|load|download|url|http|https|link|page|website|article)\b/.test(
        query,
      ) || /https?:\/\//.test(query);

    // Calculator patterns
    const needsCalculator =
      /\b(calculate|compute|math|number|sum|total|multiply|divide|subtract|add|equation|formula|\d+\s*[+\-*/]\s*\d+)\b/.test(
        query,
      );

    // File search patterns
    const needsFileSearch =
      /\b(file|document|doc|uploaded|attachment|pdf|text file|my file|the file|search file|in the doc)\b/.test(
        query,
      ) ||
      conversationHistory?.some((msg) =>
        /\b(uploaded|file|document|attachment)\b/.test(
          msg.content.toLowerCase(),
        ),
      );

    // Add selected tools
    if (needsWebSearch) selectedTools.push("web_search");
    if (needsHttpFetch) selectedTools.push("http_fetch");
    if (needsCalculator) selectedTools.push("calculator");
    if (needsFileSearch) selectedTools.push("file_search");

    return selectedTools;
  }
}
