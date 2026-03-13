# Desktop Pilot Release Checklist

## Preflight

- [ ] Confirm API target is production/staging as intended (`VITE_API_URL`)
- [ ] Confirm Supabase target is production/staging as intended
- [ ] Confirm desktop updater channel (`DESKTOP_UPDATE_CHANNEL`) matches rollout plan
- [ ] Confirm session persistence policy (`DESKTOP_ALLOW_PLAINTEXT_SESSION_FALLBACK`) is correct

## Automated Gate

- [ ] `npm --prefix apps/desktop run phase1:smoke`
- [ ] `npm --prefix apps/desktop run phase1:gate`
- [ ] Verify reports generated:
  - `apps/desktop/reports/smokeSuite.json`
  - `apps/desktop/reports/pilotReleaseGate.json`
  - `apps/desktop/reports/rollbackRehearsal.json`

## Manual Core Flow Smoke (Pilot Build)

- [ ] App installs and launches
- [ ] Email/password sign-in works
- [ ] Magic-link sign-in email is sent and callback succeeds
- [ ] Bookmarks load/sync from API
- [ ] Highlights load/sync from API
- [ ] Library connections load/sync from API
- [ ] Auto-update check runs without error

## Rollback Readiness

- [ ] `npm --prefix apps/desktop run rollback:rehearsal`
- [ ] Confirm prior stable installer/tag is identified
- [ ] Confirm rollback workflow owner and trigger path are documented

## Gate Sign-off

- [ ] Engineering sign-off
- [ ] Product sign-off
- [ ] Pilot rollout window approved
