import { request } from "undici";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { HttpFetchParams } from "../schemas";

export interface FetchResult {
  url: string;
  title: string;
  content: string;
  textContent: string;
  citations: string[];
}

export async function httpFetch(params: HttpFetchParams): Promise<FetchResult> {
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
    const content = await body.text();

    // Handle different content types
    if (contentType.includes("text/html")) {
      // Parse HTML and extract readable content
      const dom = new JSDOM(content, { url });
      const document = dom.window.document;

      // Use Readability to extract main content
      const reader = new Readability(document);
      const article = reader.parse();

      const title =
        article?.title ||
        document.querySelector("title")?.textContent ||
        "Untitled";

      const textContent =
        article?.textContent ||
        document.body?.textContent ||
        content.replace(/<[^>]*>/g, "").trim();

      return {
        url,
        title,
        content: article?.content || content,
        textContent: textContent.slice(0, 8000), // Limit content size
        citations: [url],
      };
    } else if (contentType.includes("application/json")) {
      // Handle JSON content
      try {
        const jsonData = JSON.parse(content);
        return {
          url,
          title: "JSON Data",
          content: JSON.stringify(jsonData, null, 2),
          textContent: JSON.stringify(jsonData, null, 2),
          citations: [url],
        };
      } catch {
        // Fallback to text content
      }
    }

    // Default text content handling
    return {
      url,
      title: "Text Content",
      content,
      textContent: content.slice(0, 8000),
      citations: [url],
    };
  } catch (error) {
    console.error("HTTP fetch error:", error);

    return {
      url,
      title: "Error",
      content: `Failed to fetch content from ${url}: ${error instanceof Error ? error.message : "Unknown error"}`,
      textContent: `Failed to fetch content from ${url}`,
      citations: [url],
    };
  }
}
