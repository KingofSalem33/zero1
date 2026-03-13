# TestFlight Release Notes - Build 27

## Build Metadata

- Date: 2026-03-04
- App version: 1.0.0
- iOS build number: 27
- Git branch: biblelot
- Git commit: 984b8ac
- Tester cohort: Team (Expo) internal beta

## Environment

- Web app URL: https://biblelot.vercel.app
- API URL: https://biblelot-api.onrender.com
- Supabase project ref: ciuxquemfnbruvvzbfth
- Sentry project: configured via EAS production environment (`EXPO_PUBLIC_SENTRY_DSN`)

## Gate Checks

- `npm --prefix apps/mobile run phase2:testflight:check`: PASS
- `node .\scripts\runMobileProductionSmoke.mjs --build=27 --version=1.0.0 --tester="Cory Hanson" --launch=pass --auth=pass --library=pass --map=pass --highlight=pass` (2026-03-04): PASS
- Smoke report path: `apps/mobile/reports/mobileProdSmoke-build27.json`

## Core Flow Results

- Launch: PASS
- Auth: PASS
- Library load: PASS
- Map save: PASS
- Highlight flow: PASS
- Regression notes: None observed in build 27 validation pass.

## Issues and Triage

- P0: None
- P1: None
- P2: None
- Linked tickets: None for build 27 validation run

## Rollout Decision

- Decision: `promote`
- If rollback: N/A
- Sign-off owner: Cory Hanson
