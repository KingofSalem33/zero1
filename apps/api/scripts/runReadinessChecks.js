#!/usr/bin/env node

const { request } = require("undici");

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:3001").replace(
  /\/+$/,
  "",
);
const READINESS_ORIGIN = process.env.READINESS_ORIGIN || "http://localhost:5173";
const TIMEOUT_MS = Number(process.env.READINESS_TIMEOUT_MS || 15000);

async function httpRequest(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const { statusCode, headers, body } = await request(url, {
    method: options.method || "GET",
    headers: options.headers || {},
    bodyTimeout: TIMEOUT_MS,
    headersTimeout: TIMEOUT_MS,
  });
  const text = await body.text();
  return { url, statusCode, headers, text };
}

function parseJsonOrNull(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function checkApiHealth() {
  const response = await httpRequest("/health");
  const json = parseJsonOrNull(response.text);
  if (response.statusCode !== 200 || !json || json.ok !== true) {
    throw new Error(
      `Health failed (${response.statusCode}). Response: ${response.text.slice(0, 300)}`,
    );
  }
  return response;
}

async function checkDbHealth() {
  const response = await httpRequest("/api/health/db?force=true");
  const json = parseJsonOrNull(response.text);
  if (response.statusCode !== 200 || !json || json.healthy !== true) {
    throw new Error(
      `DB health failed (${response.statusCode}). Response: ${response.text.slice(0, 300)}`,
    );
  }
  return response;
}

async function checkCorsPreflight() {
  const response = await httpRequest("/health", {
    method: "OPTIONS",
    headers: {
      Origin: READINESS_ORIGIN,
      "Access-Control-Request-Method": "GET",
    },
  });

  const allowOrigin =
    response.headers["access-control-allow-origin"] ||
    response.headers["Access-Control-Allow-Origin"];
  const isAllowed =
    allowOrigin === READINESS_ORIGIN || allowOrigin === "*";

  if (!isAllowed) {
    throw new Error(
      `CORS preflight failed. Origin=${READINESS_ORIGIN}, allow-origin=${allowOrigin || "missing"}, status=${response.statusCode}`,
    );
  }

  return response;
}

async function run() {
  const checks = [
    { name: "API health", fn: checkApiHealth },
    { name: "DB health", fn: checkDbHealth },
    { name: "CORS preflight", fn: checkCorsPreflight },
  ];

  console.log(`[Readiness] Base URL: ${API_BASE_URL}`);
  console.log(`[Readiness] Origin: ${READINESS_ORIGIN}`);

  let failures = 0;
  for (const check of checks) {
    try {
      const result = await check.fn();
      console.log(`[PASS] ${check.name} (${result.statusCode})`);
    } catch (error) {
      failures += 1;
      console.error(`[FAIL] ${check.name}: ${(error && error.message) || error}`);
    }
  }

  if (failures > 0) {
    console.error(`[Readiness] Failed checks: ${failures}`);
    process.exit(1);
  }

  console.log("[Readiness] All checks passed.");
}

run().catch((error) => {
  console.error("[Readiness] Fatal error:", error);
  process.exit(1);
});
