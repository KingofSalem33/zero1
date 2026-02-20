#!/usr/bin/env node

const { request } = require("undici");

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const READINESS_ORIGIN = process.env.READINESS_ORIGIN || "http://localhost:5173";
const TIMEOUT_MS = Number(process.env.READINESS_TIMEOUT_MS || 15000);

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function httpRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const { statusCode, headers, body } = await request(url, {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body || undefined,
    bodyTimeout: TIMEOUT_MS,
    headersTimeout: TIMEOUT_MS,
  });
  const text = await body.text();
  return { url, statusCode, headers, text };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertStatusOneOf(actual, accepted, context) {
  assert(
    accepted.includes(actual),
    `${context}: expected status ${accepted.join(" or ")}, got ${actual}`,
  );
}

async function checkHealth() {
  const response = await httpRequest("/health");
  assertStatusOneOf(response.statusCode, [200], "GET /health");
  const json = parseJsonOrNull(response.text);
  assert(json && json.ok === true, "GET /health: expected { ok: true }");
}

async function checkDbHealth() {
  const response = await httpRequest("/api/health/db?force=true");
  assertStatusOneOf(response.statusCode, [200], "GET /api/health/db");
  const json = parseJsonOrNull(response.text);
  assert(
    json && json.healthy === true,
    "GET /api/health/db: expected { healthy: true }",
  );
}

async function checkCorsPreflight() {
  const response = await httpRequest("/health", {
    method: "OPTIONS",
    headers: {
      Origin: READINESS_ORIGIN,
      "Access-Control-Request-Method": "GET",
    },
  });
  assertStatusOneOf(response.statusCode, [200, 204], "OPTIONS /health");
  const allowOrigin =
    response.headers["access-control-allow-origin"] ||
    response.headers["Access-Control-Allow-Origin"];
  assert(
    allowOrigin === READINESS_ORIGIN || allowOrigin === "*",
    `OPTIONS /health: expected access-control-allow-origin to include ${READINESS_ORIGIN}, got ${allowOrigin || "missing"}`,
  );
}

async function checkProtectedRouteAuthz() {
  const unauthorized = [
    { method: "GET", path: "/api/bookmarks" },
    {
      method: "POST",
      path: "/api/bookmarks",
      body: { text: "phase0-authz-probe", userId: "spoofed-user-id" },
    },
    { method: "GET", path: "/api/library/connections" },
    {
      method: "POST",
      path: "/api/library/connections",
      body: {
        userId: "spoofed-user-id",
        connection: {
          fromVerse: { id: 1, reference: "Genesis 1:1", text: "In the beginning..." },
          toVerse: { id: 2, reference: "Genesis 1:2", text: "And the earth was without form..." },
          connectionType: "ECHO",
          similarity: 0.5,
          synopsis: "probe",
          goDeeperPrompt: "probe",
          mapSession: null,
        },
      },
    },
    { method: "GET", path: "/api/library/maps" },
    { method: "GET", path: "/api/highlights" },
    {
      method: "POST",
      path: "/api/highlights/sync",
      body: { highlights: [], last_synced_at: null },
    },
  ];

  for (const probe of unauthorized) {
    const response = await httpRequest(probe.path, {
      method: probe.method,
      headers: probe.body ? { "Content-Type": "application/json" } : {},
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    });
    assertStatusOneOf(
      response.statusCode,
      [401, 403],
      `${probe.method} ${probe.path} (without auth)`,
    );
  }
}

async function checkInvalidTokenRejected() {
  const probes = [
    { method: "GET", path: "/api/bookmarks" },
    { method: "GET", path: "/api/library/connections" },
    { method: "GET", path: "/api/highlights" },
  ];

  for (const probe of probes) {
    const response = await httpRequest(probe.path, {
      method: probe.method,
      headers: { Authorization: "Bearer invalid.token.value" },
    });
    assertStatusOneOf(
      response.statusCode,
      [401, 403],
      `${probe.method} ${probe.path} (invalid token)`,
    );
  }
}

async function main() {
  const checks = [
    { name: "Health endpoint", fn: checkHealth },
    { name: "DB health endpoint", fn: checkDbHealth },
    { name: "CORS preflight", fn: checkCorsPreflight },
    { name: "Protected route authz (no auth)", fn: checkProtectedRouteAuthz },
    { name: "Protected route authz (invalid token)", fn: checkInvalidTokenRejected },
  ];

  console.log(`[Phase0 Exit] API base URL: ${API_BASE_URL}`);
  console.log(`[Phase0 Exit] Readiness origin: ${READINESS_ORIGIN}`);

  let failures = 0;
  for (const check of checks) {
    try {
      await check.fn();
      console.log(`[PASS] ${check.name}`);
    } catch (error) {
      failures += 1;
      console.error(`[FAIL] ${check.name}: ${(error && error.message) || error}`);
    }
  }

  if (failures > 0) {
    console.error(`[Phase0 Exit] Failed checks: ${failures}`);
    process.exit(1);
  }

  console.log("[Phase0 Exit] All checks passed.");
}

main().catch((error) => {
  console.error("[Phase0 Exit] Fatal error:", error);
  process.exit(1);
});
