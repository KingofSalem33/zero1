#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "pilotCohortTelemetry.json");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(rank, 0)];
}

async function requestJson(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, options);
  const ended = performance.now();
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    url,
    status: response.status,
    ok: response.status === 200,
    latencyMs: Math.round(ended - started),
    body,
  };
}

async function main() {
  const apiEnv = parseEnvFile(path.join(ROOT_DIR, "apps", "api", ".env"));

  const apiBaseUrl =
    process.env.SMOKE_API_BASE_URL || "https://biblelot-api.onrender.com";
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL || apiEnv.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SMOKE_SUPABASE_ANON_KEY || apiEnv.SUPABASE_ANON_KEY;
  const supabaseServiceKey =
    process.env.SMOKE_SUPABASE_SERVICE_KEY || apiEnv.SUPABASE_SERVICE_KEY;
  const cohortSize = Number(process.env.PILOT_COHORT_SIZE || 5);
  const interSessionDelayMs = Number(process.env.PILOT_INTER_SESSION_DELAY_MS || 1200);

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase credentials for pilot cohort: ${missing.join(", ")}`,
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const startedAt = new Date().toISOString();
  const routeMetrics = new Map();
  const sessions = [];
  let totalFailures = 0;

  for (let i = 0; i < cohortSize; i += 1) {
    const userEmail = `pilot-${Date.now()}-${i}-${randomUUID().slice(0, 6)}@example.com`;
    const userPassword = `S_${randomUUID()}!`;
    let userId = null;
    const sessionReport = {
      sessionIndex: i + 1,
      userEmail,
      created: false,
      signedIn: false,
      checks: [],
      passed: false,
    };

    try {
      const created = await adminClient.auth.admin.createUser({
        email: userEmail,
        password: userPassword,
        email_confirm: true,
        user_metadata: {
          pilot_cohort: true,
        },
      });

      if (created.error || !created.data.user?.id) {
        throw new Error(created.error?.message || "createUser failed");
      }

      userId = created.data.user.id;
      sessionReport.created = true;

      const signIn = await anonClient.auth.signInWithPassword({
        email: userEmail,
        password: userPassword,
      });

      if (signIn.error || !signIn.data.session?.access_token) {
        throw new Error(signIn.error?.message || "signIn failed");
      }

      sessionReport.signedIn = true;
      const accessToken = signIn.data.session.access_token;
      const base = apiBaseUrl.replace(/\/+$/, "");
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      };

      const checks = [
        await requestJson(`${base}/api/bookmarks`, { headers }),
        await requestJson(`${base}/api/highlights`, { headers }),
        await requestJson(`${base}/api/library/connections`, { headers }),
        await requestJson(`${base}/api/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            message: "Give one sentence on John 3:16.",
            format: "text",
            history: [],
          }),
        }),
        await requestJson(`${base}/api/trace`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            text: "John 3:16",
          }),
        }),
      ];

      sessionReport.checks = checks.map((check) => ({
        url: check.url,
        status: check.status,
        ok: check.ok,
        latencyMs: check.latencyMs,
      }));

      for (const check of checks) {
        const url = new URL(check.url);
        const route = url.pathname;
        if (!routeMetrics.has(route)) {
          routeMetrics.set(route, []);
        }
        routeMetrics.get(route).push({
          status: check.status,
          ok: check.ok,
          latencyMs: check.latencyMs,
        });
      }

      sessionReport.passed = checks.every((check) => check.ok);
      if (!sessionReport.passed) {
        totalFailures += 1;
      }
    } catch (error) {
      totalFailures += 1;
      sessionReport.error = error instanceof Error ? error.message : String(error);
      sessionReport.passed = false;
    } finally {
      if (userId) {
        await adminClient.auth.admin.deleteUser(userId);
      }
      sessions.push(sessionReport);
    }

    if (i < cohortSize - 1) {
      await new Promise((resolve) => setTimeout(resolve, interSessionDelayMs));
    }
  }

  const summary = {};
  for (const [route, metrics] of routeMetrics.entries()) {
    const latencies = metrics.map((metric) => metric.latencyMs);
    const successCount = metrics.filter((metric) => metric.ok).length;
    summary[route] = {
      requests: metrics.length,
      successCount,
      failureCount: metrics.length - successCount,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
    };
  }

  const report = {
    gate: "phase1-pilot-cohort-telemetry",
    startedAt,
    completedAt: new Date().toISOString(),
    apiBaseUrl,
    cohortSize,
    interSessionDelayMs,
    sessions,
    summary,
    passed: totalFailures === 0,
    totalFailures,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error("[Pilot Cohort] Failed.");
    console.error("[Pilot Cohort] Report:", REPORT_PATH);
    process.exit(1);
  }

  console.log("[Pilot Cohort] Passed.");
  console.log("[Pilot Cohort] Report:", REPORT_PATH);
}

main().catch((error) => {
  console.error("[Pilot Cohort] Fatal error:", error);
  process.exit(1);
});
