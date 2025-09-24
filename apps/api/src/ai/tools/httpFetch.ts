import { request } from "undici";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { URL } from "url";
import type { HttpFetchParams } from "../schemas";

export interface FetchResult {
  url: string;
  site: string;
  title: string;
  excerpt: string;
  text: string;
}

export async function http_fetch(
  params: HttpFetchParams,
): Promise<FetchResult> {
  const { url } = params;

  try {
    const { body, statusCode, headers } = await request(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI-Assistant/1.0)",
      },
    });

    if (statusCode >= 400) {
      throw new Error(`HTTP ${statusCode}`);
    }

    const contentType = (headers["content-type"] as string) || "";

    // Reject binary content types
    const binaryTypes = [
      "image/",
      "video/",
      "audio/",
      "application/pdf",
      "application/zip",
      "application/octet-stream",
    ];

    if (binaryTypes.some((type) => contentType.includes(type))) {
      throw new Error(`Binary content type not supported: ${contentType}`);
    }

    const content = await body.text();
    const parsedUrl = new URL(url);
    const site = parsedUrl.hostname;

    // Handle HTML content with Readability
    if (contentType.includes("text/html")) {
      const dom = new JSDOM(content, { url });
      const document = dom.window.document;

      // Use Readability to extract main article content
      const reader = new Readability(document);
      const article = reader.parse();

      // Extract title
      const title =
        article?.title ||
        document.querySelector("title")?.textContent?.trim() ||
        "Untitled";

      // Extract meta description for excerpt
      const metaDescription =
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content") ||
        document
          .querySelector('meta[property="og:description"]')
          ?.getAttribute("content") ||
        "";

      // Get main text content
      const textContent =
        article?.textContent ||
        document.body?.textContent ||
        content.replace(/<[^>]*>/g, "").trim();

      // Trim text to 100k characters
      const trimmedText = textContent.slice(0, 100000);

      return {
        url,
        site,
        title,
        excerpt: metaDescription.slice(0, 500), // Limit excerpt length
        text: trimmedText,
      };
    }

    // Handle JSON content
    if (contentType.includes("application/json")) {
      try {
        const jsonData = JSON.parse(content);
        return {
          url,
          site,
          title: "JSON Data",
          excerpt: "JSON data content",
          text: JSON.stringify(jsonData, null, 2).slice(0, 100000),
        };
      } catch {
        // Fall through to plain text handling
      }
    }

    // Handle plain text content
    return {
      url,
      site,
      title: "Text Content",
      excerpt: content.slice(0, 200).replace(/\s+/g, " ").trim(),
      text: content.slice(0, 100000),
    };
  } catch (error) {
    console.error("HTTP fetch error:", error);

    const parsedUrl = new URL(url).hostname;
    return {
      url,
      site: parsedUrl,
      title: "Error",
      excerpt: `Failed to fetch content: ${error instanceof Error ? error.message : "Unknown error"}`,
      text: `Failed to fetch content from ${url}: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Legacy function for backwards compatibility
export async function httpFetch(params: HttpFetchParams) {
  const result = await http_fetch(params);
  return {
    ...result,
    content: result.text,
    textContent: result.text,
    citations: [result.url],
  };
}
