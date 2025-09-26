import { request } from "undici";
import * as cheerio from "cheerio";
import { URL } from "url";
import type { WebSearchParams } from "../schemas";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  citations: string[];
}

export async function webSearch(
  params: WebSearchParams,
): Promise<SearchResponse> {
  const { q, count = 5 } = params;

  try {
    const query = encodeURIComponent(q);
    const url = `https://html.duckduckgo.com/html/?q=${query}`;

    const { body } = await request(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI-Agent/1.0)",
      },
    });

    const html = await body.text();
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];
    const citations: string[] = [];

    // Try multiple selector patterns for DuckDuckGo results
    const selectors = [
      {
        container: ".result",
        title: ".result__a",
        link: ".result__a",
        snippet: ".result__snippet",
      },
      {
        container: ".web-result",
        title: "h2 a",
        link: "h2 a",
        snippet: ".result-snippet",
      },
      {
        container: ".links_main",
        title: ".result__a",
        link: ".result__a",
        snippet: ".result__snippet",
      },
      {
        container: "[data-testid='result']",
        title: "h3 a",
        link: "h3 a",
        snippet: ".VwiC3b",
      },
    ];

    for (const selector of selectors) {
      if (results.length >= count) break;

      $(selector.container).each((_i, el) => {
        if (results.length >= count) return;

        const titleEl = $(el).find(selector.title);
        const title = titleEl.text().trim();
        let link = titleEl.attr("href");
        const snippet = $(el).find(selector.snippet).text().trim();

        // Clean up DuckDuckGo redirect links
        if (link && link.includes("/l/?uddg=")) {
          try {
            const urlParams = new URL("https://duckduckgo.com" + link);
            const uddgParam = urlParams.searchParams.get("uddg");
            if (uddgParam) {
              link = decodeURIComponent(uddgParam);
            }
          } catch {
            // Keep original link if parsing fails
          }
        }

        // Filter out empty or invalid links
        if (
          title &&
          link &&
          (link.startsWith("http") || link.startsWith("//"))
        ) {
          // Ensure proper protocol
          if (link.startsWith("//")) {
            link = "https:" + link;
          }

          results.push({
            title,
            url: link,
            snippet: snippet || "No description available",
          });
          citations.push(link);
        }
      });
    }

    console.log(
      `DuckDuckGo search for "${q}" returned ${results.length} results`,
    );
    if (results.length === 0) {
      console.log("HTML structure:", $.html().substring(0, 500));
    }

    return {
      query: q,
      results: results.slice(0, count),
      citations: [...new Set(citations)], // Remove duplicates
    };
  } catch (error) {
    console.error("DuckDuckGo search error:", error);

    // Return fallback results
    return {
      query: q,
      results: [
        {
          title: `Unable to search for "${q}"`,
          url: "https://duckduckgo.com/?q=" + encodeURIComponent(q),
          snippet: `Search failed, but you can try searching manually on DuckDuckGo.`,
        },
      ],
      citations: ["https://duckduckgo.com/?q=" + encodeURIComponent(q)],
    };
  }
}
