# TestFlight Release Notes - Build 18

## Build Metadata

- Date: 2026-03-02
- App version: 1.0.0
- iOS build number: 18
- Git branch: biblelot
- Git commit: eaddafe
- Tester cohort: Team (Expo) internal beta

## Environment

- Web app URL: https://biblelot.vercel.app
- API URL: https://biblelot-api.onrender.com
- Supabase project ref: ciuxquemfnbruvvzbfth
- Sentry project: configured via EAS production environment (`EXPO_PUBLIC_SENTRY_DSN`)

## Gate Checks

- `npm --prefix apps/mobile run phase2:testflight:check`: PASS (previously validated in build pipeline)
- `npm --prefix apps/mobile run phase2:smoke:mobile:prod -- --build=18 --launch=pass --auth=pass --library=pass --map=pass`: PASS
- Smoke report path: `apps/mobile/reports/mobileProdSmoke-build18.json`

## Core Flow Results

- Launch: PASS
- Auth: PASS
- Library load: PASS
- Map save: PASS
- Regression notes: No startup crash, no auth loop, and no white-screen regression observed during this run.

## Issues and Triage

- P0: None
- P1: None
- P2: None
- Linked tickets: None for build 18 validation run

## Rollout Decision

- Decision: `promote`
- If rollback: N/A
- Sign-off owner: Cory Hanson
