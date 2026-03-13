import { request } from "undici";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import type { HttpFetchParams } from "../schemas";
import {
  validateUrl,
  validateContentType,
  validateResponseSize,
  sanitizeText,
  sanitizeJson,
  createSafeRequestOptions,
  extractSafeMetadata,
  SECURITY_CONFIG,
} from "./security";
import pino from "pino";

const logger = pino({ name: "http_fetch" });

export interface FetchResult {
  url: string;
  site: string;
  title: string;
  excerpt: string;
  text: string;
}

/**
 * Internal fetch implementation (will be wrapped with retry)
 */
async function fetchWithSecurity(urlString: string): Promise<FetchResult> {
  // Step 1: Validate URL (SSRF protection)
  const parsedUrl = validateUrl(urlString);
  const site = parsedUrl.hostname;

  logger.info({ url: urlString, site }, "Fetching URL");

  // Step 2: Make request with security options and redirect handling
  const requestOptions = createSafeRequestOptions();

  // Configure undici to handle redirects
  // Undici follows redirects by default (up to 10)
  const { body, statusCode, headers } = await request(
    urlString,
    requestOptions,
  );

  // Step 3: Validate status code
  if (statusCode >= 400) {
    logger.warn({ url: urlString, statusCode }, "HTTP error");
    throw new Error(`HTTP ${statusCode}`);
  }

  // Step 4: Extract and validate metadata
  const metadata = extractSafeMetadata(
    headers as Record<string, string | string[]>,
  );
  const { contentType, contentLength } = metadata;

  logger.info(
    { url: urlString, contentType, contentLength },
    "Response received",
  );

  // Step 5: Validate content length if provided
  if (contentLength !== null) {
    validateResponseSize(contentLength);
  }

  // Step 6: Validate Content-Type
  validateContentType(contentType);

  // Step 7: Read response body with size limit
  let content = "";
  let bytesRead = 0;

  for await (const chunk of body) {
    bytesRead += chunk.length;

    // Enforce size limit during streaming
    if (bytesRead > SECURITY_CONFIG.MAX_RESPONSE_SIZE) {
      logger.warn(
        { url: urlString, bytesRead },
        "Response size limit exceeded during read",
      );
      throw new Error(
        `Response exceeds maximum size of ${SECURITY_CONFIG.MAX_RESPONSE_SIZE} bytes`,
      );
    }

    content += chunk.toString("utf-8");
  }

  logger.info({ url: urlString, size: bytesRead }, "Response body read");

  // Step 8: Process content based on type
  const normalizedContentType = contentType.toLowerCase();

  // Handle HTML content with Readability
  if (
    normalizedContentType.includes("text/html") ||
    normalizedContentType.includes("application/xhtml")
  ) {
    try {
      const dom = new JSDOM(content, { url: urlString });
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

      // Sanitize and truncate text
      const sanitizedText = sanitizeText(textContent);
      const sanitizedExcerpt = sanitizeText(metaDescription, 500);

      logger.info(
        {
          url: urlString,
          titleLength: title.length,
          textLength: sanitizedText.length,
        },
        "HTML parsed",
      );

      return {
        url: urlString,
        site,
        title: sanitizeText(title, 200),
        excerpt: sanitizedExcerpt,
        text: sanitizedText,
      };
    } catch (parseError) {
      logger.error(
        { url: urlString, error: parseError },
        "HTML parsing failed",
      );
      throw new Error(
        `Failed to parse HTML content: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
      );
    }
  }

  // Handle JSON content
  if (normalizedContentType.includes("application/json")) {
    try {
      // Validate and sanitize JSON
      const sanitizedJson = sanitizeJson(content);

      logger.info(
        { url: urlString, jsonLength: sanitizedJson.length },
        "JSON processed",
      );

      return {
        url: urlString,
        site,
        title: "JSON Data",
        excerpt: "Structured JSON data content",
        text: sanitizedJson,
      };
    } catch (jsonError) {
      logger.error(
        { url: urlString, error: jsonError },
        "JSON processing failed",
      );

      if (
        jsonError instanceof Error &&
        jsonError.message.includes("dangerous patterns")
      ) {
        throw jsonError; // Re-throw security errors
      }

      // Fall through to plain text handling for invalid JSON
      logger.warn({ url: urlString }, "Falling back to plain text handling");
    }
  }

  // Handle plain text content (XML, CSV, Markdown, etc.)
  const sanitizedContent = sanitizeText(content);
  const excerpt = sanitizeText(
    content.slice(0, 200).replace(/\s+/g, " ").trim(),
    200,
  );

  logger.info(
    { url: urlString, textLength: sanitizedContent.length },
    "Plain text processed",
  );

  return {
    url: urlString,
    site,
    title: `${normalizedContentType} Content`,
    excerpt,
    text: sanitizedContent,
  };
}

/**
 * Main http_fetch function
 */
export async function http_fetch(
  params: HttpFetchParams,
): Promise<FetchResult> {
  const { url: urlString } = params;

  try {
    // Call fetch directly (retry removed)
    return await fetchWithSecurity(urlString);
  } catch (error) {
    logger.error(
      { url: urlString, error: error instanceof Error ? error.message : error },
      "HTTP fetch failed",
    );

    // Return error in safe format
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const safeSite = urlString.includes("://")
      ? new URL(urlString).hostname
      : "invalid-url";

    return {
      url: urlString,
      site: safeSite,
      title: "Error",
      excerpt: `Failed to fetch content: ${errorMessage}`,
      text: `Failed to fetch content from ${urlString}:\n\n${errorMessage}\n\nPlease verify the URL is correct and publicly accessible.`,
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
