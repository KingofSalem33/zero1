#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.resolve(__dirname, "..", "reports");
const PILOT_GATE_REPORT = path.join(REPORTS_DIR, "pilotReleaseGate.json");
const CRED_SMOKE_REPORT = path.join(REPORTS_DIR, "credentialedPilotSmoke.json");
const SIGNOFF_REPORT = path.join(REPORTS_DIR, "pilotSignoff.json");

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const gateReport = readJson(PILOT_GATE_REPORT);
  const credentialedSmoke = readJson(CRED_SMOKE_REPORT);

  if (!gateReport || gateReport.passed !== true) {
    const failed = {
      gate: "phase1.3-pilot-signoff",
      generatedAt: new Date().toISOString(),
      passed: false,
      engineering: { approved: false, reason: "Pilot gate missing/failed." },
      product: { approved: false, status: "blocked" },
      artifacts: {
        pilotGateReport: PILOT_GATE_REPORT,
        credentialedSmokeReport: CRED_SMOKE_REPORT,
      },
    };
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(SIGNOFF_REPORT, JSON.stringify(failed, null, 2));
    console.error("[Pilot Signoff] Missing/failed pilot release gate report.");
    console.error("[Pilot Signoff] Report:", SIGNOFF_REPORT);
    process.exit(1);
  }

  if (!credentialedSmoke || credentialedSmoke.passed !== true) {
    const failed = {
      gate: "phase1.3-pilot-signoff",
      generatedAt: new Date().toISOString(),
      passed: false,
      engineering: {
        approved: false,
        reason: "Credentialed pilot smoke missing/failed.",
      },
      product: { approved: false, status: "blocked" },
      artifacts: {
        pilotGateReport: PILOT_GATE_REPORT,
        credentialedSmokeReport: CRED_SMOKE_REPORT,
      },
    };
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(SIGNOFF_REPORT, JSON.stringify(failed, null, 2));
    console.error("[Pilot Signoff] Missing/failed credentialed pilot smoke report.");
    console.error("[Pilot Signoff] Report:", SIGNOFF_REPORT);
    process.exit(1);
  }

  const productDecisionRaw = (process.env.PILOT_PRODUCT_SIGNOFF || "").trim();
  const productApproved =
    productDecisionRaw.toLowerCase() === "approved" ||
    productDecisionRaw.toLowerCase() === "true";

  const signoff = {
    gate: "phase1.3-pilot-signoff",
    generatedAt: new Date().toISOString(),
    engineering: {
      approved: true,
      basis: [
        "pilotReleaseGate.json passed",
        "credentialedPilotSmoke.json passed",
      ],
    },
    product: {
      approved: productApproved,
      status: productApproved ? "approved" : "pending_owner_approval",
      instruction: productApproved
        ? "Product sign-off captured from environment."
        : "Set PILOT_PRODUCT_SIGNOFF=approved and rerun to finalize product sign-off.",
    },
    artifacts: {
      pilotGateReport: PILOT_GATE_REPORT,
      credentialedSmokeReport: CRED_SMOKE_REPORT,
    },
    passed: productApproved,
  };

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.writeFileSync(SIGNOFF_REPORT, JSON.stringify(signoff, null, 2));

  if (!productApproved) {
    console.warn("[Pilot Signoff] Engineering sign-off complete; product sign-off pending.");
    console.warn("[Pilot Signoff] Report:", SIGNOFF_REPORT);
    process.exit(2);
  }

  console.log("[Pilot Signoff] Engineering + product sign-off completed.");
  console.log("[Pilot Signoff] Report:", SIGNOFF_REPORT);
}

main();
