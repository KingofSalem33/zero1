import { withRetries, assertNonEmpty } from "./ResponseGuards";
import { normalizeAIResponse } from "./ResponseNormalizer";

type GenArgs = {
  system: string;
  user: string;
  model: string;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
  requestId?: string;
  meta?: Record<string, unknown>;
  call: (payload: any) => Promise<any>; // inject provider fn
  log?: (m: string, o?: any) => void;
};

export async function safeGenerate({
  system,
  user,
  model,
  temperature = 0.3,
  json = false,
  maxTokens = 2048,
  requestId,
  meta = {},
  call,
  log,
}: GenArgs): Promise<string> {
  const payload = {
    model,
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    max_output_tokens: maxTokens,
    text: json
      ? {
          format: {
            type: "json_schema" as const,
            // Caller should pass schema in meta if needed
            ...(meta.schema ? { schema: meta.schema } : {}),
          },
          verbosity: "medium",
        }
      : {
          verbosity: "medium",
        },
  };

  const policy = {
    attempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 1500,
    jitter: true,
  };

  return await withRetries(async (attempt) => {
    const t0 = Date.now();
    let raw: any;
    try {
      raw = await call(payload);
    } catch (err) {
      log?.("[AI] provider error", {
        requestId,
        attempt,
        err: (err as Error).message,
      });
      throw err;
    }
    const ms = Date.now() - t0;

    // Extract text from Responses API format
    const assistantMessage = raw?.output?.find?.(
      (item: any) => item.type === "message" && item.role === "assistant",
    );

    const candidate =
      assistantMessage?.content
        ?.filter?.((c: any) => c.type === "text")
        .map?.((c: any) => c.text)
        .join("") ?? "";

    log?.("[AI] raw candidate", {
      requestId,
      attempt,
      rawLength: candidate.length,
    });

    const normalized = normalizeAIResponse(candidate, {
      expectJson: json,
      minChars: 1,
      log: (m, o) => log?.(m, { requestId, attempt, ...o }),
    });

    const nonEmpty = assertNonEmpty(normalized, {
      requestId,
      attempt,
      model,
      json,
      ms,
      providerStatus: raw?.status ?? "unknown",
      usage: raw?.usage ?? null,
      meta,
    });

    log?.("[AI] ok", {
      requestId,
      attempt,
      ms,
      len: nonEmpty.length,
      usage: raw?.usage,
    });
    return nonEmpty;
  }, policy);
}
