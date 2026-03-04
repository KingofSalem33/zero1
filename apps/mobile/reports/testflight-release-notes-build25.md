# TestFlight Release Notes - Build 25

## Build Metadata

- Date: 2026-03-03
- App version: 1.0.0
- iOS build number: 25
- Git branch: biblelot
- Git commit: d4f3697
- Tester cohort: Team (Expo) internal beta

## Environment

- Web app URL: https://biblelot.vercel.app
- API URL: https://biblelot-api.onrender.com
- Supabase project ref: ciuxquemfnbruvvzbfth
- Sentry project: configured via EAS production environment (`EXPO_PUBLIC_SENTRY_DSN`)

## Gate Checks

- `npm --prefix apps/mobile run phase2:testflight:check`: PASS
- `node .\scripts\runMobileProductionSmoke.mjs --build=25 --version=1.0.0 --tester="Cory Hanson" --launch=pass --auth=pass --library=pass --map=pass`: PASS
- `npm run phase2:smoke:mobile:prod -- --build=25 --version=1.0.0 --tester="Cory Hanson" --launch=pass --auth=pass --library=pass --map=pass --highlight=pass` (2026-03-04): PASS
- Smoke report path: `apps/mobile/reports/mobileProdSmoke-build25.json`

## Core Flow Results

- Launch: PASS
- Auth: PASS
- Library load: PASS
- Map save: PASS
- Highlight flow: PASS
- Regression notes: Safe-area startup issue resolved; mobile web-shell layout fit/scroll behavior improved and verified in this run.

## Issues and Triage

- P0: None
- P1: None
- P2: None
- Linked tickets: None for build 25 validation run

## Rollout Decision

- Decision: `promote`
- If rollback: N/A
- Sign-off owner: Cory Hanson
