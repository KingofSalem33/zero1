#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_DIR = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(APP_DIR, "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "phase21CoreFeatureValidation.json");

function runCheck(name, command, args) {
  const startedAt = Date.now();
  try {
    execFileSync(command, args, {
      cwd: APP_DIR,
      stdio: "pipe",
      encoding: "utf8",
    });
    return {
      name,
      command: [command, ...args].join(" "),
      passed: true,
      durationMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    const stderr =
      typeof error?.stderr === "string"
        ? error.stderr.trim()
        : String(error?.stderr ?? "").trim();
    const stdout =
      typeof error?.stdout === "string"
        ? error.stdout.trim()
        : String(error?.stdout ?? "").trim();
    const fallbackMessage =
      error instanceof Error ? error.message : "Unknown validation failure";
    const combined = [stdout, stderr, fallbackMessage].filter(Boolean).join("\n");
    const clipped =
      combined.length > 2400 ? `${combined.slice(0, 2400)}\n...<truncated>` : combined;

    return {
      name,
      command: [command, ...args].join(" "),
      passed: false,
      durationMs: Date.now() - startedAt,
      error: clipped,
    };
  }
}

function buildReport() {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error("Missing npm_execpath; run this script via npm.");
  }

  const checks = [
    runCheck("Mobile TypeScript typecheck", process.execPath, [
      npmExecPath,
      "run",
      "typecheck",
    ]),
    runCheck("Mobile focused test suite", process.execPath, [
      npmExecPath,
      "run",
      "test",
    ]),
  ];

  const featureEvidence = [
    {
      feature: "Auth/App flow split and detail route wiring",
      status: "validated_by_tests",
      evidence: [
        "src/navigation/__tests__/MobileRootNavigator.routes.test.ts",
      ],
    },
    {
      feature: "Bookmarks create + delete actions",
      status: "validated_by_tests",
      evidence: [
        "src/hooks/__tests__/useMobileAppController.test.tsx",
      ],
    },
    {
      feature: "Highlights create + update + delete actions",
      status: "validated_by_tests",
      evidence: [
        "src/hooks/__tests__/useMobileAppController.test.tsx",
      ],
    },
    {
      feature: "Native OAuth callback/session exchange (Google + Apple)",
      status: "validated_prior_manual_run",
      evidence: ["DEPLOYMENT_LAUNCH_PLAN.md (Agent AE execution notes)"],
    },
  ];

  return {
    gate: "phase2.1-core-feature-validation",
    generatedAt: new Date().toISOString(),
    checks,
    featureEvidence,
    passed: checks.every((check) => check.passed),
  };
}

function main() {
  const report = buildReport();
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error("[Phase2.1 Core Validation] Failed.");
    console.error("[Phase2.1 Core Validation] Report:", REPORT_PATH);
    process.exit(1);
  }

  console.log("[Phase2.1 Core Validation] Passed.");
  console.log("[Phase2.1 Core Validation] Report:", REPORT_PATH);
}

main();
