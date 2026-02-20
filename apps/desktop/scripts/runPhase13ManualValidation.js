#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "phase13ManualValidation.json");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 0) continue;
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verifyCrashDiagnosticsSource(sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    return {
      passed: false,
      reason: `Missing source file: ${sourcePath}`,
      checks: [],
    };
  }

  const source = fs.readFileSync(sourcePath, "utf8");
  const checks = [
    'process.on("uncaughtException"',
    'process.on("unhandledRejection"',
    'app.on("render-process-gone"',
    'app.on("child-process-gone"',
    'ipcMain.handle("diagnostics:get-status"',
  ].map((pattern) => ({
    pattern,
    found: source.includes(pattern),
  }));

  const passed = checks.every((check) => check.found);
  return {
    passed,
    reason: passed ? null : "Missing one or more crash diagnostics handlers.",
    checks,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const apiEnv = parseEnvFile(path.join(ROOT_DIR, "apps", "api", ".env"));

  const smokeApiBaseUrl =
    process.env.SMOKE_API_BASE_URL || "https://biblelot-api.onrender.com";
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL || apiEnv.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SMOKE_SUPABASE_ANON_KEY || apiEnv.SUPABASE_ANON_KEY;
  const supabaseServiceKey =
    process.env.SMOKE_SUPABASE_SERVICE_KEY || apiEnv.SUPABASE_SERVICE_KEY;
  const longSessionIterations = Number(process.env.LONG_SESSION_ITERATIONS || 60);
  const longSessionDelayMs = Number(process.env.LONG_SESSION_DELAY_MS || 700);

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase credentials for phase 1.3 validation: ${missing.join(", ")}`,
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userEmail = `phase13-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const userPassword = `S_${randomUUID()}!`;
  let createdUserId = null;
  let accessToken = null;

  const onboarding = {
    passed: false,
    createUser: null,
    signIn: null,
  };
  const chatSmoke = {
    passed: false,
    status: null,
    error: null,
  };
  const mapSmoke = {
    passed: false,
    status: null,
    error: null,
  };
  const longSession = {
    passed: false,
    iterations: longSessionIterations,
    delayMs: longSessionDelayMs,
    failures: [],
    successCount: 0,
  };
  const crashDiagnostics = verifyCrashDiagnosticsSource(
    path.join(ROOT_DIR, "apps", "desktop", "electron", "main.ts"),
  );

  try {
    const create = await adminClient.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        smoke_user: true,
        phase13_validation: true,
      },
    });

    onboarding.createUser = {
      ok: !create.error,
      error: create.error?.message || null,
    };

    if (create.error || !create.data.user?.id) {
      throw new Error(
        `Failed to create temp user for phase 1.3 validation: ${create.error?.message}`,
      );
    }
    createdUserId = create.data.user.id;

    const signIn = await anonClient.auth.signInWithPassword({
      email: userEmail,
      password: userPassword,
    });

    onboarding.signIn = {
      ok: !signIn.error && Boolean(signIn.data.session?.access_token),
      error: signIn.error?.message || null,
    };

    if (signIn.error || !signIn.data.session?.access_token) {
      throw new Error(`Failed to sign in temp user: ${signIn.error?.message}`);
    }

    accessToken = signIn.data.session.access_token;
    onboarding.passed = true;

    const apiBase = smokeApiBaseUrl.replace(/\/+$/, "");

    const chatResponse = await requestJson(`${apiBase}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: "Provide one short sentence about John 3:16.",
        format: "text",
        history: [],
      }),
    });

    chatSmoke.status = chatResponse.status;
    chatSmoke.passed =
      chatResponse.status === 200 &&
      chatResponse.body &&
      typeof chatResponse.body.text === "string";
    if (!chatSmoke.passed) {
      chatSmoke.error =
        (chatResponse.body && chatResponse.body.error) ||
        `Unexpected chat response status ${chatResponse.status}`;
    }

    const mapResponse = await requestJson(`${apiBase}/api/trace`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        text: "John 3:16",
      }),
    });

    mapSmoke.status = mapResponse.status;
    mapSmoke.passed =
      mapResponse.status === 200 &&
      mapResponse.body &&
      Array.isArray(mapResponse.body.nodes) &&
      Array.isArray(mapResponse.body.edges);
    if (!mapSmoke.passed) {
      mapSmoke.error =
        (mapResponse.body && mapResponse.body.error) ||
        `Unexpected trace response status ${mapResponse.status}`;
    }

    for (let i = 0; i < longSessionIterations; i += 1) {
      const routes = [
        "/api/bookmarks",
        "/api/highlights",
        "/api/library/connections",
      ];
      const route = routes[i % routes.length];
      const response = await requestJson(`${apiBase}${route}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const failedChecks =
        response.status !== 200 ? [{ route, status: response.status }] : [];

      if (failedChecks.length > 0) {
        longSession.failures.push({
          iteration: i + 1,
          failedChecks,
        });
      } else {
        longSession.successCount += 1;
      }

      await sleep(longSessionDelayMs);
    }

    longSession.passed = longSession.failures.length === 0;
  } finally {
    if (createdUserId) {
      await adminClient.auth.admin.deleteUser(createdUserId);
    }
  }

  const report = {
    gate: "phase1.3-manual-validation",
    startedAt,
    completedAt: new Date().toISOString(),
    apiBaseUrl: smokeApiBaseUrl,
    temporaryUserEmail: userEmail,
    onboarding,
    chatSmoke,
    mapSmoke,
    longSession,
    crashDiagnostics,
    passed:
      onboarding.passed &&
      chatSmoke.passed &&
      mapSmoke.passed &&
      longSession.passed &&
      crashDiagnostics.passed,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error("[Phase1.3 Manual Validation] Failed.");
    console.error("[Phase1.3 Manual Validation] Report:", REPORT_PATH);
    process.exit(1);
  }

  console.log("[Phase1.3 Manual Validation] Passed.");
  console.log("[Phase1.3 Manual Validation] Report:", REPORT_PATH);
}

main().catch((error) => {
  console.error("[Phase1.3 Manual Validation] Fatal error:", error);
  process.exit(1);
});
