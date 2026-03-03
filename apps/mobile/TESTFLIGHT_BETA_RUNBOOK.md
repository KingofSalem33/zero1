# iOS TestFlight Beta Runbook

## Goal

Run the Phase 2.4 TestFlight beta cycle with repeatable commands and clear pass/fail checks.

## Prerequisites

- Apple Developer account access (for signing + TestFlight upload).
- EAS logged in:
  - `npm --prefix apps/mobile run eas:whoami`
- Mobile env configured in `apps/mobile/.env`:
  - `EXPO_PUBLIC_API_URL`
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `EXPO_PUBLIC_WEB_APP_URL=https://biblelot.vercel.app`
- Production profile pins web-shell vars in `apps/mobile/eas.json`:
  - `EXPO_PUBLIC_WEB_APP_URL`
  - `EXPO_PUBLIC_ENABLE_WEB_SHELL=true`
  - `EXPO_PUBLIC_WEB_APP_ALLOWED_HOSTS=biblelot.vercel.app`
  - `EXPO_PUBLIC_WEB_SHELL_ALLOW_ANY_HOST=false`
  - `EXPO_PUBLIC_WEB_SHELL_FALLBACK_TO_NATIVE=false`

## Step 1: Readiness Check

Run:

```bash
npm --prefix apps/mobile run phase2:testflight:check
```

Expected:

- All checks show `PASS`.
- `EXPO_PUBLIC_WEB_APP_URL` resolves to `biblelot.vercel.app`.

## Step 2: Build Production iOS Artifact

Run:

```bash
npm --prefix apps/mobile run eas:build:ios:prod
```

Expected:

- EAS build completes successfully.
- Build appears in Expo dashboard for project `biblelot-sauetm`.

## Step 3: Submit to TestFlight

Run:

```bash
npm --prefix apps/mobile run eas:submit:ios:prod
```

Expected:

- Submission accepted by App Store Connect.
- Build visible under TestFlight for `com.zero1.mobile`.

## Step 4: Run Mobile Production Smoke Gate

Run after installing the TestFlight build on a real iPhone:

```bash
npm --prefix apps/mobile run phase2:smoke:mobile:prod -- --build=<build-number> --version=<app-version> --tester="<tester-name>" --launch=pass --auth=pass --library=pass --map=pass
```

Expected:

- Command exits with `Passed`.
- Report is written to `apps/mobile/reports/mobileProdSmoke-build<build-number>.json`.

If any status is `fail`, the command exits non-zero and rollout is blocked.

## Step 5: Record Build Notes

Use `apps/mobile/TESTFLIGHT_RELEASE_NOTES_TEMPLATE.md` for every build.

Minimum required fields:

- Build metadata (version/build/commit/tester cohort).
- Gate check evidence including smoke report path.
- Core flow results and issue list.
- Explicit rollout decision (`promote`, `hold`, or `rollback`).

## Step 6: Triage Dashboards

Crash triage:

- Expo builds: `https://expo.dev/accounts/cmoney612s-organization/projects/biblelot-sauetm/builds`
- TestFlight build list: `https://appstoreconnect.apple.com/apps/6759851642/testflight/ios`
- Sentry issues (set your org/project): `https://sentry.io/organizations/<org>/issues/?project=<project-id>&query=event.type%3Aerror%20release%3Acom.zero1.mobile`

API error triage:

- Render service logs: `https://dashboard.render.com/`
- API health check: `https://biblelot-api.onrender.com/health`
- DB health check: `https://biblelot-api.onrender.com/api/health/db`

Auth failure triage:

- Supabase logs explorer: `https://supabase.com/dashboard/project/<project-ref>/logs/explorer`
- Supabase auth users: `https://supabase.com/dashboard/project/<project-ref>/auth/users`

## Step 7: Rollback Trigger Thresholds

Trigger rollback (or rollout hold) when any threshold is hit in the current beta round:

- Startup crash rate: `>= 2%` over the latest `100` launches.
- Unauthorized/auth failures: `>= 5%` of authenticated API calls returning `401` over `30` minutes.
- Blank-screen/web-shell load timeout: `>= 1%` of launches, or `>= 3` confirmed user reports in `24` hours.

Rollback action:

1. Stop widening TestFlight rollout immediately.
2. Mark build decision as `rollback` in release notes.
3. Promote prior stable build for testing while patch build is prepared.
