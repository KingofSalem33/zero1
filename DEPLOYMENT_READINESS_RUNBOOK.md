# Deployment Readiness Runbook

Last updated: 2026-02-19

## 1) Required Environment Variables

### API (`apps/api`)

- `NODE_ENV=production`
- `STRICT_ENV=true`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `CORS_ALLOWED_ORIGINS` (comma-separated, no trailing slash)
- `OPENAI_API_KEY`
- `SENTRY_DSN` (recommended for production observability)

### Web (`apps/web`)

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SENTRY_DSN` (required to emit frontend Sentry events)

## 2) Build Verification

Run before every deploy:

```bash
npm --prefix apps/api run build
npm --prefix apps/web run typecheck
npm --prefix apps/web run build
```

## 3) API Readiness Checks

Run automated checks against the target API URL:

```bash
API_BASE_URL=https://your-api-domain npm --prefix apps/api run readiness:check
```

Optional CORS-origin override:

```bash
API_BASE_URL=https://your-api-domain READINESS_ORIGIN=https://your-web-domain npm --prefix apps/api run readiness:check
```

This verifies:

- `GET /health` returns `200` and `{"ok": true}`
- `GET /api/health/db?force=true` returns `200` and `{"healthy": true}`
- CORS preflight accepts the configured origin

## 4) Manual Smoke Checks

### Auth + user data isolation

- Login in web with a real account
- Confirm highlights load
- Confirm bookmarks/library load
- Confirm a second account cannot see the first account data

### Frontend Sentry smoke event

- Open the deployed web app in production
- Trigger a controlled test in browser console:

```js
window.Sentry?.captureMessage("zero1-web-sentry-smoke-test");
```

- Confirm event appears in Sentry under the correct environment

### API Sentry smoke event

- Trigger a controlled API error in non-user-impacting way (staging preferred)
- Confirm event appears in Sentry for API service

## 5) Rollback Criteria

Rollback immediately if any of the following occur after deploy:

- Health or DB health endpoints become non-200
- Authentication failures on core routes increase materially
- Error rate spikes in Sentry
- CORS blocks expected production origin

## 6) Rollback Action

- Redeploy previous known-good version
- Re-run `readiness:check`
- Confirm Sentry error rate returns to baseline
