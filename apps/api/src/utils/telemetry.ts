/**
 * Telemetry & Token Usage Tracking
 * Version: 1.0
 * Updated: 2026-01-01
 *
 * Tracks token usage, costs, and cache performance per endpoint.
 */

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  model: string;
  endpoint: string;
  promptVersion?: string;
}

/**
 * Model pricing (per 1K tokens)
 * Updated: 2026-01-01
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5-nano": {
    input: 0.00005, // $0.050 per 1M tokens
    output: 0.0004, // $0.400 per 1M tokens
  },
  "gpt-5-mini": {
    input: 0.00025, // $0.250 per 1M tokens
    output: 0.002, // $2.000 per 1M tokens
  },
  "gpt-5": {
    input: 0.00125, // $1.250 per 1M tokens
    output: 0.01, // $10.000 per 1M tokens
  },
  "gpt-4o-mini": {
    input: 0.00015, // $0.150 per 1M tokens
    output: 0.0006, // $0.600 per 1M tokens
  },
  "gpt-4.1-nano": {
    input: 0.0001, // $0.100 per 1M tokens
    output: 0.0004, // $0.400 per 1M tokens
  },
  "gpt-4.1-mini": {
    input: 0.0004, // $0.400 per 1M tokens
    output: 0.0016, // $1.600 per 1M tokens
  },
  "gpt-4o": {
    input: 0.0025, // $2.50 per 1M tokens
    output: 0.01, // $10.00 per 1M tokens
  },
  "o1-mini": {
    input: 0.003, // $3.00 per 1M tokens
    output: 0.012, // $12.00 per 1M tokens
  },
  "o1-preview": {
    input: 0.015, // $15.00 per 1M tokens
    output: 0.06, // $60.00 per 1M tokens
  },
};

/**
 * Calculate cost for a model request
 */
function calculateCost(usage: TokenUsage): number {
  const pricing = MODEL_PRICING[usage.model];

  if (!pricing) {
    console.warn(
      `[Telemetry] Unknown model pricing: ${usage.model}, using gpt-4o-mini rates`,
    );
    const fallback = MODEL_PRICING["gpt-4o-mini"];
    return (
      (usage.promptTokens / 1000) * fallback.input +
      (usage.completionTokens / 1000) * fallback.output
    );
  }

  const inputCost = (usage.promptTokens / 1000) * pricing.input;
  const outputCost = (usage.completionTokens / 1000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Calculate cache hit rate percentage
 */
function calculateCacheHitRate(usage: TokenUsage): string {
  if (!usage.cachedTokens || usage.promptTokens === 0) {
    return "0%";
  }

  const rate = (usage.cachedTokens / usage.promptTokens) * 100;
  return `${rate.toFixed(1)}%`;
}

/**
 * Log token usage and cost for an endpoint
 */
export function logTokenUsage(usage: TokenUsage): void {
  const cost = calculateCost(usage);
  const cacheHitRate = calculateCacheHitRate(usage);
  const savings = usage.cachedTokens
    ? (usage.cachedTokens / 1000) *
      (MODEL_PRICING[usage.model]?.input || 0.00015)
    : 0;

  console.log(
    `[Telemetry] ${usage.endpoint} | Model: ${usage.model} | ` +
      `Tokens: ${usage.totalTokens} (${usage.promptTokens} in, ${usage.completionTokens} out) | ` +
      `Cache: ${cacheHitRate} (saved $${savings.toFixed(6)}) | ` +
      `Cost: $${cost.toFixed(6)}` +
      (usage.promptVersion ? ` | Prompt: ${usage.promptVersion}` : ""),
  );
}

/**
 * Extract token usage from RunModelResult
 *
 * Note: The actual usage structure from OpenAI's Responses API needs to be verified.
 * This assumes a similar structure to Chat Completions API.
 */
export function extractTokenUsage(
  result: any,
  endpoint: string,
  model: string,
  promptVersion?: string,
): TokenUsage | null {
  const usage = result.usage;

  if (!usage) {
    console.warn(`[Telemetry] No usage data available for ${endpoint}`);
    return null;
  }

  const promptTokens =
    typeof usage.input_tokens === "number"
      ? usage.input_tokens
      : (usage.prompt_tokens ?? 0);
  const completionTokens =
    typeof usage.output_tokens === "number"
      ? usage.output_tokens
      : (usage.completion_tokens ?? 0);
  const totalTokens =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : promptTokens + completionTokens;
  const cachedTokens =
    usage.input_tokens_details?.cached_tokens ??
    usage.prompt_tokens_details?.cached_tokens;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    model,
    endpoint,
    promptVersion,
  };
}
