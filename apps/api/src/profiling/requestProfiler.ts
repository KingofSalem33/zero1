import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { Request, Response, NextFunction } from "express";

const PROFILING_ENABLED = process.env.PROFILING_ENABLED === "true";
const LOG_DIR =
  process.env.PROFILING_LOG_DIR ||
  path.resolve(__dirname, "..", "..", "profiling");
const LOG_FILE =
  process.env.PROFILING_LOG_FILE || path.join(LOG_DIR, "requests.jsonl");

const storage = new AsyncLocalStorage<RequestProfiler>();

const nowNs = () => process.hrtime.bigint();
const nsToMs = (ns: bigint) => Number(ns) / 1e6;

export type StageRecord = {
  name: string;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  meta?: Record<string, unknown>;
};

export type RequestRecord = {
  id: string;
  method: string;
  path: string;
  pipeline: string;
  status: number;
  start_iso: string;
  duration_ms: number;
  stages: StageRecord[];
  meta?: Record<string, unknown>;
};

class RequestProfiler {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly startIso: string;
  private readonly startNs: bigint;
  private readonly stages: StageRecord[] = [];
  private readonly marks = new Map<string, bigint>();
  private pipelineName?: string;
  private finished = false;

  constructor(req: Request) {
    this.id =
      (typeof req.headers["x-correlation-id"] === "string" &&
        req.headers["x-correlation-id"]) ||
      (typeof req.headers["x-request-id"] === "string" &&
        req.headers["x-request-id"]) ||
      randomUUID();
    this.method = req.method;
    this.path = req.originalUrl || req.url;
    this.startIso = new Date().toISOString();
    this.startNs = nowNs();
  }

  setPipeline(name: string) {
    this.pipelineName = name;
  }

  mark(name: string) {
    this.marks.set(name, nowNs());
  }

  markHandlerStart(meta?: Record<string, unknown>) {
    if (this.marks.has("handler_start")) return;
    const handlerStart = nowNs();
    this.marks.set("handler_start", handlerStart);
    this.recordSpan("pre_handler", this.startNs, handlerStart, {
      includes: [
        "helmet",
        "cors",
        "compression",
        "json_body_parse",
        "rate_limit",
        "optional_auth",
      ],
      ...meta,
    });
  }

  recordSpan(
    name: string,
    startNs: bigint,
    endNs: bigint,
    meta?: Record<string, unknown>,
  ) {
    const startMs = nsToMs(startNs - this.startNs);
    const endMs = nsToMs(endNs - this.startNs);
    this.stages.push({
      name,
      start_ms: startMs,
      end_ms: endMs,
      duration_ms: endMs - startMs,
      meta,
    });
  }

  async time<T>(
    name: string,
    fn: () => T | Promise<T>,
    meta?: Record<string, unknown>,
  ): Promise<T> {
    const start = nowNs();
    try {
      return await fn();
    } finally {
      const end = nowNs();
      this.recordSpan(name, start, end, meta);
    }
  }

  finish(res: Response, meta?: Record<string, unknown>) {
    if (this.finished) return;
    this.finished = true;
    const endNs = nowNs();
    const durationMs = nsToMs(endNs - this.startNs);
    const record: RequestRecord = {
      id: this.id,
      method: this.method,
      path: this.path,
      pipeline: this.pipelineName || `${this.method} ${this.path}`,
      status: res.statusCode,
      start_iso: this.startIso,
      duration_ms: durationMs,
      stages: this.stages,
      meta,
    };
    void writeProfile(record);
  }
}

let logReady = false;
let logInitPromise: Promise<void> | null = null;

async function ensureLogDir() {
  if (logReady) return;
  if (!logInitPromise) {
    logInitPromise = fs.promises
      .mkdir(LOG_DIR, { recursive: true })
      .then(() => {
        logReady = true;
      })
      .catch((error) => {
        logReady = false;
        console.error("[Profiler] Failed to create log dir:", error);
      });
  }
  await logInitPromise;
}

async function writeProfile(record: RequestRecord) {
  if (!PROFILING_ENABLED) return;
  await ensureLogDir();
  if (!logReady) return;
  const line = JSON.stringify(record);
  fs.promises
    .appendFile(LOG_FILE, line + "\n", "utf8")
    .catch((error) => console.error("[Profiler] Failed to write log:", error));
}

export function profilerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!PROFILING_ENABLED) {
    next();
    return;
  }

  const profiler = new RequestProfiler(req);
  req.correlationId = profiler.id;
  res.setHeader("x-correlation-id", profiler.id);

  res.on("finish", () => profiler.finish(res));
  res.on("close", () => profiler.finish(res, { closed: true }));

  storage.run(profiler, () => {
    next();
  });
}

export function getProfiler(): RequestProfiler | null {
  return storage.getStore() || null;
}

export async function profileTime<T>(
  name: string,
  fn: () => T | Promise<T>,
  meta?: Record<string, unknown>,
): Promise<T> {
  const profiler = getProfiler();
  if (!profiler) {
    return await fn();
  }
  return profiler.time(name, fn, meta);
}

export function profileSpan(
  name: string,
  startNs: bigint,
  endNs: bigint,
  meta?: Record<string, unknown>,
) {
  const profiler = getProfiler();
  if (!profiler) return;
  profiler.recordSpan(name, startNs, endNs, meta);
}
