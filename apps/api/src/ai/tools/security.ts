/**
 * Security configuration and validation for web tools
 * Prevents prompt injection, SSRF, and runaway fetches
 */

import { URL } from "url";
import pino from "pino";

const logger = pino({ name: "tool-security" });

// Security Configuration
export const SECURITY_CONFIG = {
  // Size limits
  MAX_RESPONSE_SIZE: 500_000, // 500KB max response
  MAX_TEXT_LENGTH: 100_000, // 100K characters max for text
  MAX_JSON_SIZE: 250_000, // 250KB max for JSON

  // Time limits
  REQUEST_TIMEOUT: 10_000, // 10 seconds max

  // Hostname restrictions
  BLOCKED_HOSTS: [
    // Private IP ranges (SSRF protection)
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    // Private networks
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/, // Link-local
    /^::1$/, // IPv6 localhost
    /^fe80:/i, // IPv6 link-local
    /^fc00:/i, // IPv6 private
    // Cloud metadata endpoints (SSRF protection)
    "169.254.169.254", // AWS/GCP/Azure metadata
    "metadata.google.internal",
    // Other potentially dangerous hosts
    "*.internal",
    "*.local",
  ],

  // Allowed domains (empty = allow all except blocked)
  // If populated, only these domains are allowed
  ALLOWED_HOSTS: [] as string[],

  // Content-Type validation
  ALLOWED_CONTENT_TYPES: [
    "text/html",
    "text/plain",
    "text/xml",
    "application/json",
    "application/xml",
    "application/xhtml+xml",
    "text/csv",
    "text/markdown",
  ],

  // Dangerous content patterns (basic prompt injection detection)
  DANGEROUS_PATTERNS: [
    /ignore\s+(all\s+)?previous\s+(instructions|prompts)/i,
    /forget\s+(everything|all)/i,
    /you\s+are\s+(now|going\s+to\s+be)/i,
    /new\s+(instructions|system\s+prompt)/i,
    /disregard\s+(previous|above)/i,
    /<script[^>]*>/i, // XSS
    /javascript:/i, // XSS
    /on\w+\s*=/i, // Event handlers
  ],
};

/**
 * Validates a URL for security concerns
 * @throws Error if URL is invalid or blocked
 */
export function validateUrl(urlString: string): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlString);
  } catch {
    logger.warn({ url: urlString }, "Invalid URL format");
    throw new Error("Invalid URL format");
  }

  // Only allow http/https protocols
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    logger.warn(
      { url: urlString, protocol: parsedUrl.protocol },
      "Invalid protocol",
    );
    throw new Error(
      `Protocol not allowed: ${parsedUrl.protocol}. Only http/https are supported.`,
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Check allowlist (if configured)
  if (SECURITY_CONFIG.ALLOWED_HOSTS.length > 0) {
    const isAllowed = SECURITY_CONFIG.ALLOWED_HOSTS.some((allowed) => {
      return (
        hostname === allowed.toLowerCase() ||
        hostname.endsWith(`.${allowed.toLowerCase()}`)
      );
    });

    if (!isAllowed) {
      logger.warn({ url: urlString, hostname }, "Hostname not in allowlist");
      throw new Error(
        `Access to ${hostname} is not allowed. Only approved domains can be fetched.`,
      );
    }
  }

  // Check blocklist
  for (const blocked of SECURITY_CONFIG.BLOCKED_HOSTS) {
    if (typeof blocked === "string") {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        logger.warn({ url: urlString, hostname, blocked }, "Blocked hostname");
        throw new Error(
          `Access to ${hostname} is blocked for security reasons (private network/internal host).`,
        );
      }
    } else if (blocked instanceof RegExp) {
      if (blocked.test(hostname)) {
        logger.warn(
          { url: urlString, hostname, pattern: blocked.source },
          "Blocked hostname pattern",
        );
        throw new Error(
          `Access to ${hostname} is blocked for security reasons (matches blocked pattern).`,
        );
      }
    }
  }

  logger.info({ url: urlString, hostname }, "URL validation passed");
  return parsedUrl;
}

/**
 * Validates Content-Type header
 * @throws Error if content type is not allowed
 */
export function validateContentType(contentType: string): void {
  const normalizedType = contentType.toLowerCase().split(";")[0].trim();

  const isAllowed = SECURITY_CONFIG.ALLOWED_CONTENT_TYPES.some((allowed) => {
    return (
      normalizedType === allowed.toLowerCase() ||
      normalizedType.startsWith(allowed.toLowerCase() + "/")
    );
  });

  if (!isAllowed) {
    logger.warn({ contentType: normalizedType }, "Content-Type not allowed");
    throw new Error(
      `Content-Type not allowed: ${normalizedType}. Only text/HTML/JSON content is supported.`,
    );
  }

  logger.debug(
    { contentType: normalizedType },
    "Content-Type validation passed",
  );
}

/**
 * Sanitizes and truncates text content
 * Removes dangerous patterns and limits size
 */
export function sanitizeText(
  text: string,
  maxLength = SECURITY_CONFIG.MAX_TEXT_LENGTH,
): string {
  let sanitized = text;

  // Check for dangerous patterns
  for (const pattern of SECURITY_CONFIG.DANGEROUS_PATTERNS) {
    if (pattern.test(sanitized)) {
      logger.warn(
        { pattern: pattern.source },
        "Dangerous pattern detected in content",
      );
      // Replace with safe placeholder
      sanitized = sanitized.replace(pattern, "[CONTENT FILTERED]");
    }
  }

  // Truncate to max length
  if (sanitized.length > maxLength) {
    logger.info(
      { original: sanitized.length, truncated: maxLength },
      "Content truncated",
    );
    sanitized =
      sanitized.slice(0, maxLength) +
      "\n\n[Content truncated due to size limits]";
  }

  return sanitized;
}

/**
 * Sanitizes JSON content
 * Validates structure and limits size
 */
export function sanitizeJson(jsonString: string): string {
  // Check size before parsing
  if (jsonString.length > SECURITY_CONFIG.MAX_JSON_SIZE) {
    logger.warn(
      { size: jsonString.length, max: SECURITY_CONFIG.MAX_JSON_SIZE },
      "JSON too large",
    );
    throw new Error(
      `JSON response too large (${jsonString.length} bytes). Maximum is ${SECURITY_CONFIG.MAX_JSON_SIZE} bytes.`,
    );
  }

  try {
    // Parse to validate
    const parsed = JSON.parse(jsonString);

    // Check for dangerous patterns in stringified version
    const stringified = JSON.stringify(parsed, null, 2);

    for (const pattern of SECURITY_CONFIG.DANGEROUS_PATTERNS) {
      if (pattern.test(stringified)) {
        logger.warn({ pattern: pattern.source }, "Dangerous pattern in JSON");
        throw new Error(
          "JSON content contains potentially dangerous patterns and was rejected.",
        );
      }
    }

    // Return pretty-printed version (truncated if needed)
    return sanitizeText(stringified, SECURITY_CONFIG.MAX_JSON_SIZE);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.warn("Invalid JSON structure");
      throw new Error("Invalid JSON format");
    }
    throw error;
  }
}

/**
 * Validates response size before processing
 */
export function validateResponseSize(size: number): void {
  if (size > SECURITY_CONFIG.MAX_RESPONSE_SIZE) {
    logger.warn(
      { size, max: SECURITY_CONFIG.MAX_RESPONSE_SIZE },
      "Response too large",
    );
    throw new Error(
      `Response too large (${size} bytes). Maximum is ${SECURITY_CONFIG.MAX_RESPONSE_SIZE} bytes.`,
    );
  }
}

/**
 * Creates safe request options with security headers and timeout
 */
export function createSafeRequestOptions() {
  return {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; AI-Assistant/1.0; +security-scan)",
      Accept: SECURITY_CONFIG.ALLOWED_CONTENT_TYPES.join(", "),
      "Accept-Language": "en-US,en;q=0.9",
    },
    // Timeout to prevent hanging requests
    bodyTimeout: SECURITY_CONFIG.REQUEST_TIMEOUT,
    headersTimeout: SECURITY_CONFIG.REQUEST_TIMEOUT,
    // Limit response size
    maxResponseSize: SECURITY_CONFIG.MAX_RESPONSE_SIZE,
  };
}

/**
 * Extracts safe metadata from response headers
 */
export function extractSafeMetadata(
  headers: Record<string, string | string[]>,
): {
  contentType: string;
  contentLength: number | null;
  server: string | null;
} {
  const contentType = Array.isArray(headers["content-type"])
    ? headers["content-type"][0]
    : headers["content-type"] || "text/plain";

  const contentLengthStr = Array.isArray(headers["content-length"])
    ? headers["content-length"][0]
    : headers["content-length"];
  const contentLength = contentLengthStr
    ? parseInt(contentLengthStr, 10)
    : null;

  const server = Array.isArray(headers["server"])
    ? headers["server"][0]
    : headers["server"] || null;

  return {
    contentType,
    contentLength,
    server,
  };
}
