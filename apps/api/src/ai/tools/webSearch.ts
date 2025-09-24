import { request } from "undici";
import type { WebSearchParams } from "../schemas";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SearchResponse {
  results: SearchResult[];
  citations: string[];
}

export async function webSearch(
  params: WebSearchParams,
): Promise<SearchResponse> {
  const { q, count = 5 } = params;

  try {
    // Using DuckDuckGo Instant Answer API as a fallback search
    // In production, you'd use a proper search API like Google Custom Search, Bing, etc.
    const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;

    const { body } = await request(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SearchBot/1.0)",
      },
    });

    const data = (await body.json()) as any;

    // Mock search results for demonstration
    // In production, parse actual search API responses
    const results: SearchResult[] = [];
    const citations: string[] = [];

    // Add abstract if available
    if (data.Abstract) {
      results.push({
        title: data.Heading || "Search Result",
        link: data.AbstractURL || "#",
        snippet: data.Abstract,
      });
      if (data.AbstractURL) citations.push(data.AbstractURL);
    }

    // Add related topics
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      data.RelatedTopics.slice(0, count - 1).forEach((topic: any) => {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(" - ")[0] || "Related Topic",
            link: topic.FirstURL,
            snippet: topic.Text,
          });
          citations.push(topic.FirstURL);
        }
      });
    }

    // Fallback mock results if no data
    if (results.length === 0) {
      for (let i = 1; i <= Math.min(count, 3); i++) {
        results.push({
          title: `Search result ${i} for "${q}"`,
          link: `https://example.com/result-${i}`,
          snippet: `This is a mock search result ${i} for the query "${q}". In production, this would be real search data.`,
        });
        citations.push(`https://example.com/result-${i}`);
      }
    }

    return { results: results.slice(0, count), citations };
  } catch (error) {
    console.error("Search error:", error);

    // Fallback results
    return {
      results: [
        {
          title: `Search results for "${q}"`,
          link: "https://example.com",
          snippet: `Unable to fetch live search results. This is a fallback result for "${q}".`,
        },
      ],
      citations: ["https://example.com"],
    };
  }
}
