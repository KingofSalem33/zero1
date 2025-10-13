import { request } from "undici";
import * as cheerio from "cheerio";
import type { WebSearchParams } from "../schemas";
import {
  validateUrl,
  sanitizeText,
  createSafeRequestOptions,
  SECURITY_CONFIG,
} from "./security";
import pino from "pino";

const logger = pino({ name: "web_search" });

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

interface GoogleSearchItem {
  title?: string;
  link?: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

interface DuckDuckGoTopic {
  FirstURL?: string;
  Text?: string;
  Topics?: DuckDuckGoTopic[];
}

interface DuckDuckGoResponse {
  RelatedTopics?: DuckDuckGoTopic[];
  AbstractURL?: string;
  Heading?: string;
  AbstractText?: string;
}

/**
 * Validates and sanitizes a search result URL
 * Returns null if URL is invalid or blocked
 */
function validateSearchResultUrl(url: string): string | null {
  try {
    validateUrl(url);
    return url;
  } catch (error) {
    logger.warn(
      { url, error: error instanceof Error ? error.message : error },
      "Invalid search result URL",
    );
    return null;
  }
}

/**
 * Sanitizes search result text fields
 */
function sanitizeSearchResult(result: SearchResult): SearchResult {
  return {
    title: sanitizeText(result.title, 200),
    url: result.url,
    snippet: sanitizeText(result.snippet, 500),
  };
}

export async function webSearch(
  params: WebSearchParams,
): Promise<SearchResponse> {
  const { q, count = 5 } = params;

  // Sanitize query input
  const sanitizedQuery = sanitizeText(q, 500);

  logger.info({ query: sanitizedQuery, count }, "Starting web search");

  // Try Google Custom Search (most reliable)
  const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_CX;

  if (googleApiKey && googleCx) {
    try {
      const query = encodeURIComponent(sanitizedQuery);
      const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${query}&num=${count}`;

      const requestOptions = createSafeRequestOptions();
      const { body } = await request(apiUrl, {
        method: "GET",
        ...requestOptions,
      });

      const data = (await body.json()) as GoogleSearchResponse;

      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        const results: SearchResult[] = [];

        for (const item of data.items) {
          // Validate URL before including
          const validatedUrl = validateSearchResultUrl(item.link);
          if (!validatedUrl) continue;

          results.push({
            title: item.title || "No title",
            url: validatedUrl,
            snippet: item.snippet || "No description available",
          });
        }

        // Sanitize all results
        const sanitizedResults = results.map(sanitizeSearchResult);
        const citations = sanitizedResults.map((r) => r.url);

        logger.info(
          { query: sanitizedQuery, resultCount: sanitizedResults.length },
          "Google Custom Search succeeded",
        );

        return {
          query: sanitizedQuery,
          results: sanitizedResults,
          citations: [...new Set(citations)],
        };
      }
    } catch (googleError) {
      logger.error({ error: googleError }, "Google Custom Search error");
    }
  }

  // Fallback: Try DuckDuckGo Instant Answer API
  try {
    const query = encodeURIComponent(sanitizedQuery);
    const apiUrl = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;

    const requestOptions = createSafeRequestOptions();
    const { body: apiBody } = await request(apiUrl, {
      method: "GET",
      ...requestOptions,
    });

    const apiData = (await apiBody.json()) as DuckDuckGoResponse;
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
              const validatedUrl = validateSearchResultUrl(subtopic.FirstURL);
              if (!validatedUrl) continue;

              results.push({
                title: subtopic.Text.split(" - ")[0] || subtopic.Text,
                url: validatedUrl,
                snippet: subtopic.Text,
              });
              citations.push(validatedUrl);
            }
          }
        } else if (topic.FirstURL && topic.Text) {
          const validatedUrl = validateSearchResultUrl(topic.FirstURL);
          if (!validatedUrl) continue;

          results.push({
            title: topic.Text.split(" - ")[0] || topic.Text,
            url: validatedUrl,
            snippet: topic.Text,
          });
          citations.push(validatedUrl);
        }
      }
    }

    // Add AbstractURL if available
    if (apiData.AbstractURL && results.length < count) {
      const validatedUrl = validateSearchResultUrl(apiData.AbstractURL);
      if (validatedUrl) {
        results.push({
          title: apiData.Heading || "Main Result",
          url: validatedUrl,
          snippet: apiData.AbstractText || "No description available",
        });
        citations.push(validatedUrl);
      }
    }

    if (results.length > 0) {
      const sanitizedResults = results.map(sanitizeSearchResult);

      logger.info(
        { query: sanitizedQuery, resultCount: sanitizedResults.length },
        "DuckDuckGo API succeeded",
      );

      return {
        query: sanitizedQuery,
        results: sanitizedResults,
        citations: [...new Set(citations)],
      };
    }
  } catch (apiError) {
    logger.error({ error: apiError }, "DuckDuckGo API error");
  }

  // Fallback to HTML scraping if API fails or returns no results
  try {
    const query = encodeURIComponent(sanitizedQuery);
    const url = `https://html.duckduckgo.com/html/?q=${query}`;

    const requestOptions = createSafeRequestOptions();
    const { body } = await request(url, {
      method: "GET",
      headers: {
        ...requestOptions.headers,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      bodyTimeout: requestOptions.bodyTimeout,
      headersTimeout: requestOptions.headersTimeout,
    });

    // Validate response size
    let html = "";
    let bytesRead = 0;

    for await (const chunk of body) {
      bytesRead += chunk.length;
      if (bytesRead > SECURITY_CONFIG.MAX_RESPONSE_SIZE) {
        logger.warn({ bytesRead }, "HTML response too large");
        break;
      }
      html += chunk.toString("utf-8");
    }

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

          // Validate URL before including
          const validatedUrl = validateSearchResultUrl(link);
          if (!validatedUrl) return;

          results.push({
            title,
            url: validatedUrl,
            snippet: snippet || "No description available",
          });
          citations.push(validatedUrl);
        }
      });
    }

    if (results.length > 0) {
      const sanitizedResults = results.map(sanitizeSearchResult);

      logger.info(
        { query: sanitizedQuery, resultCount: sanitizedResults.length },
        "DuckDuckGo HTML scraping succeeded",
      );

      return {
        query: sanitizedQuery,
        results: sanitizedResults,
        citations: [...new Set(citations)],
      };
    }
  } catch (htmlError) {
    logger.error({ error: htmlError }, "DuckDuckGo HTML scraping error");
  }

  // Final fallback: return helpful search links from multiple engines
  logger.warn(
    { query: sanitizedQuery },
    "All search methods failed, returning fallback",
  );

  const encodedQuery = encodeURIComponent(sanitizedQuery);
  const fallbackResults: SearchResult[] = [
    {
      title: `Search "${sanitizedQuery}" on DuckDuckGo`,
      url: `https://duckduckgo.com/?q=${encodedQuery}`,
      snippet: `DuckDuckGo search results for "${sanitizedQuery}"`,
    },
    {
      title: `Search "${sanitizedQuery}" on Google`,
      url: `https://www.google.com/search?q=${encodedQuery}`,
      snippet: `Google search results for "${sanitizedQuery}"`,
    },
    {
      title: `Search "${sanitizedQuery}" on Bing`,
      url: `https://www.bing.com/search?q=${encodedQuery}`,
      snippet: `Bing search results for "${sanitizedQuery}"`,
    },
    {
      title: `Search "${sanitizedQuery}" on Wikipedia`,
      url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodedQuery}`,
      snippet: `Wikipedia search results for "${sanitizedQuery}"`,
    },
  ];

  return {
    query: sanitizedQuery,
    results: fallbackResults.map(sanitizeSearchResult),
    citations: fallbackResults.map((r) => r.url),
  };
}
