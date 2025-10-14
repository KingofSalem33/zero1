/**
 * Retry and timeout configuration for tool execution
 * Implements exponential backoff and per-tool timeout limits
 */

import pino from "pino";

const logger = pino({ name: "tool-retry" });

// Retry configuration per tool type
export const RETRY_CONFIG = {
  // HTTP-based tools (web_search, http_fetch)
  http: {
    maxRetries: 3,
    initialDelayMs: 1000, // 1 second
    maxDelayMs: 10000, // 10 seconds
    backoffMultiplier: 2,
    timeoutMs: 15000, // 15 seconds per attempt
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  },

  // Computation tools (calculator)
  computation: {
    maxRetries: 2,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    timeoutMs: 5000, // 5 seconds
  },

  // File search tools
  fileSearch: {
    maxRetries: 2,
    initialDelayMs: 500,
    maxDelayMs: 2000,
    backoffMultiplier: 2,
    timeoutMs: 10000, // 10 seconds
  },
};

// Redirect configuration
export const REDIRECT_CONFIG = {
  maxRedirects: 5, // Maximum number of redirects to follow
  allowCrossDomain: true, // Allow redirects to different domains
  validateRedirectUrl: true, // Validate each redirect URL for security
};

// Fetch size configuration
export const FETCH_SIZE_CONFIG = {
  maxChunkSize: 65536, // 64KB per chunk
  maxTotalSize: 500000, // 500KB total (matches SECURITY_CONFIG)
  streamingBufferSize: 16384, // 16KB streaming buffer
};

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  timeoutMs?: number;
}

export interface RetryContext {
  attempt: number;
  lastError?: Error;
  totalElapsedMs: number;
  startTime: number;
}

/**
 * Calculates delay for exponential backoff with jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryOptions,
): number {
  const baseDelay = config.initialDelayMs || 1000;
  const maxDelay = config.maxDelayMs || 10000;
  const multiplier = config.backoffMultiplier || 2;

  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = baseDelay * Math.pow(multiplier, attempt - 1);

  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±25% randomness) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  const finalDelay = Math.max(0, cappedDelay + jitter);

  logger.debug(
    { attempt, baseDelay, exponentialDelay, cappedDelay, finalDelay },
    "Calculated backoff delay",
  );

  return finalDelay;
}

/**
 * Determines if an error is retryable
 */
export function isRetryableError(
  error: unknown,
  config: RetryOptions,
): boolean {
  if (!(error instanceof Error)) return false;

  const errorMessage = error.message.toLowerCase();

  // Network errors (retryable)
  const networkErrors = [
    "econnrefused",
    "econnreset",
    "etimedout",
    "enetunreach",
    "enotfound",
    "socket hang up",
    "network timeout",
  ];

  for (const netError of networkErrors) {
    if (errorMessage.includes(netError)) {
      logger.info({ error: errorMessage }, "Retryable network error detected");
      return true;
    }
  }

  // HTTP status code errors (check retryable status codes)
  const statusMatch = errorMessage.match(/http[s]?\s+(\d{3})/i);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1], 10);
    const retryableCodes = (config as { retryableStatusCodes?: number[] })
      .retryableStatusCodes || [408, 429, 500, 502, 503, 504];

    if (retryableCodes.includes(statusCode)) {
      logger.info({ statusCode }, "Retryable HTTP status code");
      return true;
    }
  }

  // Rate limit errors (retryable)
  if (
    errorMessage.includes("rate limit") ||
    errorMessage.includes("too many requests")
  ) {
    logger.info("Rate limit error detected");
    return true;
  }

  // Timeout errors (retryable)
  if (
    errorMessage.includes("timeout") ||
    errorMessage.includes("timed out") ||
    errorMessage.includes("deadline exceeded")
  ) {
    logger.info("Timeout error detected");
    return true;
  }

  // Non-retryable errors
  const nonRetryablePatterns = [
    "access.*blocked",
    "permission denied",
    "unauthorized",
    "forbidden",
    "not found",
    "invalid.*format",
    "parse error",
    "content filtered",
    "dangerous pattern",
  ];

  for (const pattern of nonRetryablePatterns) {
    if (new RegExp(pattern, "i").test(errorMessage)) {
      logger.info({ error: errorMessage }, "Non-retryable error detected");
      return false;
    }
  }

  logger.debug({ error: errorMessage }, "Error not explicitly retryable");
  return false;
}

/**
 * Executes a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  toolName: string,
  config: RetryOptions,
): Promise<T> {
  const maxRetries = config.maxRetries || 3;
  const context: RetryContext = {
    attempt: 0,
    totalElapsedMs: 0,
    startTime: Date.now(),
  };

  while (context.attempt <= maxRetries) {
    context.attempt++;

    try {
      logger.info(
        {
          toolName,
          attempt: context.attempt,
          maxRetries,
        },
        "Attempting tool execution",
      );

      // Execute with timeout
      const result = await withTimeout(fn, config.timeoutMs || 15000, toolName);

      logger.info(
        {
          toolName,
          attempt: context.attempt,
          elapsedMs: Date.now() - context.startTime,
        },
        "Tool execution succeeded",
      );

      return result;
    } catch (error) {
      context.lastError =
        error instanceof Error ? error : new Error(String(error));
      context.totalElapsedMs = Date.now() - context.startTime;

      logger.warn(
        {
          toolName,
          attempt: context.attempt,
          maxRetries,
          error: context.lastError.message,
          elapsedMs: context.totalElapsedMs,
        },
        "Tool execution failed",
      );

      // Check if we should retry
      const isLastAttempt = context.attempt >= maxRetries;
      const shouldRetry = isRetryableError(error, config);

      if (isLastAttempt || !shouldRetry) {
        logger.error(
          {
            toolName,
            attempt: context.attempt,
            error: context.lastError.message,
            reason: isLastAttempt ? "max retries" : "non-retryable error",
          },
          "Tool execution failed permanently",
        );
        throw context.lastError;
      }

      // Calculate backoff delay
      const delayMs = calculateBackoffDelay(context.attempt, config);

      logger.info(
        {
          toolName,
          attempt: context.attempt,
          delayMs,
          nextAttempt: context.attempt + 1,
        },
        "Retrying after backoff delay",
      );

      // Wait before retrying
      await sleep(delayMs);
    }
  }

  // Should never reach here, but TypeScript needs it
  throw context.lastError || new Error("Retry loop completed without result");
}

/**
 * Executes a function with a timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      logger.warn({ operationName, timeoutMs }, "Operation timed out");
      reject(
        new Error(
          `Operation '${operationName}' timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Sleep utility for backoff delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get retry config for a specific tool
 */
export function getToolRetryConfig(toolName: string): RetryOptions {
  switch (toolName) {
    case "web_search":
    case "http_fetch":
      return RETRY_CONFIG.http;
    case "calculator":
      return RETRY_CONFIG.computation;
    case "file_search":
      return RETRY_CONFIG.fileSearch;
    default:
      logger.warn({ toolName }, "Unknown tool, using default HTTP config");
      return RETRY_CONFIG.http;
  }
}
