# Phase 2.5.5 Exit Criteria Status

Last updated: 2026-03-04

## Criteria

1. Mobile launch success rate and crash-free session rate meet target thresholds.
2. Auth + library/map/highlight core flows pass on latest TestFlight build.
3. Product direction chosen and documented for Phase 2.6.

## Current status

- `1` In progress.
  - Required evidence still pending:
    - 3-day baseline from TestFlight/Sentry aligned to thresholds in `apps/mobile/TESTFLIGHT_BETA_RUNBOOK.md`.
- `2` In progress.
  - Current latest build evidence:
    - Build 25 PASS for `launch/auth/library/map`:
      - `apps/mobile/reports/mobileProdSmoke-build25.json`
  - Remaining gap:
    - Run highlight-inclusive smoke for latest build and attach report.
- `3` Complete.
  - Decision doc:
    - `apps/mobile/PHASE26_PRODUCT_DIRECTION.md`
  - Direction:
    - `native-first`

## Next execution command (PowerShell)

Run on latest TestFlight build after completing highlight verification:

```powershell
node .\scripts\runMobileProductionSmoke.mjs `
  --build=<LATEST_BUILD> `
  --version=1.0.0 `
  --tester="Cory Hanson" `
  --launch=pass `
  --auth=pass `
  --library=pass `
  --map=pass `
  --highlight=pass
```

Then update:

- `apps/mobile/reports/testflight-release-notes-build<LATEST_BUILD>.md`
- `DEPLOYMENT_LAUNCH_PLAN.md` (check off criterion `2` once evidence is attached)
