/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DDoS attacks
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

// ✅ Fix #11: Named constants for rate limit configuration
const RATE_LIMIT_WINDOWS = {
  FIFTEEN_MINUTES: 15 * 60 * 1000,
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
} as const;

const RATE_LIMIT_MAX_REQUESTS = {
  API_GENERAL: 100,
  AI_ENDPOINTS: 50, // Increased from 10 to 50 for better dev/testing experience
  STRICT_ENDPOINTS: 20,
  FILE_UPLOADS: 30,
  READ_ONLY: 300, // Higher limit for read-only endpoints (polling)
  VERSE_READ: 900, // Verse lookups can burst from reader/reference UIs
} as const;

function readHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value.find((entry) => typeof entry === "string" && entry.trim());
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveRateLimitClientIp(req: Request): string {
  const headerIp =
    readHeaderValue(req.headers["true-client-ip"]) ||
    readHeaderValue(req.headers["cf-connecting-ip"]) ||
    readHeaderValue(req.headers["x-real-ip"]);

  return headerIp || req.ip || req.socket.remoteAddress || "unknown";
}

function buildRateLimitKey(prefix: string, req: Request): string {
  return `${prefix}:${ipKeyGenerator(resolveRateLimitClientIp(req))}`;
}

/**
 * General API rate limiter
 * Applied to all /api routes
 * Limits: 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOWS.FIFTEEN_MINUTES,
  max: RATE_LIMIT_MAX_REQUESTS.API_GENERAL,
  message: {
    error: "Too many requests",
    message: "You have exceeded the rate limit. Please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  keyGenerator: (req) => buildRateLimitKey("api", req),
  // Skip read-only traffic here; GET endpoints are protected by route-level
  // `readOnlyLimiter` where needed, which avoids accidental double-limiting.
  skip: (req) => {
    if (req.method === "GET") return true;
    const normalizedPath = req.path.toLowerCase();
    return (
      normalizedPath === "/health" ||
      normalizedPath === "/health/db" ||
      normalizedPath === "/api/health/db"
    );
  },
});

/**
 * AI endpoint rate limiter
 * Applied to AI-heavy routes (chat, step execution)
 * Limits: 50 requests per minute per IP
 * Allows for interactive development while preventing abuse
 */
export const aiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOWS.ONE_MINUTE,
  max: RATE_LIMIT_MAX_REQUESTS.AI_ENDPOINTS,
  message: {
    error: "AI request limit exceeded",
    message:
      "You have made too many AI requests. Please wait before trying again.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use a different store key to track AI requests separately
  keyGenerator: (req) => buildRateLimitKey("ai", req),
});

/**
 * Strict rate limiter for sensitive operations
 * Applied to authentication, file uploads, etc.
 * Limits: 20 requests per 15 minutes per IP
 */
export const strictLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOWS.FIFTEEN_MINUTES,
  max: RATE_LIMIT_MAX_REQUESTS.STRICT_ENDPOINTS,
  message: {
    error: "Rate limit exceeded",
    message: "Too many requests to this endpoint. Please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => buildRateLimitKey("strict", req),
});

/**
 * File upload rate limiter
 * Applied to artifact/file upload endpoints
 * Limits: 30 uploads per hour per IP
 */
export const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOWS.ONE_HOUR,
  max: RATE_LIMIT_MAX_REQUESTS.FILE_UPLOADS,
  message: {
    error: "Upload limit exceeded",
    message: "You have exceeded the file upload limit. Please try again later.",
    retryAfter: "1 hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => buildRateLimitKey("upload", req),
});

/**
 * Read-only endpoint rate limiter
 * Applied to GET endpoints that are polled frequently
 * Limits: 300 requests per 15 minutes per IP
 * More permissive since these are lightweight read operations
 */
export const readOnlyLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOWS.FIFTEEN_MINUTES,
  max: RATE_LIMIT_MAX_REQUESTS.READ_ONLY,
  message: {
    error: "Too many requests",
    message: "You are polling too frequently. Please slow down.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => buildRateLimitKey("readonly", req),
});

/**
 * Verse-specific read limiter
 * Applied only to /api/verse endpoints to isolate heavy reader traffic
 * from other read-only routes.
 */
export const verseReadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOWS.FIFTEEN_MINUTES,
  max: RATE_LIMIT_MAX_REQUESTS.VERSE_READ,
  message: {
    error: "Too many verse requests",
    message: "Verse lookups are happening too quickly. Please slow down.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => buildRateLimitKey("verse", req),
});
