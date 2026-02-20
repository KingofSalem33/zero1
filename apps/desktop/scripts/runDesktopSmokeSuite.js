#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const DESKTOP_DIR = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(DESKTOP_DIR, "reports");
const SMOKE_REPORT_PATH = path.join(REPORTS_DIR, "smokeSuite.json");

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });

  return {
    command: [command, ...args].join(" "),
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function runAuthenticatedApiSmoke() {
  const baseUrl = process.env.SMOKE_API_BASE_URL || process.env.VITE_API_URL;
  const supabaseUrl =
    process.env.SMOKE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SMOKE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const email = process.env.SMOKE_EMAIL;
  const password = process.env.SMOKE_PASSWORD;

  const required = { baseUrl, supabaseUrl, supabaseAnonKey, email, password };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    return {
      attempted: false,
      skipped: true,
      reason: `Missing env: ${missing.join(", ")}`,
      checks: [],
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session?.access_token) {
    return {
      attempted: true,
      skipped: false,
      passed: false,
      reason: signIn.error?.message || "No access token returned",
      checks: [],
    };
  }

  const token = signIn.data.session.access_token;
  const checks = [];
  const routes = [
    "/api/bookmarks",
    "/api/highlights",
    "/api/library/connections",
  ];

  for (const route of routes) {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${route}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    checks.push({
      route,
      status: response.status,
      ok: response.status === 200,
    });
  }

  return {
    attempted: true,
    skipped: false,
    passed: checks.every((check) => check.ok),
    checks,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const commandChecks = [];

  const authSessionTests = runCommand("npm", [
    "--prefix",
    "apps/desktop",
    "run",
    "test:auth-session",
  ]);
  commandChecks.push({
    name: "desktop auth/session tests",
    ...authSessionTests,
    passed: authSessionTests.status === 0,
  });

  const buildCheck = runCommand("npm", [
    "--prefix",
    "apps/desktop",
    "run",
    "build",
  ]);
  commandChecks.push({
    name: "desktop production build",
    ...buildCheck,
    passed: buildCheck.status === 0,
  });

  const authApiSmoke = await runAuthenticatedApiSmoke();
  const report = {
    gate: "phase1.3-desktop-smoke",
    startedAt,
    completedAt: new Date().toISOString(),
    commands: commandChecks.map((check) => ({
      name: check.name,
      command: check.command,
      status: check.status,
      passed: check.passed,
      stdoutHash: sha256(check.stdout),
      stderrHash: sha256(check.stderr),
    })),
    authenticatedApiSmoke: authApiSmoke,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(SMOKE_REPORT_PATH, JSON.stringify(report, null, 2));

  const mandatoryFailed = commandChecks.some((check) => !check.passed);
  const authSmokeFailed =
    authApiSmoke.attempted && authApiSmoke.passed === false;

  if (mandatoryFailed || authSmokeFailed) {
    console.error("[Desktop Smoke] Failed checks. See:", SMOKE_REPORT_PATH);
    process.exit(1);
  }

  if (authApiSmoke.skipped) {
    console.warn(
      `[Desktop Smoke] Authenticated API smoke skipped (${authApiSmoke.reason}).`,
    );
  } else {
    console.log("[Desktop Smoke] Authenticated API smoke passed.");
  }

  console.log("[Desktop Smoke] All required checks passed.");
  console.log("[Desktop Smoke] Report:", SMOKE_REPORT_PATH);
}

main().catch((error) => {
  console.error("[Desktop Smoke] Fatal error:", error);
  process.exit(1);
});
