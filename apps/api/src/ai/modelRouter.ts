/**
 * Model Router
 * Task-specific model selection for optimal cost/quality tradeoffs
 */

import { ENV } from "../env";
import pino from "pino";

const logger = pino({ name: "modelRouter" });

/**
 * Task types that determine model selection
 */
export type TaskType =
  | "synopsis" // Quick summary, low complexity
  | "deep_exegesis" // Deep study, requires reasoning
  | "connection" // Verse connection analysis
  | "fact_extraction" // Extract facts from conversation
  | "chapter_footer" // Generate chapter exploration cards
  | "thread_summary" // Summarize conversation thread
  | "simple_response" // Simple Q&A, low complexity
  | "classification" // Intent classification, routing
  | "embedding_prep"; // Prepare text for embedding

/**
 * Model configuration for a task
 */
export interface ModelConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  description: string;
}

/**
 * Model tier definitions
 * Using ENV variables for configurability
 */
const MODEL_TIERS = {
  // Fast/cheap tier - for simple tasks
  fast: ENV.OPENAI_FAST_MODEL,
  // Smart/balanced tier - for most tasks
  smart: ENV.OPENAI_SMART_MODEL,
  // Default/base tier
  default: ENV.OPENAI_MODEL_NAME,
} as const;

/**
 * Model configuration map by task type
 */
const MODEL_CONFIGS: Record<TaskType, ModelConfig> = {
  synopsis: {
    model: MODEL_TIERS.fast,
    temperature: 0.3,
    maxTokens: 500,
    verbosity: "low",
    description: "Quick summary generation",
  },

  deep_exegesis: {
    model: MODEL_TIERS.smart,
    temperature: 0.7,
    maxTokens: 2000,
    reasoningEffort: "medium",
    verbosity: "medium",
    description: "Deep Scripture study with reasoning",
  },

  connection: {
    model: MODEL_TIERS.smart,
    temperature: 0.5,
    maxTokens: 1000,
    reasoningEffort: "low",
    verbosity: "medium",
    description: "Verse connection analysis",
  },

  fact_extraction: {
    model: MODEL_TIERS.fast,
    temperature: 0.1,
    maxTokens: 500,
    verbosity: "low",
    description: "Extract structured facts from text",
  },

  chapter_footer: {
    model: MODEL_TIERS.smart,
    temperature: 0.6,
    maxTokens: 1500,
    reasoningEffort: "low",
    verbosity: "medium",
    description: "Generate chapter exploration cards",
  },

  thread_summary: {
    model: MODEL_TIERS.fast,
    temperature: 0.2,
    maxTokens: 800,
    verbosity: "low",
    description: "Summarize conversation thread",
  },

  simple_response: {
    model: MODEL_TIERS.fast,
    temperature: 0.5,
    maxTokens: 500,
    verbosity: "low",
    description: "Simple Q&A responses",
  },

  classification: {
    model: MODEL_TIERS.fast,
    temperature: 0.0,
    maxTokens: 100,
    verbosity: "low",
    description: "Intent classification and routing",
  },

  embedding_prep: {
    model: MODEL_TIERS.fast,
    temperature: 0.0,
    maxTokens: 200,
    verbosity: "low",
    description: "Prepare text for embedding",
  },
};

/**
 * Get model configuration for a given task type
 */
export function getModelConfig(task: TaskType): ModelConfig {
  const config = MODEL_CONFIGS[task];

  logger.debug(
    {
      task,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
    },
    "Selected model config for task",
  );

  return config;
}

/**
 * Get model name for a task (convenience function)
 */
export function getModelForTask(task: TaskType): string {
  return MODEL_CONFIGS[task].model;
}

/**
 * Infer task type from context signals
 * This is a heuristic-based classification
 */
export function inferTaskType(signals: {
  promptMode?: string;
  hasVisualBundle?: boolean;
  messageLength?: number;
  isFollowUp?: boolean;
  requiresReasoning?: boolean;
}): TaskType {
  const {
    promptMode,
    hasVisualBundle,
    messageLength = 0,
    isFollowUp,
  } = signals;

  // Map-based navigation
  if (promptMode === "go_deeper_short" || hasVisualBundle) {
    return "connection";
  }

  // Long detailed study request
  if (promptMode === "exegesis_long" || messageLength > 200) {
    return "deep_exegesis";
  }

  // Quick follow-up questions
  if (isFollowUp && messageLength < 50) {
    return "simple_response";
  }

  // Default to deep exegesis for Bible study context
  return "deep_exegesis";
}

/**
 * Model usage statistics tracker
 * Useful for monitoring and optimization
 */
export interface ModelUsageStats {
  task: TaskType;
  model: string;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
    cached?: number;
  };
  latencyMs: number;
  timestamp: number;
}

// In-memory stats buffer (flushed periodically if needed)
const usageStats: ModelUsageStats[] = [];
const MAX_STATS_BUFFER = 100;

/**
 * Record model usage for analytics
 */
export function recordModelUsage(stats: ModelUsageStats): void {
  usageStats.push(stats);

  // Keep buffer bounded
  if (usageStats.length > MAX_STATS_BUFFER) {
    usageStats.shift();
  }

  logger.info(
    {
      task: stats.task,
      model: stats.model,
      tokens: stats.tokenUsage.total,
      latency: stats.latencyMs,
      cacheHit: stats.tokenUsage.cached ? true : false,
    },
    "Model usage recorded",
  );
}

/**
 * Get recent usage statistics
 */
export function getRecentUsageStats(): ModelUsageStats[] {
  return [...usageStats];
}

/**
 * Get aggregated stats by model
 */
export function getAggregatedStats(): Record<
  string,
  {
    count: number;
    avgLatency: number;
    totalTokens: number;
    avgTokens: number;
  }
> {
  const aggregated: Record<
    string,
    { count: number; totalLatency: number; totalTokens: number }
  > = {};

  for (const stat of usageStats) {
    if (!aggregated[stat.model]) {
      aggregated[stat.model] = { count: 0, totalLatency: 0, totalTokens: 0 };
    }
    aggregated[stat.model].count++;
    aggregated[stat.model].totalLatency += stat.latencyMs;
    aggregated[stat.model].totalTokens += stat.tokenUsage.total;
  }

  const result: Record<
    string,
    {
      count: number;
      avgLatency: number;
      totalTokens: number;
      avgTokens: number;
    }
  > = {};

  for (const [model, data] of Object.entries(aggregated)) {
    result[model] = {
      count: data.count,
      avgLatency: Math.round(data.totalLatency / data.count),
      totalTokens: data.totalTokens,
      avgTokens: Math.round(data.totalTokens / data.count),
    };
  }

  return result;
}
