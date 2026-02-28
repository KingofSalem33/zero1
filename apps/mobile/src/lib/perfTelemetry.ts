type PerfStatus = "success" | "error" | "cancelled";

interface ActiveSpan {
  name: string;
  startMs: number;
  startedAtIso: string;
  meta?: Record<string, unknown>;
}

interface CompletedSpan {
  name: string;
  durationMs: number;
  status: PerfStatus;
  startedAtIso: string;
  finishedAtIso: string;
  meta?: Record<string, unknown>;
}

const activeSpans = new Map<string, ActiveSpan>();
const completedSpans: CompletedSpan[] = [];
let perfCounter = 0;

function nowMs(): number {
  if (
    typeof globalThis.performance !== "undefined" &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function nowIso(): string {
  return new Date().toISOString();
}

function logPerf(event: CompletedSpan) {
  // Keep logs machine-parsable for quick export from device logs.
  console.info("[MOBILE PERF]", JSON.stringify(event));
}

export function startPerfSpan(
  name: string,
  meta?: Record<string, unknown>,
): string {
  perfCounter += 1;
  const spanId = `${name}:${perfCounter}`;
  activeSpans.set(spanId, {
    name,
    startMs: nowMs(),
    startedAtIso: nowIso(),
    meta,
  });
  return spanId;
}

export function finishPerfSpan(
  spanId: string | null | undefined,
  status: PerfStatus,
  extraMeta?: Record<string, unknown>,
) {
  if (!spanId) return;
  const active = activeSpans.get(spanId);
  if (!active) return;
  activeSpans.delete(spanId);

  const completed: CompletedSpan = {
    name: active.name,
    durationMs: Math.round((nowMs() - active.startMs) * 100) / 100,
    status,
    startedAtIso: active.startedAtIso,
    finishedAtIso: nowIso(),
    meta:
      active.meta || extraMeta
        ? {
            ...(active.meta ?? {}),
            ...(extraMeta ?? {}),
          }
        : undefined,
  };
  completedSpans.push(completed);
  logPerf(completed);
}

export function getPerfEvents(): CompletedSpan[] {
  return [...completedSpans];
}
