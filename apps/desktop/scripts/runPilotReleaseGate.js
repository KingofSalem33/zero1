#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const DESKTOP_DIR = path.resolve(__dirname, "..");
const RELEASE_DIR = path.join(DESKTOP_DIR, "release");
const REPORTS_DIR = path.join(DESKTOP_DIR, "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "pilotReleaseGate.json");
const SMOKE_REPORT_PATH = path.join(REPORTS_DIR, "smokeSuite.json");
const ROLLBACK_REPORT_PATH = path.join(REPORTS_DIR, "rollbackRehearsal.json");
const CHECKLIST_PATH = path.join(DESKTOP_DIR, "PILOT_RELEASE_CHECKLIST.md");

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
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

function verifyReleaseArtifacts() {
  if (!fs.existsSync(RELEASE_DIR)) {
    return { ok: false, reason: "release directory missing", artifacts: [] };
  }

  const files = fs.readdirSync(RELEASE_DIR);
  const installers = files.filter((name) => name.endsWith(".exe"));
  const hasLatest = files.includes("latest.yml");
  const hasBlockmap = files.some((name) => name.endsWith(".blockmap"));

  const artifactMeta = installers.map((name) => {
    const fullPath = path.join(RELEASE_DIR, name);
    const stat = fs.statSync(fullPath);
    return {
      name,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    };
  });

  return {
    ok: installers.length > 0 && hasLatest && hasBlockmap,
    reason:
      installers.length === 0
        ? "no installer artifact"
        : !hasLatest
          ? "missing latest.yml"
          : !hasBlockmap
            ? "missing blockmap"
            : "ok",
    artifacts: artifactMeta,
    hasLatest,
    hasBlockmap,
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const skipDist = args.has("--skip-dist");
  const startedAt = new Date().toISOString();
  const steps = [];

  const smoke = runCommand("node", [
    "apps/desktop/scripts/runDesktopSmokeSuite.js",
  ]);
  steps.push({
    name: "desktop smoke suite",
    command: smoke.command,
    status: smoke.status,
    stdoutHash: sha256(smoke.stdout),
    stderrHash: sha256(smoke.stderr),
    passed: smoke.status === 0,
  });

  if (!skipDist) {
    const dist = runCommand("npm", [
      "--prefix",
      "apps/desktop",
      "run",
      "dist:win",
    ]);
    steps.push({
      name: "desktop windows distribution build",
      command: dist.command,
      status: dist.status,
      stdoutHash: sha256(dist.stdout),
      stderrHash: sha256(dist.stderr),
      passed: dist.status === 0,
    });
  }

  const rollback = runCommand("node", [
    "apps/desktop/scripts/runRollbackRehearsal.js",
  ]);
  steps.push({
    name: "rollback rehearsal",
    command: rollback.command,
    status: rollback.status,
    stdoutHash: sha256(rollback.stdout),
    stderrHash: sha256(rollback.stderr),
    passed: rollback.status === 0,
  });

  const artifacts = verifyReleaseArtifacts();
  const checklistExists = fs.existsSync(CHECKLIST_PATH);
  const smokeReportExists = fs.existsSync(SMOKE_REPORT_PATH);
  const rollbackReportExists = fs.existsSync(ROLLBACK_REPORT_PATH);

  const report = {
    gate: "phase1.3-desktop-pilot-release-gate",
    startedAt,
    completedAt: new Date().toISOString(),
    mode: skipDist ? "skip-dist" : "full",
    steps,
    artifacts,
    checklistExists,
    smokeReportExists,
    rollbackReportExists,
    passed:
      steps.every((step) => step.passed) &&
      artifacts.ok &&
      checklistExists &&
      smokeReportExists &&
      rollbackReportExists,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error("[Pilot Release Gate] Failed checks. See:", REPORT_PATH);
    process.exit(1);
  }

  console.log("[Pilot Release Gate] Passed.");
  console.log("[Pilot Release Gate] Report:", REPORT_PATH);
}

main();
