export class AIEmptyResponseError extends Error {
  constructor(public context: Record<string, unknown> = {}) {
    super("Empty response from AI");
    this.name = "AIEmptyResponseError";
  }
}

export type RetryPolicy = {
  attempts: number; // e.g. 3
  baseDelayMs: number; // e.g. 250
  maxDelayMs?: number; // e.g. 2000
  jitter?: boolean; // default true
};

export async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs = 2000, jitter = true } = policy;
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      const backoff = Math.min(baseDelayMs * 2 ** (i - 1), maxDelayMs);
      const delay = jitter
        ? Math.floor(backoff * (0.5 + Math.random()))
        : backoff;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

export function assertNonEmpty(
  text: string,
  context: Record<string, unknown>,
): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length === 0) throw new AIEmptyResponseError(context);
  return trimmed;
}
