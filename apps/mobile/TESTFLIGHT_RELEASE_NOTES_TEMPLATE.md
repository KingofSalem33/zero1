# TestFlight Release Notes Template

Use one copy of this template per TestFlight build.

## Build Metadata

- Date:
- App version:
- iOS build number:
- Git branch:
- Git commit:
- Tester cohort:

## Environment

- Web app URL:
- API URL:
- Supabase project ref:
- Sentry project:

## Gate Checks

- `npm --prefix apps/mobile run phase2:testflight:check`:
- `npm --prefix apps/mobile run phase2:smoke:mobile:prod -- --build=<build> --launch=pass --auth=pass --library=pass --map=pass`:
- Smoke report path (`apps/mobile/reports/mobileProdSmoke-build<build>.json`):

## Core Flow Results

- Launch:
- Auth:
- Library load:
- Map save:
- Regression notes:

## Issues and Triage

- P0:
- P1:
- P2:
- Linked tickets:

## Rollout Decision

- Decision: `promote` | `hold` | `rollback`
- If rollback: link previous stable build and reason:
- Sign-off owner:
