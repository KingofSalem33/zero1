#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const DIAGNOSTICS_DIR = path.join(REPORTS_DIR, "diagnostics");
const DESKTOP_PACKAGE_JSON_PATH = path.resolve(__dirname, "..", "package.json");

const FLOW_KEYS = [
  "installLaunch",
  "emailPasswordSignIn",
  "magicLinkSignIn",
  "bookmarksSync",
  "highlightsSync",
  "libraryConnectionsSync",
  "chatRequest",
  "mapTrace",
  "autoUpdateCheck",
];

function sanitizeFilePart(value) {
  return value.replace(/[^a-zA-Z0-9-_]/g, "-");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function loadDesktopVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(DESKTOP_PACKAGE_JSON_PATH, "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

async function askRequired(rl, prompt, fallback = "") {
  while (true) {
    const answer = (await rl.question(prompt)).trim();
    const value = answer || fallback;
    if (value.length > 0) return value;
    console.log("This field is required.");
  }
}

async function askYesNo(rl, prompt, fallback = "y") {
  while (true) {
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    const value = answer || fallback;
    if (value === "y" || value === "yes") return true;
    if (value === "n" || value === "no") return false;
    console.log("Please answer y or n.");
  }
}

async function askRating(rl, fieldName) {
  while (true) {
    const answer = (await rl.question(`${fieldName} rating (1-5): `)).trim();
    const value = Number(answer);
    if (Number.isInteger(value) && value >= 1 && value <= 5) return value;
    console.log("Rating must be an integer between 1 and 5.");
  }
}

async function collectIssues(rl) {
  const issues = [];
  let keepGoing = await askYesNo(rl, "Add an issue entry? (y/N): ", "n");
  while (keepGoing) {
    const severity = await askRequired(
      rl,
      "Issue severity (low|medium|high): ",
    );
    const area = await askRequired(
      rl,
      "Issue area (install|auth|sync|chat|map|update|other): ",
    );
    const summary = await askRequired(rl, "Issue summary: ");
    const reproSteps = (await rl.question("Repro steps (optional): ")).trim();
    const screenshotPath = (await rl.question("Screenshot path (optional): ")).trim();
    const resolved = await askYesNo(rl, "Is this issue resolved? (y/N): ", "n");
    issues.push({
      severity,
      area,
      summary,
      reproSteps,
      screenshotPath,
      resolved,
    });
    keepGoing = await askYesNo(rl, "Add another issue? (y/N): ", "n");
  }
  return issues;
}

function cloneDiagnosticsFile(pilotUserId, sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
  const ext = path.extname(sourcePath) || ".log";
  const targetName = `${sanitizeFilePart(pilotUserId)}-${Date.now()}${ext}`;
  const targetPath = path.join(DIAGNOSTICS_DIR, targetName);
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const desktopVersion = loadDesktopVersion();
    const pilotUserId = await askRequired(rl, "Pilot user ID: ");
    const sessionDate = await askRequired(
      rl,
      `Session date (YYYY-MM-DD) [${todayIsoDate()}]: `,
      todayIsoDate(),
    );
    const installerVersion = await askRequired(
      rl,
      `Installer version [${desktopVersion}]: `,
      desktopVersion,
    );
    const platform = await askRequired(
      rl,
      `Platform [${process.platform}-${os.release()}]: `,
      `${process.platform}-${os.release()}`,
    );

    console.log("\nMark completed flows:");
    const completedFlows = {};
    for (const flowKey of FLOW_KEYS) {
      completedFlows[flowKey] = await askYesNo(rl, `- ${flowKey}? (y/N): `, "n");
    }

    console.log("\nEnter ratings:");
    const rating = {
      stability: await askRating(rl, "Stability"),
      performance: await askRating(rl, "Performance"),
      uxClarity: await askRating(rl, "UX clarity"),
    };

    const freeformFeedback = (
      await rl.question("Freeform feedback (optional): ")
    ).trim();

    console.log("\nIssues:");
    const issues = await collectIssues(rl);

    const diagnosticsSourcePath = (
      await rl.question(
        "Diagnostics log path (optional, e.g. %APPDATA%\\zero1\\desktop-diagnostics.log): ",
      )
    ).trim();

    let diagnosticsLogPath = diagnosticsSourcePath;
    if (diagnosticsSourcePath.length > 0 && fs.existsSync(diagnosticsSourcePath)) {
      const shouldCopy = await askYesNo(
        rl,
        "Copy diagnostics log into reports/diagnostics for evidence retention? (Y/n): ",
        "y",
      );
      if (shouldCopy) {
        const copiedPath = cloneDiagnosticsFile(pilotUserId, diagnosticsSourcePath);
        if (copiedPath) diagnosticsLogPath = copiedPath;
      }
    }

    const report = {
      pilotUserId,
      sessionDate,
      installerVersion,
      platform,
      completedFlows,
      issues,
      rating,
      freeformFeedback,
      diagnosticsLogAttached: diagnosticsLogPath.length > 0,
      diagnosticsLogPath,
    };

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const fileName = `pilotFeedback-${sanitizeFilePart(pilotUserId)}.json`;
    const outputPath = path.join(REPORTS_DIR, fileName);
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));

    console.log("\nPilot feedback report saved:");
    console.log(outputPath);
    console.log("\nNext:");
    console.log("1) Repeat for remaining pilot users (target >= 3 valid files).");
    console.log("2) Run: npm --prefix apps/desktop run phase1:feedback-triage");
    console.log("3) Run: npm --prefix apps/desktop run phase1:exit-check");
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error("[Pilot Feedback Wizard] Failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

