/**
 * Feedback Signal Collection
 * Tracks user signals and response metadata for learning and improvement
 */

import fs from "fs/promises";
import path from "path";
import pino from "pino";
import crypto from "crypto";

const logger = pino({ name: "feedback" });

/**
 * User feedback signals
 */
export type FeedbackSignal =
  | "thumbs_up"
  | "thumbs_down"
  | "regenerate"
  | "abandon"
  | "correction"
  | "expand"
  | "copy"
  | "share";

/**
 * Response metadata collected per request
 */
export interface ResponseMetadata {
  requestId: string;
  timestamp: number;
  userId?: string;

  // Performance metrics
  latencyMs: number;
  streamDurationMs?: number;

  // Token usage
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;

  // Content metrics
  citationCount: number;
  wordCount: number;
  hasH2Header: boolean;

  // Model info
  model: string;
  taskType?: string;

  // Quality signals
  validationPassed: boolean;
  guardrailsPassed: boolean;
  warningCount: number;
}

/**
 * User feedback entry
 */
export interface FeedbackEntry {
  requestId: string;
  signal: FeedbackSignal;
  timestamp: number;
  userId?: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated feedback stats
 */
export interface FeedbackStats {
  totalResponses: number;
  totalFeedback: number;
  signalCounts: Record<FeedbackSignal, number>;
  avgLatencyMs: number;
  avgCitations: number;
  validationPassRate: number;
  guardrailsPassRate: number;
}

// Storage configuration
const FEEDBACK_FILE = path.join(process.cwd(), "data", "feedback.json");

// In-memory stores
const responseMetadataStore: Map<string, ResponseMetadata> = new Map();
const feedbackStore: FeedbackEntry[] = [];

// Limits
const MAX_METADATA_ENTRIES = 1000;
const MAX_FEEDBACK_ENTRIES = 5000;
const METADATA_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Persistence
let isLoaded = false;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 10000; // Save after 10 seconds of inactivity

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Ensure data directory exists
 */
async function ensureDataDir(): Promise<void> {
  const dataDir = path.dirname(FEEDBACK_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

/**
 * Load feedback data from disk
 */
async function loadFeedbackStore(): Promise<void> {
  if (isLoaded) return;

  try {
    await ensureDataDir();
    const data = await fs.readFile(FEEDBACK_FILE, "utf-8");
    const parsed = JSON.parse(data);

    // Restore feedback entries
    if (Array.isArray(parsed.feedback)) {
      feedbackStore.push(...parsed.feedback.slice(-MAX_FEEDBACK_ENTRIES));
    }

    // Restore recent metadata
    if (Array.isArray(parsed.metadata)) {
      const now = Date.now();
      for (const meta of parsed.metadata) {
        if (now - meta.timestamp < METADATA_TTL_MS) {
          responseMetadataStore.set(meta.requestId, meta);
        }
      }
    }

    logger.info(
      {
        feedbackCount: feedbackStore.length,
        metadataCount: responseMetadataStore.size,
      },
      "Feedback store loaded from disk",
    );
  } catch {
    logger.info("Starting with empty feedback store");
  }

  isLoaded = true;
}

/**
 * Save feedback data to disk (debounced)
 */
async function saveFeedbackStoreDebounced(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(async () => {
    try {
      await ensureDataDir();
      const data = {
        feedback: feedbackStore.slice(-MAX_FEEDBACK_ENTRIES),
        metadata: Array.from(responseMetadataStore.values()).slice(
          -MAX_METADATA_ENTRIES,
        ),
        savedAt: new Date().toISOString(),
      };
      await fs.writeFile(FEEDBACK_FILE, JSON.stringify(data, null, 2));
      logger.debug("Feedback store saved to disk");
    } catch (error) {
      logger.error({ error }, "Failed to save feedback store");
    }
    saveTimeout = null;
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Force immediate save
 */
export async function flushFeedbackStore(): Promise<void> {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  try {
    await ensureDataDir();
    const data = {
      feedback: feedbackStore.slice(-MAX_FEEDBACK_ENTRIES),
      metadata: Array.from(responseMetadataStore.values()).slice(
        -MAX_METADATA_ENTRIES,
      ),
      savedAt: new Date().toISOString(),
    };
    await fs.writeFile(FEEDBACK_FILE, JSON.stringify(data, null, 2));
    logger.info("Feedback store flushed to disk");
  } catch (error) {
    logger.error({ error }, "Failed to flush feedback store");
  }
}

/**
 * Log response metadata for a request
 */
export async function logResponseMetadata(
  metadata: ResponseMetadata,
): Promise<void> {
  await loadFeedbackStore();

  // Add to store
  responseMetadataStore.set(metadata.requestId, metadata);

  // Enforce size limit (remove oldest)
  if (responseMetadataStore.size > MAX_METADATA_ENTRIES) {
    const entries = Array.from(responseMetadataStore.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(
      0,
      responseMetadataStore.size - MAX_METADATA_ENTRIES,
    );
    for (const [key] of toRemove) {
      responseMetadataStore.delete(key);
    }
  }

  logger.info(
    {
      requestId: metadata.requestId,
      latencyMs: metadata.latencyMs,
      citationCount: metadata.citationCount,
      validationPassed: metadata.validationPassed,
    },
    "Response metadata logged",
  );

  await saveFeedbackStoreDebounced();
}

/**
 * Log user feedback signal
 */
export async function logUserSignal(
  requestId: string,
  signal: FeedbackSignal,
  details?: string,
  userId?: string,
): Promise<void> {
  await loadFeedbackStore();

  const entry: FeedbackEntry = {
    requestId,
    signal,
    timestamp: Date.now(),
    userId,
    details,
  };

  // Try to link with response metadata
  const metadata = responseMetadataStore.get(requestId);
  if (metadata) {
    entry.metadata = {
      model: metadata.model,
      latencyMs: metadata.latencyMs,
      citationCount: metadata.citationCount,
    };
  }

  feedbackStore.push(entry);

  // Enforce size limit
  if (feedbackStore.length > MAX_FEEDBACK_ENTRIES) {
    feedbackStore.splice(0, feedbackStore.length - MAX_FEEDBACK_ENTRIES);
  }

  logger.info(
    {
      requestId,
      signal,
      hasLinkedMetadata: !!metadata,
    },
    "User feedback signal logged",
  );

  await saveFeedbackStoreDebounced();
}

/**
 * Get response metadata by request ID
 */
export async function getResponseMetadata(
  requestId: string,
): Promise<ResponseMetadata | null> {
  await loadFeedbackStore();
  return responseMetadataStore.get(requestId) || null;
}

/**
 * Get feedback entries for a request
 */
export async function getFeedbackForRequest(
  requestId: string,
): Promise<FeedbackEntry[]> {
  await loadFeedbackStore();
  return feedbackStore.filter((f) => f.requestId === requestId);
}

/**
 * Get aggregated feedback statistics
 */
export async function getFeedbackStats(
  options: {
    since?: number; // Timestamp
    userId?: string;
  } = {},
): Promise<FeedbackStats> {
  await loadFeedbackStore();

  const { since = 0, userId } = options;

  // Filter metadata
  let metadata = Array.from(responseMetadataStore.values());
  if (since) {
    metadata = metadata.filter((m) => m.timestamp >= since);
  }
  if (userId) {
    metadata = metadata.filter((m) => m.userId === userId);
  }

  // Filter feedback
  let feedback = [...feedbackStore];
  if (since) {
    feedback = feedback.filter((f) => f.timestamp >= since);
  }
  if (userId) {
    feedback = feedback.filter((f) => f.userId === userId);
  }

  // Calculate stats
  const signalCounts: Record<FeedbackSignal, number> = {
    thumbs_up: 0,
    thumbs_down: 0,
    regenerate: 0,
    abandon: 0,
    correction: 0,
    expand: 0,
    copy: 0,
    share: 0,
  };

  for (const f of feedback) {
    signalCounts[f.signal]++;
  }

  const totalLatency = metadata.reduce((sum, m) => sum + m.latencyMs, 0);
  const totalCitations = metadata.reduce((sum, m) => sum + m.citationCount, 0);
  const validationPassed = metadata.filter((m) => m.validationPassed).length;
  const guardrailsPassed = metadata.filter((m) => m.guardrailsPassed).length;

  return {
    totalResponses: metadata.length,
    totalFeedback: feedback.length,
    signalCounts,
    avgLatencyMs:
      metadata.length > 0 ? Math.round(totalLatency / metadata.length) : 0,
    avgCitations:
      metadata.length > 0
        ? Math.round((totalCitations / metadata.length) * 10) / 10
        : 0,
    validationPassRate:
      metadata.length > 0
        ? Math.round((validationPassed / metadata.length) * 100)
        : 0,
    guardrailsPassRate:
      metadata.length > 0
        ? Math.round((guardrailsPassed / metadata.length) * 100)
        : 0,
  };
}

/**
 * Get recent feedback entries
 */
export async function getRecentFeedback(
  limit: number = 50,
): Promise<FeedbackEntry[]> {
  await loadFeedbackStore();
  return feedbackStore.slice(-limit);
}

/**
 * Create metadata builder helper for streaming responses
 */
export function createMetadataBuilder(requestId: string): {
  requestId: string;
  startTime: number;
  setModel: (model: string) => void;
  setTaskType: (taskType: string) => void;
  setUserId: (userId: string) => void;
  setTokenUsage: (usage: {
    prompt?: number;
    completion?: number;
    cached?: number;
  }) => void;
  setContentMetrics: (metrics: {
    citations: number;
    words: number;
    hasH2: boolean;
  }) => void;
  setQualitySignals: (signals: {
    validation: boolean;
    guardrails: boolean;
    warnings: number;
  }) => void;
  build: () => ResponseMetadata;
} {
  const startTime = Date.now();
  let model = "unknown";
  let taskType: string | undefined;
  let userId: string | undefined;
  let promptTokens: number | undefined;
  let completionTokens: number | undefined;
  let cachedTokens: number | undefined;
  let citationCount = 0;
  let wordCount = 0;
  let hasH2Header = false;
  let validationPassed = true;
  let guardrailsPassed = true;
  let warningCount = 0;

  return {
    requestId,
    startTime,
    setModel: (m: string) => {
      model = m;
    },
    setTaskType: (t: string) => {
      taskType = t;
    },
    setUserId: (u: string) => {
      userId = u;
    },
    setTokenUsage: (usage) => {
      promptTokens = usage.prompt;
      completionTokens = usage.completion;
      cachedTokens = usage.cached;
    },
    setContentMetrics: (metrics) => {
      citationCount = metrics.citations;
      wordCount = metrics.words;
      hasH2Header = metrics.hasH2;
    },
    setQualitySignals: (signals) => {
      validationPassed = signals.validation;
      guardrailsPassed = signals.guardrails;
      warningCount = signals.warnings;
    },
    build: (): ResponseMetadata => ({
      requestId,
      timestamp: startTime,
      userId,
      latencyMs: Date.now() - startTime,
      promptTokens,
      completionTokens,
      totalTokens:
        promptTokens && completionTokens
          ? promptTokens + completionTokens
          : undefined,
      cachedTokens,
      citationCount,
      wordCount,
      hasH2Header,
      model,
      taskType,
      validationPassed,
      guardrailsPassed,
      warningCount,
    }),
  };
}
