/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DDoS attacks
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// ✅ Fix #11: Named constants for rate limit configuration
const RATE_LIMIT_WINDOWS = {
  FIFTEEN_MINUTES: 15 * 60 * 1000,
  ONE_MINUTE: 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
} as const;

const RATE_LIMIT_MAX_REQUESTS = {
  API_GENERAL: 100,
  AI_ENDPOINTS: 10,
  STRICT_ENDPOINTS: 20,
  FILE_UPLOADS: 30,
} as const;

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
  // Skip successful requests to health check endpoints
  skip: (req) => req.path === "/health" || req.path === "/api/health/db",
});

/**
 * AI endpoint rate limiter
 * Applied to AI-heavy routes (chat, step execution)
 * Limits: 10 requests per minute per IP
 * More restrictive due to expensive AI operations
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
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `ai:${ipKeyGenerator(ip)}`;
  },
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
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `strict:${ipKeyGenerator(ip)}`;
  },
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
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `upload:${ipKeyGenerator(ip)}`;
  },
});
