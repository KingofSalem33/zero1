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

## Step 4: Beta Smoke Matrix

Validate on iPhone:

1. App launches without white screen/crash.
2. Sign in with Google succeeds.
3. Sign in with Apple succeeds.
4. Highlight synopsis returns text in under 5s target.
5. Save connection succeeds.
6. Save map succeeds.
7. Library reload shows saved items.

## Step 5: Triage

For each bug found:

- Record severity (`P0`, `P1`, `P2`).
- Record exact repro steps.
- Record platform/app version/build number.
- Fix `P0/P1` before widening beta audience.
