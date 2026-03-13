#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.STRICT_ENV = "false";
process.env.SUPABASE_URL =
  process.env.SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "anon-key";
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || "service-role-key";

const distBookmarksPath = path.resolve(__dirname, "..", "dist", "routes", "bookmarks.js");
if (!fs.existsSync(distBookmarksPath)) {
  console.error(
    "[Regression] Build artifacts not found. Run `npm --prefix apps/api run build` first.",
  );
  process.exit(1);
}

const { requireAuth } = require("../dist/middleware/auth");
const { supabaseAuth } = require("../dist/db");
const bookmarksRouter = require("../dist/routes/bookmarks").default;
const libraryRouter = require("../dist/routes/library").default;
const highlightsRouter = require("../dist/routes/highlights").default;

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/bookmarks", requireAuth, bookmarksRouter);
  app.use("/api/library", requireAuth, libraryRouter);
  app.use("/api/highlights", highlightsRouter);
  app.use((_req, res) => {
    res.status(404).json({ error: "Not Found" });
  });
  return app;
}

function assertUnauthorized(statusCode, context) {
  assert.ok(
    statusCode === 401 || statusCode === 403,
    `${context}: expected 401/403, got ${statusCode}`,
  );
}

async function checkNoAuthRequests(app) {
  const probes = [
    { method: "GET", path: "/api/bookmarks" },
    {
      method: "POST",
      path: "/api/bookmarks",
      body: { text: "phase0-regression", userId: "spoofed-user-id" },
    },
    { method: "GET", path: "/api/library/connections" },
    {
      method: "POST",
      path: "/api/library/bundles",
      body: {
        userId: "spoofed-user-id",
        bundle: { nodes: [], edges: [] },
      },
    },
    { method: "GET", path: "/api/library/maps" },
    { method: "GET", path: "/api/highlights" },
    {
      method: "POST",
      path: "/api/highlights/sync",
      body: { highlights: [], last_synced_at: null, userId: "spoofed-user-id" },
    },
    {
      method: "PUT",
      path: "/api/highlights/00000000-0000-0000-0000-000000000000",
      body: { note: "test" },
    },
    {
      method: "DELETE",
      path: "/api/highlights/00000000-0000-0000-0000-000000000000",
    },
  ];

  for (const probe of probes) {
    let req = request(app)[probe.method.toLowerCase()](probe.path);
    if (probe.body) {
      req = req.send(probe.body);
    }
    const response = await req;
    assertUnauthorized(
      response.statusCode,
      `${probe.method} ${probe.path} without auth`,
    );
    console.log(`[PASS] ${probe.method} ${probe.path} without auth`);
  }
}

async function checkInvalidTokenRequests(app) {
  const originalGetUser = supabaseAuth.auth.getUser;
  supabaseAuth.auth.getUser = async () => ({
    data: { user: null },
    error: { message: "Invalid token" },
  });

  const probes = [
    { method: "GET", path: "/api/bookmarks" },
    { method: "GET", path: "/api/library/connections" },
    { method: "GET", path: "/api/library/maps" },
    { method: "GET", path: "/api/highlights" },
  ];

  try {
    for (const probe of probes) {
      const response = await request(app)
        [probe.method.toLowerCase()](probe.path)
        .set("Authorization", "Bearer invalid.token.value");
      assertUnauthorized(
        response.statusCode,
        `${probe.method} ${probe.path} with invalid token`,
      );
      console.log(`[PASS] ${probe.method} ${probe.path} invalid token`);
    }
  } finally {
    supabaseAuth.auth.getUser = originalGetUser;
  }
}

async function main() {
  const app = createApp();
  console.log("[Regression] Running auth + library/highlights regression probes");
  await checkNoAuthRequests(app);
  await checkInvalidTokenRequests(app);
  console.log("[Regression] All probes passed.");
}

main().catch((error) => {
  console.error("[Regression] Failed:", error);
  process.exit(1);
});
