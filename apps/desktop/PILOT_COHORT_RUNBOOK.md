# Pilot Cohort Runbook

## Objective

Run the first pilot cohort with measurable telemetry and structured feedback capture.

## Automated Cohort Telemetry

Run:

`npm --prefix apps/desktop run phase1:cohort`

This executes multi-user authenticated sessions against the configured API and writes:

- `apps/desktop/reports/pilotCohortTelemetry.json`

## Human Pilot Session Intake

For each pilot user:

1. Run `npm --prefix apps/desktop run phase1:feedback:wizard`
2. Save output as `apps/desktop/reports/pilotFeedback-<pilotUserId>.json` (wizard does this automatically).
3. Ensure diagnostics log path is attached for each pilot file.

Manual fallback:

1. Copy `apps/desktop/reports/pilotFeedbackTemplate.json`
2. Rename to `apps/desktop/reports/pilotFeedback-<pilotUserId>.json`
3. Fill completed flows, issues, ratings, and attach diagnostics log path.

After collecting feedback files, run:

- `npm --prefix apps/desktop run phase1:feedback-triage`
- `npm --prefix apps/desktop run phase1:exit-check`

## Diagnostics Log Location (Desktop App Runtime)

- Windows default: `%APPDATA%/zero1/desktop-diagnostics.log` (via Electron userData path)

## Exit Signal for Phase 1 Pilot

- `pilotCohortTelemetry.json` has no high-severity failures in core flows
- At least 3 pilot feedback files are collected
- No unresolved high-severity issues in pilot feedback
