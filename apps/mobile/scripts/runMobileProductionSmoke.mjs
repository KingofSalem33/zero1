#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(APP_DIR, "reports");

const REQUIRED_ARGS = ["build", "launch", "auth", "library", "map"];
const STATUS_PASS = "pass";
const STATUS_FAIL = "fail";

const STEP_DEFS = [
  {
    key: "launch",
    name: "App launch",
    requirement: "App opens from TestFlight without crash/white screen.",
  },
  {
    key: "auth",
    name: "Auth flow",
    requirement: "User signs in and lands in authenticated experience.",
  },
  {
    key: "library",
    name: "Library load",
    requirement: "Library/saved content loads without 401/session errors.",
  },
  {
    key: "map",
    name: "Map save",
    requirement: "Create/save map succeeds and persists after reload.",
  },
];

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const body = raw.slice(2);
    const eqIdx = body.indexOf("=");
    if (eqIdx === -1) {
      args[body] = "true";
      continue;
    }
    const key = body.slice(0, eqIdx).trim();
    const value = body.slice(eqIdx + 1).trim();
    args[key] = value;
  }
  return args;
}

function printUsage() {
  console.log("Usage:");
  console.log(
    '  npm --prefix apps/mobile run phase2:smoke:mobile:prod -- --build=<number> --launch=pass|fail --auth=pass|fail --library=pass|fail --map=pass|fail [--version=<app-version>] [--tester=<name>] [--notes="<text>"]',
  );
  console.log("");
  console.log("Example:");
  console.log(
    '  npm --prefix apps/mobile run phase2:smoke:mobile:prod -- --build=18 --version=1.0.0 --tester="Cory Hanson" --launch=pass --auth=pass --library=pass --map=pass',
  );
}

function normalizeStatus(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === STATUS_PASS || normalized === STATUS_FAIL) {
    return normalized;
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const missing = REQUIRED_ARGS.filter((key) => !args[key]);
  if (missing.length > 0) {
    console.error(
      `[Mobile Prod Smoke] Missing required args: ${missing.join(", ")}`,
    );
    printUsage();
    process.exit(1);
  }

  const steps = STEP_DEFS.map((def) => {
    const status = normalizeStatus(args[def.key]);
    if (!status) {
      console.error(
        `[Mobile Prod Smoke] Invalid status for --${def.key}: ${args[def.key]}. Expected pass|fail.`,
      );
      process.exit(1);
    }
    return {
      key: def.key,
      name: def.name,
      requirement: def.requirement,
      status,
      passed: status === STATUS_PASS,
    };
  });

  const passed = steps.every((step) => step.passed);
  const build = String(args.build).trim();
  const now = new Date().toISOString();
  const reportPath = path.join(REPORTS_DIR, `mobileProdSmoke-build${build}.json`);

  const report = {
    gate: "phase2.5-mobile-production-smoke",
    generatedAt: now,
    build,
    appVersion: args.version || null,
    tester: args.tester || null,
    notes: args.notes || null,
    steps,
    passed,
    rollbackTriggered: !passed,
    rollbackReason: passed
      ? null
      : `Production smoke failed for build ${build}; hold rollout and use previous stable build.`,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("[Mobile Prod Smoke] Results");
  for (const step of steps) {
    const label = step.passed ? "PASS" : "FAIL";
    console.log(`- [${label}] ${step.name}`);
  }
  console.log(`[Mobile Prod Smoke] Report: ${reportPath}`);

  if (!passed) {
    console.error(
      `[Mobile Prod Smoke] Failed for build ${build}. Execute rollback policy before continuing rollout.`,
    );
    process.exit(1);
  }

  console.log(`[Mobile Prod Smoke] Passed for build ${build}.`);
}

main();
