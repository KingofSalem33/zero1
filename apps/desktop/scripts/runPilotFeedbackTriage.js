#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const TRIAGE_REPORT_PATH = path.join(REPORTS_DIR, "pilotFeedbackTriage.json");
const COHORT_REPORT_PATH = path.join(REPORTS_DIR, "pilotCohortTelemetry.json");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function collectFeedbackFiles() {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  return fs
    .readdirSync(REPORTS_DIR)
    .filter(
      (name) =>
        name.startsWith("pilotFeedback-") &&
        name.endsWith(".json") &&
        name !== "pilotFeedbackTemplate.json",
    )
    .map((name) => path.join(REPORTS_DIR, name));
}

function validateFeedbackDocument(document, fileName) {
  const issues = [];
  const pilotUserId = typeof document.pilotUserId === "string" ? document.pilotUserId : null;
  if (!pilotUserId || pilotUserId.trim().length === 0) {
    issues.push("missing pilotUserId");
  }

  const completedFlows = document.completedFlows || {};
  const completedFlowCount = Object.values(completedFlows).filter(Boolean).length;
  if (completedFlowCount < 5) {
    issues.push(`insufficient completed flows (${completedFlowCount})`);
  }

  const rating = document.rating || {};
  const ratingKeys = ["stability", "performance", "uxClarity"];
  for (const key of ratingKeys) {
    const value = rating[key];
    if (typeof value !== "number" || value < 1 || value > 5) {
      issues.push(`invalid rating.${key}`);
    }
  }

  const diagnosticsAttached = document.diagnosticsLogAttached === true;
  const diagnosticsPath =
    typeof document.diagnosticsLogPath === "string"
      ? document.diagnosticsLogPath.trim()
      : "";
  if (!diagnosticsAttached || diagnosticsPath.length === 0) {
    issues.push("missing diagnostics attachment metadata");
  }

  const issuesList = Array.isArray(document.issues) ? document.issues : [];
  const unresolvedHighSeverityIssues = issuesList.filter(
    (issue) =>
      issue &&
      typeof issue === "object" &&
      issue.severity === "high" &&
      issue.resolved !== true,
  );

  return {
    fileName,
    pilotUserId,
    completedFlowCount,
    unresolvedHighSeverityCount: unresolvedHighSeverityIssues.length,
    validationIssues: issues,
    valid: issues.length === 0,
  };
}

function main() {
  const feedbackFiles = collectFeedbackFiles();
  const feedbackEntries = [];

  for (const filePath of feedbackFiles) {
    const document = readJson(filePath);
    if (!document) {
      feedbackEntries.push({
        fileName: path.basename(filePath),
        pilotUserId: null,
        completedFlowCount: 0,
        unresolvedHighSeverityCount: 0,
        validationIssues: ["invalid JSON"],
        valid: false,
      });
      continue;
    }
    feedbackEntries.push(
      validateFeedbackDocument(document, path.basename(filePath)),
    );
  }

  const cohortReport = readJson(COHORT_REPORT_PATH);
  const cohortPassed = Boolean(cohortReport && cohortReport.passed === true);
  const validFeedback = feedbackEntries.filter((entry) => entry.valid);
  const unresolvedHighSeverityCount = feedbackEntries.reduce(
    (sum, entry) => sum + entry.unresolvedHighSeverityCount,
    0,
  );

  const triage = {
    gate: "phase1-pilot-feedback-triage",
    generatedAt: new Date().toISOString(),
    requirements: {
      minimumValidFeedbackCount: 3,
      unresolvedHighSeverityAllowed: 0,
      cohortTelemetryMustPass: true,
    },
    cohortTelemetry: {
      exists: Boolean(cohortReport),
      passed: cohortPassed,
      reportPath: COHORT_REPORT_PATH,
    },
    feedbackSummary: {
      totalFeedbackFiles: feedbackEntries.length,
      validFeedbackFiles: validFeedback.length,
      unresolvedHighSeverityCount,
    },
    feedbackEntries,
    passed:
      cohortPassed &&
      validFeedback.length >= 3 &&
      unresolvedHighSeverityCount === 0,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(TRIAGE_REPORT_PATH, JSON.stringify(triage, null, 2));

  if (!triage.passed) {
    console.error("[Pilot Feedback Triage] Failed.");
    console.error("[Pilot Feedback Triage] Report:", TRIAGE_REPORT_PATH);
    process.exit(1);
  }

  console.log("[Pilot Feedback Triage] Passed.");
  console.log("[Pilot Feedback Triage] Report:", TRIAGE_REPORT_PATH);
}

main();
