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

  // Try Google Custom Search (most reliable)
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_CX;

  if (googleApiKey && googleCx) {
    try {
      const query = encodeURIComponent(q);
      const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${query}&num=${count}`;

      const { body } = await request(apiUrl, {
        method: "GET",
      });

      const data = (await body.json()) as any;

      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        const results: SearchResult[] = data.items.map((item: any) => ({
          title: item.title || "No title",
          url: item.link || "",
          snippet: item.snippet || "No description available",
        }));

        const citations = results.map((r) => r.url);

        console.log(
          `Google Custom Search for "${q}" returned ${results.length} results`,
        );
        return {
          query: q,
          results,
          citations: [...new Set(citations)],
        };
      }
    } catch (googleError) {
      console.error("Google Custom Search error:", googleError);
    }
  }

  // Fallback: Try DuckDuckGo Instant Answer API
  try {
    const query = encodeURIComponent(q);
    const apiUrl = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;

    const { body: apiBody } = await request(apiUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI-Agent/1.0)",
      },
    });

    const apiData = (await apiBody.json()) as any;
    const results: SearchResult[] = [];
    const citations: string[] = [];

    // Parse RelatedTopics from API response
    if (apiData.RelatedTopics && Array.isArray(apiData.RelatedTopics)) {
      for (const topic of apiData.RelatedTopics) {
        if (results.length >= count) break;

        // Handle nested topics
        if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const subtopic of topic.Topics) {
            if (results.length >= count) break;
            if (subtopic.FirstURL && subtopic.Text) {
              results.push({
                title: subtopic.Text.split(" - ")[0] || subtopic.Text,
                url: subtopic.FirstURL,
                snippet: subtopic.Text,
              });
              citations.push(subtopic.FirstURL);
            }
          }
        } else if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text.split(" - ")[0] || topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text,
          });
          citations.push(topic.FirstURL);
        }
      }
    }

    // Add AbstractURL if available
    if (apiData.AbstractURL && results.length < count) {
      results.push({
        title: apiData.Heading || "Main Result",
        url: apiData.AbstractURL,
        snippet: apiData.AbstractText || "No description available",
      });
      citations.push(apiData.AbstractURL);
    }

    if (results.length > 0) {
      console.log(
        `DuckDuckGo API search for "${q}" returned ${results.length} results`,
      );
      return {
        query: q,
        results: results.slice(0, count),
        citations: [...new Set(citations)],
      };
    }
  } catch (apiError) {
    console.error("DuckDuckGo API error:", apiError);
  }

  // Fallback to HTML scraping if API fails or returns no results
  try {
    const query = encodeURIComponent(q);
    const url = `https://html.duckduckgo.com/html/?q=${query}`;

    const { body } = await request(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
      },
    });

    const html = await body.text();
    const $ = cheerio.load(html);

    const results: SearchResult[] = [];
    const citations: string[] = [];

    // Enhanced selector patterns for DuckDuckGo
    const selectors = [
      {
        container: ".result",
        title: ".result__a",
        link: ".result__a",
        snippet: ".result__snippet",
      },
      {
        container: ".web-result",
        title: ".result__title a, h2 a",
        link: ".result__title a, h2 a",
        snippet: ".result__snippet, .result-snippet",
      },
      {
        container: ".links_main",
        title: ".result__a",
        link: ".result__a",
        snippet: ".result__snippet",
      },
      {
        container: "[class*='result']",
        title: "a[class*='result']",
        link: "a[class*='result']",
        snippet: "[class*='snippet']",
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
      `DuckDuckGo HTML search for "${q}" returned ${results.length} results`,
    );

    if (results.length > 0) {
      return {
        query: q,
        results: results.slice(0, count),
        citations: [...new Set(citations)],
      };
    }
  } catch (htmlError) {
    console.error("DuckDuckGo HTML scraping error:", htmlError);
  }

  // Final fallback: return helpful search links from multiple engines
  console.warn(
    `All search methods failed for "${q}", returning multi-engine fallback`,
  );
  const encodedQuery = encodeURIComponent(q);
  return {
    query: q,
    results: [
      {
        title: `Search "${q}" on DuckDuckGo`,
        url: `https://duckduckgo.com/?q=${encodedQuery}`,
        snippet: `DuckDuckGo search results for "${q}"`,
      },
      {
        title: `Search "${q}" on Google`,
        url: `https://www.google.com/search?q=${encodedQuery}`,
        snippet: `Google search results for "${q}"`,
      },
      {
        title: `Search "${q}" on Bing`,
        url: `https://www.bing.com/search?q=${encodedQuery}`,
        snippet: `Bing search results for "${q}"`,
      },
      {
        title: `Search "${q}" on Wikipedia`,
        url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodedQuery}`,
        snippet: `Wikipedia search results for "${q}"`,
      },
    ],
    citations: [
      `https://duckduckgo.com/?q=${encodedQuery}`,
      `https://www.google.com/search?q=${encodedQuery}`,
      `https://www.bing.com/search?q=${encodedQuery}`,
      `https://en.wikipedia.org/wiki/Special:Search?search=${encodedQuery}`,
    ],
  };
}
