# TestFlight Release Notes - Build 26

## Build Metadata

- Date: 2026-03-04
- App version: 1.0.0
- iOS build number: 26
- Git branch: biblelot
- Git commit: d9bfbae
- Tester cohort: Team (Expo) internal beta

## Environment

- Web app URL: https://biblelot.vercel.app
- API URL: https://biblelot-api.onrender.com
- Supabase project ref: ciuxquemfnbruvvzbfth
- Sentry project: configured via EAS production environment (`EXPO_PUBLIC_SENTRY_DSN`)

## Gate Checks

- `npm --prefix apps/mobile run phase2:testflight:check`: PASS
- `npm run phase2:smoke:mobile:prod -- --build=26 --version=1.0.0 --tester="Cory Hanson" --launch=pass --auth=pass --library=pass --map=pass --highlight=pass` (2026-03-04): PASS
- Smoke report path: `apps/mobile/reports/mobileProdSmoke-build26.json`

## Core Flow Results

- Launch: PASS
- Auth: PASS
- Library load: PASS
- Map save: PASS
- Highlight flow: PASS
- Regression notes: Native-first shell verified (Library-first tab flow); map access remains isolated via `Map (Beta)` fallback.

## Issues and Triage

- P0: None
- P1: None
- P2: None
- Linked tickets: None for build 26 validation run

## Rollout Decision

- Decision: `promote`
- If rollback: N/A
- Sign-off owner: Cory Hanson
