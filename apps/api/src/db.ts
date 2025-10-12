import { createClient, PostgrestError } from "@supabase/supabase-js";
import { ENV } from "./env";
import pino from "pino";

const logger = pino({ name: "db" });

// Create Supabase client
export const supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false, // Server-side doesn't need session persistence
  },
  db: {
    schema: "public",
  },
  global: {
    headers: {
      "X-Client-Info": "zero1-api",
    },
  },
});

// Database types (will be auto-generated later)
export type Database = {
  projects: {
    id: string;
    user_id: string | null;
    goal: string | null;
    status: string | null;
    current_phase: string | null;
    completed_phases: string[];
    completed_substeps: string[];
    roadmap: Record<string, any>;
    created_at: string;
  };
  artifacts: {
    id: string;
    project_id: string;
    type: "single" | "zip" | "repo";
    file_path: string | null;
    file_name: string | null;
    repo_url: string | null;
    repo_branch: string | null;
    size_bytes: number | null;
    uploaded_at: string;
    analyzed_at: string | null;
    signals: Record<string, any>;
    analysis: Record<string, any>;
    status: "uploaded" | "analyzing" | "analyzed" | "failed";
    error_message: string | null;
  };
  artifact_signals: {
    artifact_id: string;
    has_tests: boolean;
    has_linter: boolean;
    has_typescript: boolean;
    has_prettier: boolean;
    has_git: boolean;
    last_commit_time: string | null;
    commit_count: number | null;
    has_deploy_config: boolean;
    deploy_platform: string | null;
    file_count: number;
    folder_depth: number;
    readme_length: number;
    has_documentation: boolean;
    tech_stack: string[];
    created_at: string;
  };
  checkpoints: {
    id: string;
    project_id: string;
    name: string | null;
    reason: string | null;
    created_by: string;
    current_phase: string | null;
    completed_substeps: string[];
    roadmap_snapshot: Record<string, any>;
    project_state_hash: string | null;
    artifact_ids: string[];
    created_at: string;
  };
};

/**
 * Database Error Types
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: string,
    public hint?: string,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, details?: string) {
    super(message, "CONNECTION_ERROR", details);
    this.name = "ConnectionError";
  }
}

export class QueryError extends DatabaseError {
  constructor(message: string, code?: string, details?: string, hint?: string) {
    super(message, code, details, hint);
    this.name = "QueryError";
  }
}

/**
 * Retry configuration options
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    "PGRST301", // Connection error
    "PGRST302", // Connection timeout
    "57P03", // Cannot connect now
    "08006", // Connection failure
    "08001", // Unable to connect
    "08003", // Connection does not exist
    "08004", // Connection rejected
    "53300", // Too many connections
  ],
};

/**
 * Check if error is retryable
 */
function isRetryableError(
  error: PostgrestError | Error,
  retryableErrors: string[],
): boolean {
  if ("code" in error && error.code) {
    return retryableErrors.includes(error.code);
  }

  // Network errors are retryable
  if (error.message.includes("fetch failed") || error.message.includes("ECONNREFUSED")) {
    return true;
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number,
): number {
  const exponentialDelay = initialDelay * Math.pow(multiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // Add jitter (±25%)
  const jitter = cappedDelay * 0.25 * (Math.random() - 0.5);
  return Math.floor(cappedDelay + jitter);
}

/**
 * Execute database operation with automatic retry logic
 *
 * @example
 * ```typescript
 * const project = await withRetry(
 *   () => supabase.from('projects').select('*').eq('id', projectId).single(),
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  options: RetryOptions = {},
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | PostgrestError | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      logger.debug(`[DB Retry] Attempt ${attempt + 1}/${config.maxRetries}`);

      const { data, error } = await operation();

      if (error) {
        lastError = error;

        // Check if error is retryable
        if (!isRetryableError(error, config.retryableErrors)) {
          logger.error(
            { error, attempt: attempt + 1 },
            "[DB] Non-retryable error encountered",
          );
          throw new QueryError(
            error.message,
            error.code,
            error.details,
            error.hint,
          );
        }

        // Log retryable error
        logger.warn(
          { error, attempt: attempt + 1, maxRetries: config.maxRetries },
          "[DB] Retryable error, will retry",
        );

        // If not last attempt, wait and retry
        if (attempt < config.maxRetries - 1) {
          const delay = calculateDelay(
            attempt,
            config.initialDelayMs,
            config.maxDelayMs,
            config.backoffMultiplier,
          );
          logger.debug(`[DB Retry] Waiting ${delay}ms before retry`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      } else if (data !== null) {
        // Success
        if (attempt > 0) {
          logger.info(
            { attempt: attempt + 1 },
            "[DB] Operation succeeded after retry",
          );
        }
        return data;
      } else {
        // No data and no error (shouldn't happen)
        throw new QueryError("No data returned and no error reported");
      }
    } catch (error) {
      // Handle unexpected errors (network issues, etc.)
      if (
        error instanceof QueryError ||
        error instanceof DatabaseError
      ) {
        throw error;
      }

      lastError = error as Error;

      if (isRetryableError(error as Error, config.retryableErrors)) {
        logger.warn(
          { error, attempt: attempt + 1 },
          "[DB] Network/connection error, will retry",
        );

        if (attempt < config.maxRetries - 1) {
          const delay = calculateDelay(
            attempt,
            config.initialDelayMs,
            config.maxDelayMs,
            config.backoffMultiplier,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      } else {
        throw error;
      }
    }
  }

  // Max retries exceeded
  logger.error(
    { lastError, maxRetries: config.maxRetries },
    "[DB] Max retries exceeded",
  );
  throw new ConnectionError(
    `Database operation failed after ${config.maxRetries} attempts`,
    lastError?.message,
  );
}

/**
 * Health check with connection pooling awareness
 */
export interface ConnectionHealth {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  timestamp: string;
}

let lastHealthCheck: ConnectionHealth | null = null;
let healthCheckInProgress = false;

export async function checkConnectionHealth(
  forceRefresh = false,
): Promise<ConnectionHealth> {
  // Return cached result if recent (within 30 seconds) and not forcing refresh
  if (
    !forceRefresh &&
    lastHealthCheck &&
    Date.now() - new Date(lastHealthCheck.timestamp).getTime() < 30000
  ) {
    return lastHealthCheck;
  }

  // Prevent concurrent health checks
  if (healthCheckInProgress) {
    return (
      lastHealthCheck || {
        healthy: false,
        error: "Health check in progress",
        timestamp: new Date().toISOString(),
      }
    );
  }

  healthCheckInProgress = true;

  try {
    const startTime = Date.now();

    const { error } = await supabase
      .from("projects")
      .select("count")
      .limit(1)
      .single();

    const latencyMs = Date.now() - startTime;

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows, which is fine for health check
      logger.error({ error }, "[DB] Health check failed");
      lastHealthCheck = {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    } else {
      logger.debug({ latencyMs }, "[DB] Health check passed");
      lastHealthCheck = {
        healthy: true,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    logger.error({ error }, "[DB] Health check exception");
    lastHealthCheck = {
      healthy: false,
      error: (error as Error).message,
      timestamp: new Date().toISOString(),
    };
  } finally {
    healthCheckInProgress = false;
  }

  return lastHealthCheck;
}

/**
 * Test connection (legacy function, use checkConnectionHealth instead)
 */
export async function testConnection(): Promise<boolean> {
  const health = await checkConnectionHealth(true);
  return health.healthy;
}