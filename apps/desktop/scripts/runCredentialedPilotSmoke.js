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
const REPORT_PATH = path.join(REPORTS_DIR, "credentialedPilotSmoke.json");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    env[key] = value;
  }

  return env;
}

async function requestJson(url, accessToken) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

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
    bodyShape:
      body && typeof body === "object" ? Object.keys(body).sort() : null,
  };
}

async function main() {
  const apiEnv = parseEnvFile(path.join(ROOT_DIR, "apps", "api", ".env"));

  const smokeApiBaseUrl =
    process.env.SMOKE_API_BASE_URL || "https://biblelot-api.onrender.com";
  const supabaseUrl = process.env.SMOKE_SUPABASE_URL || apiEnv.SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SMOKE_SUPABASE_ANON_KEY || apiEnv.SUPABASE_ANON_KEY;
  const supabaseServiceKey =
    process.env.SMOKE_SUPABASE_SERVICE_KEY || apiEnv.SUPABASE_SERVICE_KEY;

  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("SUPABASE_ANON_KEY");
  if (!supabaseServiceKey) missing.push("SUPABASE_SERVICE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Missing required Supabase credentials for credentialed smoke: ${missing.join(", ")}`,
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const userEmail = `smoke-${Date.now()}-${randomUUID().slice(0, 8)}@example.com`;
  const userPassword = `S_${randomUUID()}!`;
  let createdUserId = null;

  const startedAt = new Date().toISOString();
  const checks = [];
  let signInResult = null;
  let cleanupResult = null;
  let passed = false;
  let failureReason = null;

  try {
    const createResult = await adminClient.auth.admin.createUser({
      email: userEmail,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        smoke_user: true,
      },
    });

    if (createResult.error || !createResult.data.user?.id) {
      throw new Error(
        `Failed to create temporary smoke user: ${createResult.error?.message || "unknown error"}`,
      );
    }

    createdUserId = createResult.data.user.id;

    const signIn = await anonClient.auth.signInWithPassword({
      email: userEmail,
      password: userPassword,
    });
    signInResult = {
      ok: !signIn.error && Boolean(signIn.data.session?.access_token),
      error: signIn.error?.message || null,
    };

    if (!signInResult.ok || !signIn.data.session?.access_token) {
      throw new Error(`Failed to sign in temporary smoke user: ${signIn.error?.message}`);
    }

    const accessToken = signIn.data.session.access_token;
    const base = smokeApiBaseUrl.replace(/\/+$/, "");
    checks.push(await requestJson(`${base}/api/bookmarks`, accessToken));
    checks.push(await requestJson(`${base}/api/highlights`, accessToken));
    checks.push(await requestJson(`${base}/api/library/connections`, accessToken));

    passed = checks.every((check) => check.ok);
    if (!passed) {
      failureReason = "One or more protected API checks returned non-200 status.";
    }
  } catch (error) {
    passed = false;
    failureReason = error instanceof Error ? error.message : String(error);
  } finally {
    if (createdUserId) {
      const cleanup = await adminClient.auth.admin.deleteUser(createdUserId);
      cleanupResult = {
        attempted: true,
        ok: !cleanup.error,
        error: cleanup.error?.message || null,
      };
      if (cleanup.error) {
        passed = false;
        failureReason = failureReason || `Failed to cleanup smoke user: ${cleanup.error.message}`;
      }
    } else {
      cleanupResult = {
        attempted: false,
        ok: true,
        error: null,
      };
    }
  }

  const report = {
    gate: "phase1.3-credentialed-pilot-smoke",
    startedAt,
    completedAt: new Date().toISOString(),
    apiBaseUrl: smokeApiBaseUrl,
    supabaseHost: new URL(supabaseUrl).host,
    temporaryUser: {
      email: userEmail,
      created: Boolean(createdUserId),
    },
    signInResult,
    checks,
    cleanupResult,
    passed,
    failureReason,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (!passed) {
    console.error("[Credentialed Pilot Smoke] Failed.");
    console.error("[Credentialed Pilot Smoke] Report:", REPORT_PATH);
    process.exit(1);
  }

  console.log("[Credentialed Pilot Smoke] Passed.");
  console.log("[Credentialed Pilot Smoke] Report:", REPORT_PATH);
}

main().catch((error) => {
  console.error("[Credentialed Pilot Smoke] Fatal error:", error);
  process.exit(1);
});
