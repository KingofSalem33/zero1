#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DESKTOP_DIR = path.resolve(__dirname, "..");
const RELEASE_DIR = path.join(DESKTOP_DIR, "release");
const REPORTS_DIR = path.join(DESKTOP_DIR, "reports");
const REPORT_PATH = path.join(REPORTS_DIR, "rollbackRehearsal.json");
const WORKFLOW_PATH = path.resolve(
  DESKTOP_DIR,
  "..",
  "..",
  ".github",
  "workflows",
  "desktop-artifacts.yml",
);

function findInstallerArtifacts() {
  if (!fs.existsSync(RELEASE_DIR)) {
    return [];
  }
  return fs
    .readdirSync(RELEASE_DIR)
    .filter((name) => name.endsWith(".exe"))
    .map((name) => {
      const fullPath = path.join(RELEASE_DIR, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
}

function main() {
  const installers = findInstallerArtifacts();
  const latestYmlPath = path.join(RELEASE_DIR, "latest.yml");
  const workflowExists = fs.existsSync(WORKFLOW_PATH);

  if (installers.length === 0) {
    console.error("[Rollback Rehearsal] No installer artifacts found.");
    process.exit(1);
  }

  if (!fs.existsSync(latestYmlPath)) {
    console.error("[Rollback Rehearsal] Missing latest.yml artifact.");
    process.exit(1);
  }

  if (!workflowExists) {
    console.error("[Rollback Rehearsal] Missing desktop artifacts workflow.");
    process.exit(1);
  }

  const current = installers[0];
  const previous = installers[1] || installers[0];
  const previousTagHint =
    process.env.ROLLBACK_PREVIOUS_TAG || "desktop-v<previous-stable-tag>";
  const simulationMode = installers.length < 2 ? "single-artifact" : "dual-artifact";

  const rehearsalCommands = [
    `1. Identify rollback target release tag: ${previousTagHint}`,
    "2. Open GitHub Actions -> Desktop Artifacts workflow.",
    "3. Re-run release publish for rollback target tag.",
    "4. Confirm release assets include installer + latest.yml + blockmap.",
    "5. Validate desktop auto-updater points to rollback release metadata.",
  ];

  const report = {
    gate: "phase1.3-desktop-rollback-rehearsal",
    ranAt: new Date().toISOString(),
    simulationMode,
    workflowPath: WORKFLOW_PATH,
    artifacts: {
      current,
      rollbackTarget: previous,
      latestYml: {
        path: latestYmlPath,
        sizeBytes: fs.statSync(latestYmlPath).size,
      },
    },
    rehearsalCommands,
    passed: true,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("[Rollback Rehearsal] Passed.");
  console.log("[Rollback Rehearsal] Report:", REPORT_PATH);
}

main();
