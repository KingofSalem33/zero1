#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const EXIT_REPORT_PATH = path.join(REPORTS_DIR, "phase1ExitCheck.json");

function readJson(fileName) {
  const filePath = path.join(REPORTS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return { exists: false, filePath, data: null };
  }

  try {
    return {
      exists: true,
      filePath,
      data: JSON.parse(fs.readFileSync(filePath, "utf8")),
    };
  } catch {
    return { exists: true, filePath, data: null };
  }
}

function checkReport(name, fileName) {
  const report = readJson(fileName);
  const passed = Boolean(report.data && report.data.passed === true);
  return {
    name,
    fileName,
    exists: report.exists,
    passed,
    path: report.filePath,
  };
}

function main() {
  const checks = [
    checkReport("Pilot release gate", "pilotReleaseGate.json"),
    checkReport("Credentialed pilot smoke", "credentialedPilotSmoke.json"),
    checkReport("Pilot signoff", "pilotSignoff.json"),
    checkReport("Phase 1.3 manual validation", "phase13ManualValidation.json"),
    checkReport("Pilot cohort telemetry", "pilotCohortTelemetry.json"),
    checkReport("Pilot feedback triage", "pilotFeedbackTriage.json"),
  ];

  const report = {
    gate: "phase1-exit-check",
    generatedAt: new Date().toISOString(),
    checks,
    passed: checks.every((check) => check.passed),
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(EXIT_REPORT_PATH, JSON.stringify(report, null, 2));

  if (!report.passed) {
    console.error("[Phase1 Exit Check] Failed.");
    console.error("[Phase1 Exit Check] Report:", EXIT_REPORT_PATH);
    process.exit(1);
  }

  console.log("[Phase1 Exit Check] Passed.");
  console.log("[Phase1 Exit Check] Report:", EXIT_REPORT_PATH);
}

main();
