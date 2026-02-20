# Zero1 Desktop Release Notes

## Local Commands

- `npm --prefix apps/desktop run dist:win`
  - Builds renderer + electron main
  - Produces Windows NSIS installer + `latest.yml` in `apps/desktop/release`

- `npm --prefix apps/desktop run dist:win:publish`
  - Same as above, but publishes to GitHub Releases using `electron-builder`

- `npm --prefix apps/desktop run phase1:smoke`
  - Runs desktop auth/session tests + build smoke checks
  - Optional authenticated API probes run when smoke env vars are supplied

- `npm --prefix apps/desktop run phase1:manual-validation`
  - Runs Phase 1.3 deep validation:
    - onboarding/auth smoke
    - chat/map endpoint smoke
    - long-session stability loop
    - crash diagnostics handler verification

- `npm --prefix apps/desktop run phase1:gate`
  - Executes Phase 1.3 release gate (smoke + dist + rollback rehearsal + artifact checks)

- `npm --prefix apps/desktop run rollback:rehearsal`
  - Generates rollback rehearsal report for current release artifacts

## Update Channel

- Default provider: GitHub Releases (`KingofSalem33/zero1`)
- Channel env vars (optional at runtime):
  - `DESKTOP_AUTO_UPDATE_ENABLED=true|false`
  - `DESKTOP_UPDATE_CHANNEL=latest`
  - `DESKTOP_UPDATE_FEED_URL=https://...` (only if using a non-GitHub feed)

## GitHub Actions Secrets (for signed builds)

- `DESKTOP_WINDOWS_CSC_LINK`
- `DESKTOP_WINDOWS_CSC_KEY_PASSWORD`

If signing secrets are absent, the workflow still builds artifacts but they are unsigned.
