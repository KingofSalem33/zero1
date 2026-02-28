# Zero1 Deployment Launch Plan

Last updated: 2026-02-27
Owner: Product + Engineering
Status: In progress

## Active Execution Board (Phase 0.1 Sprint)

- [x] Agent A (API): Enforce `requireAuth` on `/api/library` and `/api/bookmarks`; remove caller-supplied `userId` handling in these routes.
- [x] Agent B (Web): Remove `anonymous` user path for library/bookmark flows; switch library writes/reads to auth-bearing requests.
- [x] Agent C (Validation): Run `apps/api` build and `apps/web` typecheck after hardening changes.
- [x] Agent D (API+DB): Migrate library/bookmark persistence from JSON files to Supabase tables + RLS.
- [x] Agent E (Data Migration): Add one-time JSON -> Supabase backfill script and verification report.
- [x] Agent F (Data Migration): Execute `--apply` migration in environment and validate post-migration counts/report.
- [x] Agent G (Data Ownership): Applied DB migration and reran ownership import with fallback user UUID.
- [x] Agent H (Cleanup): Decommission legacy JSON runtime files/paths after backup retention.
- [x] Agent I (API Security): Implement Phase 0.3 key-handling split (`user-context` vs `service-role`) and migrate sensitive routes to user-scoped clients.
- [x] Agent J (API Security): Remove `VITE_*` service-role fallback in API/script config and complete privileged-call audit beyond user-data routes.
- [x] Agent K (API Platform): Phase 0.4 baseline completed for API: env-driven CORS allowlist + strict API env contract.
- [x] Agent L (Web+Ops): Re-enable frontend Sentry initialization for production and add deployment readiness runbook checks.
- [x] Agent M (Web Platform): Define strict web env contract for runtime/build and migrate web env access to centralized typed config.
- [x] Agent N (Validation): Execute Phase 0 local exit validation pass (authz checks + RLS isolation + regression sweep).
- [x] Agent O (Validation): Run readiness checks against deployed API base URL and finalize external production gate evidence.
- [x] Agent P (Validation): Close remaining Phase 0 test gap by adding/automating regression coverage for critical auth + library/highlights flows.
- [x] Agent Q (Desktop): Begin Phase 1.1 desktop foundation by scaffolding `apps/desktop` (Electron + React + TypeScript) with shared auth-ready API client wiring.
- [x] Agent R (Desktop Release): Implement Phase 1.1 release plumbing for desktop (packaging/signing/update channel + CI artifact pipeline).
- [x] Agent S (Shared Client): Reuse current web UI where practical by moving shared desktop/web feature views into a common package boundary.
- [x] Agent T (Desktop Auth): Execute Phase 1.2 production auth/session hardening for desktop (magic-link fallback + secure persistence validation + token refresh tests).
- [x] Agent U (Desktop QA/Release): Execute Phase 1.3 desktop QA/release gate (core flow smoke suite + pilot release checklist + rollback rehearsal).
- [x] Agent W (DB Fix): Apply Supabase grants fix for `highlights` in production and validate via credentialed smoke.
- [x] Agent V (Pilot Sign-off): Run credentialed pilot smoke on deployed backend + complete release sign-off (engineering/product) for first pilot cohort.
- [x] Agent X (Validation): Execute remaining Phase 1.3 manual validation (chat/map/onboarding smoke + long-session stability + crash diagnostics verification).
- [x] Agent Y (Pilot Cohort): Run first pilot cohort sessions and collect crash/error telemetry + user feedback for Phase 1 exit criteria.
- [x] Agent ZA (Pilot Ops): Add guided pilot feedback intake automation to standardize report quality and diagnostics evidence attachment.
- [x] Agent ZC (Desktop UX): Switch desktop dev runtime to launch the full web application shell in Electron for real pilot flow validation.
- [x] Agent ZB (Pilot Exit): Collect >=3 real pilot user feedback reports + diagnostics log attachments, rerun triage + phase-exit checks, then close Phase 1 exit criteria.
- [x] Agent AA (Mobile Foundation): Start Phase 2.1 mobile foundation (`apps/mobile` Expo scaffold + shared auth wiring plan) after Phase 1 closure.
- [x] Agent AB (Mobile Auth Code): Implement app-side provider auth plumbing (Apple + Google launch paths) with deep-link callback handling and Supabase session exchange.
- [x] Agent AD (Mobile Dev Build): Add Expo dev-client + EAS build configuration for reliable native OAuth callback testing.
- [x] Agent AC (Provider Config): Complete Google + Apple provider dashboard configuration in Supabase/Apple and verify Supabase callback flow succeeds server-side.
- [x] Agent AE (Mobile Auth Validation): Validate Google + Apple auth callbacks end-to-end on native iOS dev client (`zero1://auth/callback`) and run protected probe after sign-in.
- [x] Agent AF (Mobile Shell): Establish mobile navigation + design tokens and replace auth shell-only view with first real feature route.
- [x] Agent AG (Mobile Feature Routes): Expand mobile feature routes beyond library connections (bookmarks/highlights/home actions) and converge on product-grade navigation structure.
- [x] Agent AH (Mobile Interactions): Add mobile bookmark/highlight interaction flows (detail, refresh UX, and write-path hooks) to move from read-only shell to task-complete mobile usage.
- [x] Agent AI (Mobile Routing Shell): Introduce route-based mobile navigation shell (auth/app split + routed detail screens) and migrate current inline panels to route-based flows.
- [x] Agent AJ (Mobile Navigation Stack): Migrate mobile shell to React Navigation (auth/app split + native stack + bottom tabs) so route state is no longer managed inside `App.tsx`.
- [x] Agent AK (Mobile Modularization): Extract remaining mobile screen JSX/state slices from `apps/mobile/App.tsx` into screen modules + hooks to reduce controller/file size and improve maintainability.
- [x] Agent AL (Mobile Context + Tests): Move shared mobile state/actions from prop wiring to a dedicated context provider + add focused mobile screen/unit tests for controller actions and route rendering.
- [x] Agent AM (Mobile CI Gate): Add first stable mobile CI quality gate (`typecheck + lint + mobile tests`) and enforce it in `biblelot` CI flow.
- [x] Agent AN (Branch Protection): Configure GitHub branch protection for `biblelot` to require passing `node-lint-build` before merge, and document required-check policy.
- [x] Agent AO (Branch-Rule Smoke Merge): Complete branch-protection smoke PR merge path by aligning review requirements for solo-owner workflow and confirming merge to `biblelot`.
- [x] Agent AP (Phase 2.1 Validation): Close remaining Phase 2.1 checklist item by executing and documenting essential mobile core-feature path validation evidence.
- [x] Agent AQ (Phase 2.3 Kickoff): Start Phase 2.3 shared-logic extraction by scaffolding `packages/shared` and migrating first cross-client domain contracts.
- [x] Agent AR (Shared Contracts + Tests): Expand Phase 2.3 extraction to additional shared contracts and add API contract tests for shared schema stability.
- [x] Agent AS (Web Library Rewire): Continue Phase 2.3 by migrating web library domain types/parsers to `@zero1/shared` and reducing duplicate API-shape normalization in web components.
- [x] Agent AT (Web Mutation Contracts): Continue Phase 2.3 by migrating remaining web-side library mutation/request contracts (connection/map update payloads + bundle/session helpers) into `@zero1/shared`.
- [x] Agent AU (Mobile/Desktop Contract Adoption): Apply the new shared library mutation contracts to mobile/desktop library write paths so all clients use one protected API contract surface.
- [x] Agent AV (Bookmark/Highlight Client Unification): Extend shared-client mutation coverage to bookmark/highlight write paths and migrate remaining client-local request builders.
- [x] Agent AW (Web Highlight Sync Rewire): Rewire web highlight sync hook to shared-client so web no longer builds direct highlight sync request payloads locally.
- [x] Agent AX (Cross-Client Bookmark Alignment): Finalize cross-client bookmark model alignment (structured verse bookmark fields vs text-only bookmark API contract) and migrate web bookmark context accordingly.
- [x] Agent AY (Shared Bookmark Reference Helpers): Extract bookmark reference parse/format helpers into `@zero1/shared` and adopt them across web/mobile so bookmark identity logic is guaranteed consistent cross-client.
- [x] Agent AZ (Mobile Bookmark Structured Input): Promote mobile bookmark creation UX from free-text entry to structured `book/chapter/verse` input backed by shared bookmark reference helpers.
- [x] Agent BA (Mobile Book Guidance + Bounds): Add mobile book picker + chapter/verse validation assistance (book list/autocomplete and per-book chapter bounds) to reduce reference entry errors before API submission.
- [x] Agent BB (Shared Bible Reference Adoption): Extract `apps/web/src/utils/bibleReference.ts` to consume the new shared Bible book metadata/resolution helpers so web + mobile use one canonical source.
- [x] Agent BC (Cross-Client Parity Tests): Add cross-client contract tests that assert web/mobile canonical book resolution parity for ambiguous and alias inputs.
- [x] Agent BD (Mobile Ambiguity Guidance): Surface explicit user-facing validation copy in mobile bookmark UI for ambiguous book prefixes (for example, recommend tap-to-select when multiple books match).
- [x] Agent BE (Mobile Suggestion-Tap Smoke): Add mobile bookmark UX smoke coverage for suggestion-tap flows (ambiguous prefix -> selection -> successful save).
- [x] Agent BF (BookmarkCreate Screen Tests): Add lightweight mobile screen-level test coverage for `BookmarkCreateScreen` guidance + suggestion chip rendering to lock UI behavior (beyond controller-only tests).
- [x] Agent BG (BookmarkCreate Chip-Mutation Test): Add UI-level test coverage for suggestion chip press wiring from `BookmarkCreateScreen` into controller callbacks with one focused mutation assertion.
- [x] Agent BH (BookmarkCreate Validation UI Tests): Add `BookmarkCreateScreen` UI tests for validation/error-state rendering (invalid book/chapter feedback and disabled/clear behavior guards).
- [x] Agent BI (BookmarkCreate Busy-State UI Tests): Add compact mobile UI tests for busy-state button labels/press guards (`Saving...`/disabled paths) in `BookmarkCreateScreen`.
- [x] Agent BJ (BookmarkCreate Chapter-Hint UI Tests): Add mobile UI tests for chapter-hint visibility transitions (known book vs unknown book) in `BookmarkCreateScreen`.
- [x] Agent BK (BookmarkCreate Guidance-Transition UI Tests): Add mobile UI tests for guidance callout visibility transitions (visible on ambiguity, hidden on canonical selection).
- [x] Agent BL (BookmarkCreate Suggestion-Visibility UI Tests): Add mobile UI tests for suggestion-chip list visibility transitions (present for ambiguous input, removed after canonical selection).
- [x] Agent BM (BookmarkCreate Canonical-Rerender UI Tests): Add mobile UI tests for canonical prefill state to ensure no ambiguity UI (guidance/suggestions) reappears unexpectedly on rerender.
- [x] Agent BN (BookmarkCreate Canonical-to-Ambiguous UI Tests): Add mobile UI tests for transition from canonical input back to ambiguous prefix to confirm ambiguity UI returns when expected.
- [x] Agent BO (BookmarkCreate Hint-Transition UI Tests): Add mobile UI tests for chapter-hint transition during canonical-to-ambiguous regression to ensure hint updates stay consistent with guidance/suggestions.
- [x] Agent BP (BookmarkCreate Roundtrip Transition UI Tests): Add mobile UI tests for full roundtrip transition (ambiguous -> canonical -> ambiguous) to confirm stable repeated toggling behavior.
- [ ] Agent BQ (Next, Manual): Run real iOS device performance profiling baseline (cold start, auth callback, bookmark save latency) and attach metrics evidence.

### Execution Notes (2026-02-19)

- `/api/library` and `/api/bookmarks` are now mounted with `requireAuth` in `apps/api/src/index.ts`.
- Library/bookmark route handlers now use `req.userId` and no longer accept `userId` from request body/query.
- Web library flow now uses authenticated fetch helper (`apps/web/src/lib/authFetch.ts`) and no longer sends `userId` query/body for library endpoints.
- Library/bookmark API routes now persist in Supabase (no file-backed JSON writes in runtime path):
  - `apps/api/src/routes/library.ts`
  - `apps/api/src/routes/bookmarks.ts`
- Supabase migration with tables, indexes, triggers, RLS, and policies added:
  - `apps/api/migrations/012_create_library_and_bookmarks.sql`
- One-time migration/backfill script and verification output added:
  - `apps/api/scripts/migrateJsonLibraryToSupabase.ts`
  - `apps/api/scripts/reports/libraryMigrationReport.json`
- Dry-run verification executed successfully via:
  - `npm --prefix apps/api run migrate:library:dry-run`
  - Optional fallback for legacy anonymous rows is supported via `--fallback-user-id=<uuid>` when running the script.
- Report currently indicates zero valid legacy rows for migration (existing JSON rows were not tied to valid UUID user IDs).
- Apply migration executed successfully via:
  - `npm --prefix apps/api run migrate:library:apply`
  - Result: `upsertedRows=0` across bookmarks/bundles/connections/maps because source records lacked valid UUID ownership.
  - Latest verification report: `apps/api/scripts/reports/libraryMigrationReport.json` (mode `apply`).
- Legacy files archived before owner-import attempt:
  - `apps/api/data/archive/20260219-063048/library_bundles.json`
  - `apps/api/data/archive/20260219-063048/library_connections.json`
  - `apps/api/data/archive/20260219-063048/library_maps.json`
- Owner-import rerun after DB migration succeeded:
  - Command: `npm --prefix apps/api run migrate:library:apply -- --fallback-user-id=71d5a027-3b38-401c-b0a5-57df44799ac3`
  - Result: `library_bundles upsertedRows=8` and `tableCounts.library_bundles=8`
  - Latest report: `apps/api/scripts/reports/libraryMigrationReport.json`
- Ownership spot-check passed (sample rows in `library_bundles` are owned by `71d5a027-3b38-401c-b0a5-57df44799ac3`).
- Legacy runtime JSON files removed from active data path:
  - `apps/api/data/library_bundles.json`
  - `apps/api/data/library_connections.json`
  - `apps/api/data/library_maps.json`
- Archived snapshots retained for rollback/reference:
  - `apps/api/data/archive/20260219-063048/*`
- DB client split implemented in API:
  - `supabaseAdmin` (privileged), `supabaseAuth` (token verification), `createUserSupabaseClient` (RLS-scoped)
  - File: `apps/api/src/db.ts`
- Auth middleware now propagates validated bearer token as `req.accessToken` for user-scoped DB access:
  - File: `apps/api/src/middleware/auth.ts`
- Sensitive user-data routes now use user-scoped Supabase clients (not admin client):
  - `apps/api/src/routes/bookmarks.ts`
  - `apps/api/src/routes/library.ts`
  - `apps/api/src/routes/highlights.ts`
- Removed `VITE_*` service-role fallback in API/server scripts:
  - `apps/api/src/env.ts`
  - `apps/api/scripts/run-migration.ts`
  - `apps/api/scripts/migrateJsonLibraryToSupabase.ts`
- API privileged client no longer falls back to anon key:
  - `apps/api/src/db.ts` now uses `SUPABASE_SERVICE_KEY` for `supabaseAdmin`
- Privileged-call audit completed (full API scope):
  - User-owned tables (`bookmarks`, `library_*`, `highlights`) are only accessed via `createUserSupabaseClient`
  - Non-user privileged writes are explicit and limited to `llm_connections` upserts:
    - `apps/api/src/routes/discover-connections.ts`
    - `apps/api/src/bible/expandingRingExegesis.ts`
- API CORS now uses env-configured allowlist instead of hardcoded localhost origins:
  - `apps/api/src/index.ts` uses `ENV.CORS_ALLOWED_ORIGINS` with runtime origin validation callback.
- Strict API env contract added:
  - `apps/api/src/env.ts` introduces `STRICT_ENV` (defaults true in production) and required-var validation.
  - Required in strict mode: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`.
  - Required in production strict mode: `CORS_ALLOWED_ORIGINS`.
- API-side `VITE_*` fallbacks fully removed for Supabase envs (URL/anon/service) to keep server/runtime contract explicit:
  - `apps/api/src/env.ts`
  - `apps/api/src/index.ts`
  - `apps/api/scripts/run-migration.ts`
  - `apps/api/scripts/migrateJsonLibraryToSupabase.ts`
- Deployment/env examples updated for new contract:
  - `apps/api/.env.example` now includes `NODE_ENV`, `STRICT_ENV`, `CORS_ALLOWED_ORIGINS`.
  - `render.yaml` now includes `STRICT_ENV=true` and required Supabase/CORS env keys.
- Frontend Sentry re-enabled for production web builds:
  - `apps/web/src/main.tsx` now initializes `@sentry/react` with production gating (`enabled` only when `VITE_SENTRY_DSN` is present in production).
- Deployment readiness runbook and executable API checks added:
  - `DEPLOYMENT_READINESS_RUNBOOK.md`
  - `apps/api/scripts/runReadinessChecks.js`
  - `apps/api/package.json` script: `readiness:check`
- Strict web env contract implemented and centralized:
  - New module: `apps/web/src/lib/env.ts` (`WEB_ENV`) with strict-mode validation (`VITE_STRICT_ENV`, default strict in production).
  - Web API callers now use centralized `WEB_ENV.API_URL` (no inline localhost fallback literals).
  - Web Supabase + Sentry wiring now read from `WEB_ENV`.
  - Typed web env surface added in `apps/web/src/vite-env.d.ts`.
  - Web env example updated with `VITE_STRICT_ENV` in `apps/web/.env.example`.
- Phase 0 local exit validation executed and passed:
  - `npm --prefix apps/api run phase0:exit:check` (health, DB health, CORS, protected route authz without/with invalid token)
  - `npm --prefix apps/api run readiness:check` against local API
  - `npm --prefix apps/api run rls:verify` (provisions two temporary users and verifies cross-user read/write isolation on `bookmarks` and `library_bundles`)
  - Added scripts:
    - `apps/api/scripts/runPhase0ExitValidation.js`
    - `apps/api/scripts/verifyRlsIsolation.js`
    - `apps/api/package.json` scripts `phase0:exit:check`, `rls:verify`
- Static exit audits passed:
  - No caller-supplied `userId` usage in protected library/bookmark/highlight routes (`req.body.userId` / `req.query.userId` absent).
  - Legacy JSON runtime files remain decommissioned in `apps/api/data`.
  - RLS + policies exist for `highlights`, `bookmarks`, `library_bundles`, `library_connections`, `library_maps` migrations.
- Deployed readiness probe attempted against `https://zero1-api.onrender.com` but failed health endpoints (`/health`, `/api/health/db` returned 404), indicating it is not the correct API deployment target for this repo.
- External gate validation completed (Agent O):
  - Confirmed deployed API URL: `https://biblelot-api.onrender.com`
  - `API_BASE_URL=https://biblelot-api.onrender.com npm --prefix apps/api run readiness:check` passed
    - API health: 200
    - DB health: 200
    - CORS preflight: 204
  - `API_BASE_URL=https://biblelot-api.onrender.com npm --prefix apps/api run phase0:exit:check` passed
    - Health endpoint pass
    - DB health endpoint pass
    - CORS preflight pass
    - Protected route authz checks pass (no auth + invalid token)
  - Note: an earlier 503 (`Health check in progress`) was a concurrency artifact from parallel probing and was resolved by sequential checks.
- Regression coverage automation completed (Agent P):
  - Added executable regression suite for critical auth protection on bookmarks/library/highlights:
    - `apps/api/scripts/runAuthRegressionCoverage.js`
    - `apps/api/package.json` script `test:regression`
  - Added CI enforcement:
    - `.github/workflows/ci.yml` now runs `npm --prefix apps/api run test:regression` after build.
  - Local validation passed:
    - `npm --prefix apps/api run build`
    - `npm --prefix apps/api run test:regression`
    - Probes passed for no-auth and invalid-token access attempts on:
      - `/api/bookmarks`
      - `/api/library/connections`
      - `/api/library/maps`
      - `/api/library/bundles` (POST)
      - `/api/highlights`
      - `/api/highlights/sync`
      - `/api/highlights/:id` (PUT/DELETE)
- Desktop foundation scaffold completed (Agent Q):
  - New workspace scaffolded:
    - `apps/desktop/package.json`
    - `apps/desktop/electron/main.ts`
    - `apps/desktop/electron/preload.ts`
    - `apps/desktop/src/App.tsx`
    - `apps/desktop/src/lib/env.ts`
    - `apps/desktop/src/lib/supabase.ts`
    - `apps/desktop/src/lib/authFetch.ts`
    - `apps/desktop/src/lib/apiClient.ts`
  - Root scripts added:
    - `package.json` scripts `dev:desktop`, `build:desktop`
  - Validation passed:
    - `npm --prefix apps/desktop run build`
  - Desktop renderer now supports:
    - Supabase auth session sign-in/sign-out in app shell
    - Auth-bearing API probe calls against `/api/bookmarks`, `/api/highlights`, `/api/library/connections`
- Desktop release plumbing completed (Agent R):
  - Packaging + release scripts added:
    - `apps/desktop/package.json` (`pack:win`, `dist:win`, `dist:win:publish`, `dist`)
    - `electron-builder` config now defines app id, NSIS target, artifact naming, and GitHub publish metadata.
  - Auto-update channel wiring added in desktop runtime:
    - `apps/desktop/electron/main.ts`
    - Runtime controls: `DESKTOP_AUTO_UPDATE_ENABLED`, `DESKTOP_UPDATE_CHANNEL`, optional `DESKTOP_UPDATE_FEED_URL`.
  - CI artifact pipeline added:
    - `.github/workflows/desktop-artifacts.yml`
    - Manual runs build Windows artifacts; `desktop-v*` tags publish release assets for updater consumption.
  - Release runbook added:
    - `apps/desktop/RELEASE.md`
  - Local validation passed:
    - `npm --prefix apps/desktop run dist:win`
    - Generated artifacts in `apps/desktop/release`:
      - `zero1-setup-0.1.0-x64.exe`
      - `zero1-setup-0.1.0-x64.exe.blockmap`
      - `latest.yml`
- Shared client boundary and cross-client view reuse completed (Agent S):
  - New shared package added:
    - `packages/shared-client/package.json`
    - `packages/shared-client/src/index.ts`
    - `packages/shared-client/src/auth/createSupabaseBrowserClient.ts`
    - `packages/shared-client/src/auth/createAuthFetch.ts`
    - `packages/shared-client/src/api/createProtectedApiClient.ts`
    - `packages/shared-client/src/ui/SharedAuthProbeView.tsx`
  - Web + desktop migrated to shared auth/API client primitives:
    - `apps/web/src/lib/supabase.ts`
    - `apps/web/src/lib/authFetch.ts`
    - `apps/desktop/src/lib/supabase.ts`
    - `apps/desktop/src/lib/authFetch.ts`
    - `apps/desktop/src/lib/apiClient.ts`
  - Shared feature view now consumed in both clients:
    - Desktop root app now uses `SharedAuthProbeView` in `apps/desktop/src/App.tsx`
    - Web route added at `/ops/shared-probe` via:
      - `apps/web/src/routes/SharedProbeRoute.tsx`
      - `apps/web/src/router.tsx`
  - Workspace wiring updated:
    - Root workspaces now include `packages/*` in `package.json`
    - Web + desktop depend on shared package via local file reference.
  - Validation passed:
    - `npm --prefix apps/desktop run typecheck`
    - `npm --prefix apps/desktop run build`
    - `npm --prefix apps/web run typecheck`
    - `npm --prefix apps/web run build`
- Desktop auth/session hardening completed (Agent T):
  - Magic-link fallback added in shared auth UX:
    - `packages/shared-client/src/ui/SharedAuthProbeView.tsx`
    - Supports `signInWithOtp` flow with optional redirect configuration.
  - Secure desktop session persistence bridge implemented:
    - `apps/desktop/electron/main.ts`
    - `apps/desktop/electron/preload.ts`
    - `apps/desktop/src/lib/desktopAuthStorage.ts`
    - Uses Electron `safeStorage` for OS-encrypted persisted auth values, with explicit opt-in plaintext fallback (`DESKTOP_ALLOW_PLAINTEXT_SESSION_FALLBACK=true`) only when needed.
  - Desktop Supabase auth wiring hardened for persisted/refreshable sessions:
    - `apps/desktop/src/lib/supabase.ts`
    - `packages/shared-client/src/auth/buildSupabaseAuthOptions.ts`
    - `packages/shared-client/src/auth/createSupabaseBrowserClient.ts`
  - Token refresh monitoring + tests added:
    - `packages/shared-client/src/auth/attachTokenRefreshObserver.ts`
    - `apps/desktop/tests/auth-session-hardening.test.ts`
    - `apps/desktop/package.json` script `test:auth-session`
    - `.github/workflows/ci.yml` now runs desktop auth/session tests.
  - Env contracts updated:
    - `apps/desktop/.env.example` (`VITE_MAGIC_LINK_REDIRECT_TO`, `DESKTOP_ALLOW_PLAINTEXT_SESSION_FALLBACK`)
    - `apps/web/.env.example` (`VITE_MAGIC_LINK_REDIRECT_TO`)
    - `apps/desktop/src/vite-env.d.ts`
    - `apps/web/src/vite-env.d.ts`
    - `apps/desktop/src/lib/env.ts`
    - `apps/web/src/lib/env.ts`
  - Validation passed:
    - `npm --prefix apps/desktop run test:auth-session` (4 tests passed)
    - `npm --prefix apps/desktop run build`
    - `npm --prefix apps/web run build`
- Desktop QA/release gate automation completed (Agent U):
  - Added automated Phase 1.3 scripts:
    - `apps/desktop/scripts/runDesktopSmokeSuite.js`
    - `apps/desktop/scripts/runPilotReleaseGate.js`
    - `apps/desktop/scripts/runRollbackRehearsal.js`
  - Added release QA docs:
    - `apps/desktop/PILOT_RELEASE_CHECKLIST.md`
    - `apps/desktop/ROLLBACK_PLAYBOOK.md`
  - Added package scripts:
    - `npm --prefix apps/desktop run phase1:smoke`
    - `npm --prefix apps/desktop run phase1:gate`
    - `npm --prefix apps/desktop run rollback:rehearsal`
  - CI coverage extended:
    - `.github/workflows/ci.yml` now runs `npm --prefix apps/desktop run phase1:smoke`.
  - Full release gate executed successfully:
    - `npm --prefix apps/desktop run phase1:gate`
    - Report: `apps/desktop/reports/pilotReleaseGate.json` (`passed: true`)
    - Smoke report: `apps/desktop/reports/smokeSuite.json` (required checks passed; authenticated API smoke skipped due missing smoke env credentials)
    - Rollback rehearsal report: `apps/desktop/reports/rollbackRehearsal.json` (`passed: true`)
    - Release artifacts validated: installer + blockmap + `latest.yml` in `apps/desktop/release`
- Credentialed pilot smoke execution attempted (Agent V) and identified production blocker:
  - Command:
    - `SMOKE_API_BASE_URL=https://biblelot-api.onrender.com npm --prefix apps/desktop run phase1:smoke:credentialed`
  - Report:
    - `apps/desktop/reports/credentialedPilotSmoke.json`
  - Result:
    - Temporary smoke user provisioning succeeded
    - `/api/bookmarks` passed (200)
    - `/api/library/connections` passed (200)
    - `/api/highlights` failed (500)
  - Root cause diagnosis:
    - Direct Supabase check with authenticated token returns `PGRST205` for `public.highlights` (table not available in schema cache to authenticated role).
  - Remediation prepared in repo:
    - `apps/api/migrations/013_fix_public_table_grants.sql` (adds grants + `NOTIFY pgrst, 'reload schema';`)
  - Applying migration via current script is blocked in this environment:
    - `npm --prefix apps/api run db:migrate -- --file=013_fix_public_table_grants.sql` failed because SQL execution RPCs (`execute_sql`/`exec`) are not present.
  - Pilot sign-off status:
    - `npm --prefix apps/desktop run phase1:signoff` currently blocked by failed credentialed smoke.
    - Report: `apps/desktop/reports/pilotSignoff.json` (`passed: false`)
- Production blocker resolved and credentialed pilot smoke passed (Agent W + Agent V):
  - Owner applied DB fix (Supabase SQL) and schema reload for missing `highlights` table/grants.
  - Credentialed smoke rerun passed against deployed API:
    - `SMOKE_API_BASE_URL=https://biblelot-api.onrender.com npm --prefix apps/desktop run phase1:smoke:credentialed`
    - Report: `apps/desktop/reports/credentialedPilotSmoke.json` (`passed: true`)
    - Endpoint checks:
      - `/api/bookmarks` -> 200
      - `/api/highlights` -> 200
      - `/api/library/connections` -> 200
  - Pilot sign-off finalized:
    - `PILOT_PRODUCT_SIGNOFF=approved npm --prefix apps/desktop run phase1:signoff`
    - Report: `apps/desktop/reports/pilotSignoff.json` (`passed: true`)
    - Engineering: approved
    - Product: approved
- Phase 1.3 manual validation completed (Agent X):
  - Added manual validation runner:
    - `apps/desktop/scripts/runPhase13ManualValidation.js`
    - Package script: `npm --prefix apps/desktop run phase1:manual-validation`
  - Added desktop crash diagnostics handlers/logging in runtime:
    - `apps/desktop/electron/main.ts`
    - `apps/desktop/electron/preload.ts`
    - `apps/desktop/src/vite-env.d.ts`
  - Validation executed successfully against local API runtime (fresh rate-limit window):
    - `SMOKE_API_BASE_URL=http://localhost:3001 LONG_SESSION_ITERATIONS=30 LONG_SESSION_DELAY_MS=700 npm --prefix apps/desktop run phase1:manual-validation`
    - Report: `apps/desktop/reports/phase13ManualValidation.json` (`passed: true`)
    - Covered checks:
      - onboarding/auth smoke (temp user create/sign-in)
      - chat smoke (`/api/chat`)
      - map smoke (`/api/trace`)
      - long-session stability loop (30 iterations, no failures)
      - crash diagnostics handler presence verification
  - Note: production `/api/*` rate-limiter state can cause transient `429` during repeated smoke probes, so deep loop validation was executed on a fresh local API instance.
- Pilot cohort telemetry execution started (Agent Y):
  - Added cohort runner:
    - `apps/desktop/scripts/runPilotCohortSessions.js`
    - Package script: `npm --prefix apps/desktop run phase1:cohort`
  - Added pilot runbook + feedback intake template:
    - `apps/desktop/PILOT_COHORT_RUNBOOK.md`
    - `apps/desktop/reports/pilotFeedbackTemplate.json`
  - Executed cohort telemetry on deployed API:
    - `SMOKE_API_BASE_URL=https://biblelot-api.onrender.com PILOT_COHORT_SIZE=3 npm --prefix apps/desktop run phase1:cohort`
    - Report: `apps/desktop/reports/pilotCohortTelemetry.json` (`passed: true`)
    - Core flow endpoint success in all 3 sessions:
      - `/api/bookmarks` 3/3
      - `/api/highlights` 3/3
      - `/api/library/connections` 3/3
      - `/api/chat` 3/3
      - `/api/trace` 3/3
  - Pending for Agent Y completion:
    - Real pilot user install sessions (human-run desktop app installs)
    - Collected user feedback files and attached diagnostics logs per runbook
- Phase 1 pilot feedback triage + exit check status (2026-02-20):
  - Ran:
    - `npm --prefix apps/desktop run phase1:feedback-triage`
    - `npm --prefix apps/desktop run phase1:exit-check`
  - Results:
    - `apps/desktop/reports/pilotFeedbackTriage.json` -> `passed: false`
    - `apps/desktop/reports/phase1ExitCheck.json` -> `passed: false`
  - Current blocker:
    - `pilotFeedbackTriage` has `totalFeedbackFiles=0` and `validFeedbackFiles=0` (minimum required: 3).
    - All other Phase 1 report gates are currently passing.
- Agent Z intake acceleration (2026-02-20):
  - Added guided feedback intake command to reduce manual formatting errors and collect diagnostics evidence consistently:
    - `apps/desktop/scripts/runPilotFeedbackWizard.js`
    - `apps/desktop/package.json` script: `phase1:feedback:wizard`
  - Runbook updated with wizard-first workflow:
    - `apps/desktop/PILOT_COHORT_RUNBOOK.md`
  - Remaining blocker is unchanged:
    - Need >=3 real pilot feedback files from human pilot sessions.
- Desktop full-app shell runtime update (2026-02-20):
  - Attempted direct source import of `apps/web` renderer into `apps/desktop` was rejected due incompatible TypeScript strictness/type surface between workspaces.
  - Implemented stable fallback: Electron now supports loading a full web client URL via `DESKTOP_WEB_APP_URL`.
  - Desktop dev flow now launches full app shell automatically:
    - `apps/desktop/package.json` `dev` now runs web dev (`../web`, port `5173`) + electron main watcher + electron runtime.
    - `apps/desktop/electron/main.ts` loads `DESKTOP_WEB_APP_URL` when set (before local probe renderer fallback).
  - Env/docs updated:
    - `apps/desktop/.env.example` adds `DESKTOP_WEB_APP_URL` guidance.
  - Electron cache/userData hardening for Windows dev stability:
    - `apps/desktop/electron/main.ts` now isolates dev `userData` at `%APPDATA%/zero1-desktop-dev` (or `DESKTOP_USER_DATA_DIR` override) and uses a dedicated `sessionData` subdirectory.
    - Prevents cache/quota lock collisions observed under `%APPDATA%/Electron`.
- Phase 1 pilot feedback + exit closure (2026-02-21):
  - Pilot feedback validation now passes:
    - `npm --prefix apps/desktop run phase1:feedback-triage`
    - Report: `apps/desktop/reports/pilotFeedbackTriage.json` (`passed: true`)
  - Phase 1 exit check passes after sequential rerun (avoiding parallel race against report write):
    - `npm --prefix apps/desktop run phase1:exit-check`
    - Report: `apps/desktop/reports/phase1ExitCheck.json` (`passed: true`)
  - Result: all automated Phase 1 report gates are now green.
- Phase 2.1 mobile foundation scaffold completed (Agent AA):
  - Added Expo + React Native + TypeScript app scaffold:
    - `apps/mobile/package.json`
    - `apps/mobile/app.json`
    - `apps/mobile/App.tsx`
    - `apps/mobile/index.ts`
  - Added mobile env contract + Supabase auth foundation:
    - `apps/mobile/.env.example`
    - `apps/mobile/src/lib/env.ts`
    - `apps/mobile/src/lib/supabase.ts`
    - `apps/mobile/src/lib/api.ts`
  - Added mobile auth rollout plan:
    - `apps/mobile/MOBILE_AUTH_WIRING_PLAN.md`
  - Monorepo commands added:
    - root `package.json` scripts `dev:mobile` and `typecheck:mobile`
  - Lint coverage extended to mobile workspace:
    - `eslint.config.js`
- Phase 2.2 mobile auth code plumbing completed (Agent AB):
  - Added Supabase OAuth launch flows (Google + Apple) in mobile auth shell:
    - `apps/mobile/App.tsx`
  - Added deep-link callback parsing + Supabase session/code exchange helper:
    - `apps/mobile/src/lib/authRedirect.ts`
  - Mobile runtime now listens for auth callback URLs and completes session restoration from callback payloads.
  - Added provider feature flags to mobile env contract:
    - `EXPO_PUBLIC_ENABLE_GOOGLE_OAUTH`
    - `EXPO_PUBLIC_ENABLE_APPLE_OAUTH`
    - Files:
      - `apps/mobile/src/lib/env.ts`
      - `apps/mobile/.env.example`
  - Notes:
    - Uses React Native `Linking.openURL` for browser handoff now (no extra SDK dependency required).
    - End-to-end provider validation remains pending external dashboard setup/Apple account approval.
- Mobile dev-client OAuth testing setup completed (Agent AD):
  - Installed `expo-dev-client` in `apps/mobile`.
  - Added Expo dev-client plugin config:
    - `apps/mobile/app.json`
  - Added EAS build profiles for development/preview/production:
    - `apps/mobile/eas.json`
  - Added mobile scripts:
    - `npm --prefix apps/mobile run start:dev-client`
    - `npm --prefix apps/mobile run eas:login`
    - `npm --prefix apps/mobile run eas:init`
    - `npm --prefix apps/mobile run eas:build:ios:dev`
    - `npm --prefix apps/mobile run eas:build:ios:preview`
  - Added test runbook for native OAuth callback validation:
    - `apps/mobile/DEV_CLIENT_OAUTH_TESTING.md`
  - Follow-up hardening:
    - EAS scripts now use `npx eas-cli` (no global EAS CLI install required).
    - Runbook now includes both Google and Apple native callback test flows.
- Provider dashboard configuration validated server-side (Agent AC):
  - Google provider enabled in Supabase with client ID + client secret (provider launch no longer returns `unsupported provider` / `missing OAuth secret`).
  - Apple provider enabled in Supabase with Apple client secret JWT (accepted by Supabase) and Services ID callback/domain corrected in Apple Developer.
  - Supabase Auth logs confirm Apple callback completion and user creation:
    - `provider=apple` login event emitted
    - `/callback` returned `302`
    - `user_signedup` event recorded for Apple auth user
  - Remaining gap is client-side/native callback completion verification in iOS dev client (web preview remains an invalid test target for `zero1://auth/callback`).
- Native iOS dev-client callback/session validation completed (Agent AE):
  - iOS development build installed and connected to Metro in dev-client mode.
  - Google sign-in returns to app and session state becomes active.
  - Apple sign-in returns to app and session state becomes active.
  - Protected API probe executed successfully after native provider sign-in validation (user-confirmed).
  - Expo runtime warnings observed during validation are non-blocking for auth gate:
    - manifest assets resolution warnings
    - `SafeAreaView` deprecation warning
    - WebCrypto unsupported warning (Supabase PKCE fallback to plain in runtime)
- Mobile navigation/tokens/first feature route completed (Agent AF):
  - Replaced auth-shell-only post-login view with an authenticated mobile app shell in `apps/mobile/App.tsx`
    - bottom-tab navigation (`Home`, `Library`, `Account`)
    - mobile-first layout and branded tokenized styling
  - Added shared mobile design tokens:
    - `apps/mobile/src/theme/tokens.ts`
  - Added real mobile feature route backed by existing API:
    - `Library` tab fetches and renders authenticated `/api/library/connections` data
    - API client normalization added in `apps/mobile/src/lib/api.ts`
  - Auth shell and provider sign-in flows remain available and integrated with the new shell.
- Mobile feature-route expansion completed (Agent AG):
  - Expanded mobile navigation shell in `apps/mobile/App.tsx` with additional authenticated tabs:
    - `Bookmarks`
    - `Highlights`
  - Added mobile API fetch/normalization helpers in `apps/mobile/src/lib/api.ts` for:
    - authenticated `/api/bookmarks` reads
    - authenticated `/api/highlights` reads
  - Added tab-level loading/error/refresh state and home quick actions to jump into the new routes.
  - Updated mobile tab token model in `apps/mobile/src/theme/tokens.ts` to support the expanded route set.
  - Result: authenticated mobile shell now exposes core read paths for library connections, bookmarks, and highlights.
- Mobile interaction flows completed (Agent AH):
  - Added mobile write-path helpers in `apps/mobile/src/lib/api.ts` for:
    - bookmarks create/delete
    - highlights create (via sync endpoint), update, and delete
  - Expanded `apps/mobile/App.tsx` bookmark tab from read-only list to interactive flow:
    - create bookmark form
    - selectable bookmark detail panel
    - delete action
    - pull-to-refresh list sync
  - Expanded `apps/mobile/App.tsx` highlights tab with task-complete interaction flow:
    - create highlight form (book/chapter/verses/text/color/note)
    - selectable highlight detail/edit panel (color + note)
    - delete action
    - pull-to-refresh list sync
  - Home/account shell remains intact while mobile write-path validation now happens inside the authenticated app shell.
- Mobile route-based shell completed (Agent AI):
  - Added an app detail-route layer in `apps/mobile/App.tsx` for bookmark/highlight create/detail screens.
  - Migrated inline bookmark/highlight forms and detail panels out of tab list screens into routed screens with back navigation.
  - Introduced explicit auth/app flow rendering split (`renderAuthFlow` / `renderAppFlow`) to separate unauthenticated and authenticated shells.
  - Tab bar now hides while routed detail/create screens are active, giving mobile flows a stack-style interaction pattern without changing native dependencies.
- Mobile React Navigation stack completed (Agent AJ):
  - Added React Navigation dependencies and native entrypoint integration (`react-native-gesture-handler`) for Expo mobile.
  - Added extracted navigator module:
    - `apps/mobile/src/navigation/MobileRootNavigator.tsx`
    - auth/app split using native stack + bottom tabs
    - detail routes for bookmark/highlight create/detail screens
  - Removed manual tab/detail route state from `apps/mobile/App.tsx`; navigation is now driven by React Navigation callbacks and stack routes.
  - Existing mobile screen renderers and write-path flows remain functional while routing is handled by the navigator module.
- Mobile screen/controller modularization completed (Agent AK):
  - Added extracted mobile controller hook:
    - `apps/mobile/src/hooks/useMobileAppController.ts`
    - centralizes auth/session state, API data loading, and bookmark/highlight write actions.
  - Added extracted mobile screen modules:
    - `apps/mobile/src/screens/AuthHomeAccountScreens.tsx`
    - `apps/mobile/src/screens/DataListScreens.tsx`
    - `apps/mobile/src/screens/DetailScreens.tsx`
    - `apps/mobile/src/screens/common/EntityCards.tsx`
  - Added extracted mobile style module:
    - `apps/mobile/src/theme/mobileStyles.ts`
  - Refactored `apps/mobile/App.tsx` into a thin composition root that wires:
    - `useMobileAppController`
    - `MobileRootNavigator`
    - extracted screen modules.
  - Result: mobile surface area is now organized by responsibility (navigation, controller, screens, shared styling) instead of a monolithic single file.
- Mobile context + test gate completed (Agent AL):
  - Added dedicated context provider/hook for shared mobile controller access:
    - `apps/mobile/src/context/MobileAppContext.tsx`
  - Updated mobile screens to consume shared controller state/actions via context instead of passing controller through screen props:
    - `apps/mobile/src/screens/AuthHomeAccountScreens.tsx`
    - `apps/mobile/src/screens/DataListScreens.tsx`
    - `apps/mobile/src/screens/DetailScreens.tsx`
  - Kept `apps/mobile/App.tsx` as a thin composition root and wrapped navigator in `MobileAppProvider`.
  - Added focused mobile tests and runner:
    - `apps/mobile/jest.config.cjs`
    - `apps/mobile/jest.setup.ts`
    - `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx` (controller actions)
    - `apps/mobile/src/navigation/__tests__/MobileRootNavigator.routes.test.ts` (auth/app route split + detail route config)
    - `apps/mobile/package.json` script: `npm --prefix apps/mobile run test`
- Mobile CI gate completed (Agent AM):
  - Updated GitHub Actions CI trigger scope to `biblelot` branch push/PR events:
    - `.github/workflows/ci.yml`
  - Added explicit mobile quality steps to CI:
    - `npm run lint`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
  - Result: the mobile quality gate now runs in branch CI for `biblelot` merge flow.
- Branch protection configured for `biblelot`:
  - Required status check set to `node-lint-build` before merge.
  - Smoke PR validation confirms policy enforcement (PR blocked until review requirement is satisfied for current ruleset).
  - Ruleset context corrected from `CI / node-lint-build` to `node-lint-build` and smoke PR merged successfully:
    - PR: `https://github.com/KingofSalem33/zero1/pull/1`
    - Merge commit on `biblelot`: `dcd1fcc87f605c41e21d9a78887443a5d420452f`
- Mobile Phase 2.1 core-feature validation completed (Agent AP):
  - Added executable mobile validation gate:
    - `apps/mobile/scripts/runPhase21CoreFeatureValidation.mjs`
    - `apps/mobile/package.json` script `phase2:core-validation`
  - Expanded controller test coverage for essential write-path flows:
    - bookmark create + delete
    - highlight create + update + delete
    - File: `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx`
  - Executed validation:
    - `npm --prefix apps/mobile run phase2:core-validation`
    - Report: `apps/mobile/reports/phase21CoreFeatureValidation.json` (`passed: true`)
- Phase 2.3 shared-logic extraction kickoff completed (Agent AQ):
  - Added new shared workspace package for cross-client domain contracts:
    - `packages/shared/package.json`
    - `packages/shared/src/contracts/contentContracts.ts`
    - `packages/shared/src/index.ts`
  - Migrated first shared contracts with runtime schema validation + normalizers:
    - `Bookmark`, `Highlight`, `LibraryConnection`
    - Shared parsers for `/api/bookmarks`, `/api/highlights`, `/api/library/connections`
  - Rewired client code to consume shared contracts:
    - `packages/shared-client/src/api/createProtectedApiClient.ts`
    - `apps/mobile/src/lib/api.ts`
    - workspace deps in `packages/shared-client/package.json` and `apps/mobile/package.json`
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run phase2:core-validation`
    - `npm --prefix apps/desktop run typecheck`
- Phase 2.3 shared-contract expansion + schema stability tests completed (Agent AR):
  - Expanded `@zero1/shared` contracts with additional API payload shapes:
    - library maps (`parseLibraryMapsResponse`, `normalizeLibraryMap`, `LibraryMap`)
    - library bundle creation response (`parseLibraryBundleCreateResponse`, `LibraryBundleCreateResult`)
    - auth/session summary payload (`buildAuthSessionPayload`, `AuthSessionPayload`)
  - Rewired additional cross-client consumers:
    - `packages/shared-client/src/api/createProtectedApiClient.ts` now uses shared map/bundle parsers
    - `packages/shared-client/src/ui/SharedAuthProbeView.tsx` now builds auth/session status through shared contract helper
    - `apps/mobile/src/lib/api.ts` now consumes shared map/bundle parsers and exposes map/bundle client methods
  - Added API contract tests for shared schema stability:
    - `apps/mobile/src/lib/__tests__/sharedContracts.apiShapes.test.ts`
    - Covers bookmarks/highlights/connections/maps/bundle-create response normalization and auth/session payload building.
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run phase2:core-validation`
    - `npm --prefix apps/desktop run typecheck`
    - `npm run build`
- Phase 2.3 web library domain rewire completed (Agent AS):
  - Added shared web library API adapters using shared parsers:
    - `apps/web/src/lib/libraryApi.ts`
  - Reduced duplicate web API-shape parsing and aligned web components to shared contracts:
    - `apps/web/src/components/BookmarkPanel.tsx`
    - `apps/web/src/components/LibraryView.tsx`
  - Extended shared contracts + shared-client surface to support additional map/bundle/auth payloads used by web/desktop/mobile:
    - `packages/shared/src/contracts/contentContracts.ts`
    - `packages/shared/src/contracts/authContracts.ts`
    - `packages/shared/src/index.ts`
    - `packages/shared-client/src/api/createProtectedApiClient.ts`
    - `packages/shared-client/src/ui/SharedAuthProbeView.tsx`
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/web run typecheck`
    - `npm --prefix apps/desktop run typecheck`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run phase2:core-validation`
    - `npm run build`
- Phase 2.3 web mutation/request contract migration completed (Agent AT):
  - Added shared library mutation payload/result contracts and session/bundle helpers:
    - `packages/shared/src/contracts/contentContracts.ts`
    - `packages/shared/src/index.ts`
  - Extended shared protected API client with library mutation methods using shared builders/parsers:
    - `packages/shared-client/src/api/createProtectedApiClient.ts`
    - `packages/shared-client/src/index.ts`
  - Rewired web library mutation call sites to the shared contract surface (removed direct `/api/library/*` request construction from web components):
    - `apps/web/src/lib/libraryApi.ts`
    - `apps/web/src/components/LibraryView.tsx`
    - `apps/web/src/components/BookmarkPanel.tsx`
    - `apps/web/src/components/golden-thread/NarrativeMap.tsx`
    - `apps/web/src/components/golden-thread/SemanticConnectionModal.tsx`
  - Expanded shared contract tests to cover mutation parsing/session payload builders:
    - `apps/mobile/src/lib/__tests__/sharedContracts.apiShapes.test.ts`
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/web run typecheck`
    - `npm --prefix apps/desktop run typecheck`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run phase2:core-validation`
    - `npm run build`
- Phase 2.3 mobile/desktop contract adoption completed (Agent AU):
  - Mobile library API bridge now uses the shared protected API client for library reads and write-capable methods (bundle/map/connection create/update/delete):
    - `apps/mobile/src/lib/api.ts`
  - Desktop contract surface audit completed:
    - Desktop app routes all protected API probes through `SharedAuthProbeView` + `createProtectedApiClient` and currently has no separate direct library mutation path to migrate.
    - Files:
      - `apps/desktop/src/App.tsx`
      - `packages/shared-client/src/ui/SharedAuthProbeView.tsx`
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run phase2:core-validation`
    - `npm --prefix apps/desktop run typecheck`
    - `npm run build`
- Phase 2.3 bookmark/highlight client unification completed (Agent AV):
  - Expanded shared contracts for bookmark/highlight mutation request+response handling:
    - `packages/shared/src/contracts/contentContracts.ts`
    - `packages/shared/src/index.ts`
  - Extended shared protected API client with bookmark/highlight mutation methods:
    - `packages/shared-client/src/api/createProtectedApiClient.ts`
    - `packages/shared-client/src/index.ts`
  - Migrated mobile bookmark/highlight flows (read + write paths) to use shared protected API client wrappers:
    - `apps/mobile/src/lib/api.ts`
  - Extended shared contract tests for bookmark/highlight builders + mutation parsers:
    - `apps/mobile/src/lib/__tests__/sharedContracts.apiShapes.test.ts`
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run phase2:core-validation`
    - `npm --prefix apps/desktop run typecheck`
    - `npm run build`
- Phase 2.3 web highlight sync rewire completed (Agent AW):
  - Web highlight sync hook now uses shared protected API client methods for pull/push sync, removing direct `fetch` payload construction for `/api/highlights` and `/api/highlights/sync`:
    - `apps/web/src/hooks/useHighlightsSync.ts`
  - Shared contract utilities reused for highlight reference-label normalization in sync conversion path.
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/web run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm run build`
- Phase 2.3 cross-client bookmark model alignment completed (Agent AX):
  - Web bookmark context now bridges structured verse bookmark fields (`book/chapter/verse`) to the API bookmark contract (`text`) with deterministic format/parse helpers:
    - `apps/web/src/contexts/BibleBookmarksContext.tsx`
  - Web bookmark context now reads/writes authenticated bookmark data through shared protected API client methods for create/delete/read:
    - `apps/web/src/contexts/BibleBookmarksContext.tsx`
  - Auth transition handling hardened:
    - On sign-in: pull canonical bookmark state from API.
    - On sign-out: restore local bookmark state fallback.
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/web run typecheck`
    - `npm run build`
- Phase 2.3 shared bookmark reference helper adoption completed (Agent AY):
  - Shared bookmark reference helper utilities added to `@zero1/shared` and exported for cross-client reuse:
    - `packages/shared/src/contracts/contentContracts.ts`
    - `packages/shared/src/index.ts`
  - Web bookmark context now uses shared bookmark parse/format helpers instead of local regex implementations:
    - `apps/web/src/contexts/BibleBookmarksContext.tsx`
  - Mobile bookmark create flow now normalizes parseable verse references through shared helpers before API create calls:
    - `apps/mobile/src/hooks/useMobileAppController.ts`
  - Contract + controller tests expanded for helper behavior and mobile normalization:
    - `apps/mobile/src/lib/__tests__/sharedContracts.apiShapes.test.ts`
    - `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx`
  - Validation passed:
    - `npm run lint`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm run build`
- Phase 2.3 mobile bookmark structured-input UX completed (Agent AZ):
  - Mobile bookmark create flow migrated from free-text input to structured draft fields (`book/chapter/verse`) in controller state:
    - `apps/mobile/src/hooks/useMobileAppController.ts`
  - Bookmark create route now renders explicit structured inputs and clear/reset behavior for those fields:
    - `apps/mobile/src/screens/DetailScreens.tsx`
  - Controller tests updated for structured bookmark draft mutation + submission path:
    - `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 mobile bookmark guidance + bounds completed (Agent BA):
  - Added shared Bible book metadata/resolution/suggestion helpers (book list, chapter counts, alias resolution, and suggestions):
    - `packages/shared/src/bible/bookReference.ts`
    - `packages/shared/src/index.ts`
  - Mobile bookmark controller now provides:
    - canonical book validation via shared resolver
    - per-book chapter-bound checks before submit
    - book suggestion list + chapter hint for UI consumption
    - files:
      - `apps/mobile/src/hooks/useMobileAppController.ts`
  - Mobile bookmark create screen now shows book suggestion chips and chapter-bound hint:
    - `apps/mobile/src/screens/DetailScreens.tsx`
    - `apps/mobile/src/theme/mobileStyles.ts`
  - Tests expanded for chapter bound validation and shared book helper behavior:
    - `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx`
    - `apps/mobile/src/lib/__tests__/sharedContracts.apiShapes.test.ts`
  - Validation passed:
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 shared Bible reference adoption completed (Agent BB):
  - Web Bible reference utilities now consume shared canonical metadata and resolver helpers from `@zero1/shared`:
    - `apps/web/src/utils/bibleReference.ts`
  - Shared source of truth for books/chapter counts/resolution now drives both mobile and web bookmark/reference flows:
    - `packages/shared/src/bible/bookReference.ts`
  - Validation passed:
    - `npm --prefix apps/web run typecheck`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/mobile run test`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 cross-client Bible resolution parity tests completed (Agent BC):
  - Added parity test coverage that compares web resolver output with shared resolver output for canonical, alias, and ambiguous-prefix inputs:
    - `apps/mobile/src/lib/__tests__/bibleReferenceParity.test.ts`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
- Phase 2.3 mobile ambiguity guidance completed (Agent BD):
  - Mobile controller now exposes explicit book-input guidance messaging for empty, ambiguous, single-suggestion, and invalid states:
    - `apps/mobile/src/hooks/useMobileAppController.ts`
  - Bookmark create screen now surfaces the guidance copy in a muted callout directly under book/chapter fields:
    - `apps/mobile/src/screens/DetailScreens.tsx`
  - Controller tests expanded to assert ambiguity guidance behavior:
    - `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 mobile suggestion-tap smoke coverage completed (Agent BE):
  - Added controller smoke test that covers end-to-end bookmark suggestion flow:
    - ambiguous book input (`jo`) -> suggestion list shown -> suggestion selected (`John`) -> successful bookmark save.
    - `apps/mobile/src/hooks/__tests__/useMobileAppController.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate screen-level coverage completed (Agent BF):
  - Added screen-level tests for `BookmarkCreateScreen` to verify:
    - ambiguity guidance text renders when provided by controller
    - suggestion chips render from controller suggestion list
    - suggestion chip press invokes controller selection callback
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate chip-mutation coverage completed (Agent BG):
  - Added UI-level test that verifies:
    - suggestion chip press mutates displayed book field value on the screen test harness
    - save button path remains callable after suggestion selection
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate validation/error UI coverage completed (Agent BH):
  - Added screen-level tests to verify:
    - validation error text renders when controller exposes `bookmarkMutationError`
    - clear action is blocked when draft fields are all empty (disabled guard path)
    - clear action triggers expected draft reset payload when fields are populated
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate busy-state UI coverage completed (Agent BI):
  - Added screen-level tests to verify:
    - save button label changes to `Saving...` during busy mutation state
    - save/clear press handlers are blocked while busy/disabled
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate chapter-hint UI coverage completed (Agent BJ):
  - Added screen-level tests that verify chapter-hint behavior:
    - hint renders when controller provides recognized-book chapter range
    - hint is hidden when controller indicates unknown/unresolved book
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate guidance-transition UI coverage completed (Agent BK):
  - Added screen-level tests that verify guidance callout behavior:
    - guidance callout is visible during ambiguous-input state
    - guidance callout is removed after suggestion selection resolves to canonical book
    - guidance callout stays hidden when controller state is already canonical
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate suggestion-visibility UI coverage completed (Agent BL):
  - Added screen-level tests that verify suggestion chip behavior:
    - chip list is present in ambiguous-input state
    - chip list is removed after selection resolves book input to canonical value
    - chip list remains hidden when controller state starts canonical
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate canonical-rerender UI coverage completed (Agent BM):
  - Added screen-level rerender test coverage that verifies:
    - ambiguity guidance and suggestion chips remain hidden when state starts canonical
    - ambiguity UI does not reappear after controller rerender with canonical field updates
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate canonical-to-ambiguous transition coverage completed (Agent BN):
  - Added screen-level rerender test coverage that verifies:
    - ambiguity guidance and suggestion chips are hidden in canonical prefill state
    - ambiguity UI returns when user input regresses from canonical book to ambiguous prefix
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate chapter-hint transition coverage completed (Agent BO):
  - Added screen-level transition test coverage that verifies:
    - chapter hint updates from canonical range to ambiguous-input range on regression
    - guidance callout and suggestion chips appear in sync with updated hint state
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Phase 2.3 BookmarkCreate roundtrip transition coverage completed (Agent BP):
  - Added screen-level roundtrip transition test coverage that verifies:
    - ambiguity UI appears for ambiguous input, clears on canonical selection, and reappears on ambiguous regression
    - chapter hint remains consistent across repeated ambiguous/canonical state toggles
  - File:
    - `apps/mobile/src/screens/__tests__/BookmarkCreateScreen.test.tsx`
  - Validation passed:
    - `npm --prefix apps/mobile run test`
    - `npm --prefix apps/mobile run typecheck`
    - `npm --prefix apps/web run typecheck`
    - `npm run lint`
    - `npm run build`
- Verification passed:
  - `npm --prefix apps/api run build`
  - `npm --prefix apps/web run typecheck`
  - `npm --prefix apps/web run build`

## 1) Launch Objective

Ship a production-ready platform with:

- One backend source of truth (Supabase + API)
- One user identity across clients
- Stable desktop release first
- Premium iOS release next

## 2) Non-Negotiable Launch Standards

- No client-controlled user identity for persisted user data
- RLS enforced for all user-owned tables
- Service role key never exposed to clients
- Production observability enabled (errors, performance, critical funnels)
- Documented rollback paths before each public release

## 3) Current State Snapshot (Repo-Aligned)

- Monorepo currently has `apps/api` and `apps/web`
- Monorepo now includes an initial `apps/desktop` Electron+React scaffold
- Supabase auth exists in web (`apps/web/src/contexts/AuthContext.tsx`)
- Highlights already use Supabase table + RLS (`apps/api/migrations/011_create_highlights.sql`)
- Library/bookmarks still rely on file-backed JSON and `anonymous` defaults
  - `apps/api/src/routes/library.ts`
  - `apps/api/src/routes/bookmarks.ts`
- Multiple web flows still pass `userId="anonymous"`:
  - `apps/web/src/routes/LibraryRoute.tsx`
  - `apps/web/src/components/UnifiedWorkspace.tsx`
  - `apps/web/src/components/LibraryView.tsx`
- Monorepo now includes initial `apps/mobile` Expo + TypeScript scaffold with Supabase auth shell

## 4) Phase Plan

## Phase 0: Identity + Data Hardening (Blocker Phase)

Target: 2-3 weeks
Exit gate: all persisted user data is account-bound and RLS-protected.

### 0.1 Identity Unification

- [x] Remove `anonymous` fallback from API payload contracts where data is persisted (library/bookmarks scope)
- [x] Stop accepting user identity from body/query for protected resources (library/bookmarks scope)
- [x] Use auth token derived identity (`req.userId`) everywhere (library/bookmarks scope)
- [x] Convert sensitive routes from `optionalAuth` to `requireAuth` (library/bookmarks scope)

Primary files:

- `apps/api/src/index.ts`
- `apps/api/src/middleware/auth.ts`
- `apps/api/src/routes/library.ts`
- `apps/api/src/routes/bookmarks.ts`
- `apps/api/src/ai/schemas.ts`
- `apps/web/src/components/UnifiedWorkspace.tsx`
- `apps/web/src/routes/LibraryRoute.tsx`

### 0.2 Data Layer Migration (JSON -> Supabase)

- [x] Add migrations for:
  - `bookmarks`
  - `library_bundles`
  - `library_connections`
  - `library_maps`
  - (optional now, likely needed soon) `uploaded_files`, `chat_memory`
- [x] Enable RLS for each table (bookmarks + library scope)
- [x] Add policies scoped to `auth.uid()` (bookmarks + library scope)
- [x] Replace file I/O repositories with Supabase repositories (bookmarks + library scope)
- [x] Create one-time migration script from `data/*.json`
- [x] Validate migrated row counts and sample integrity (dry-run report generated)

Primary files:

- `apps/api/migrations/*`
- `apps/api/src/routes/library.ts`
- `apps/api/src/routes/bookmarks.ts`
- `apps/api/src/db.ts`
- `apps/api/scripts/*` (new migration scripts)

### 0.3 Key Handling + Access Model

- [x] Split DB clients in API:
  - user-context client (RLS-respecting)
  - privileged client (service role, server-only workflows)
- [x] Audit all routes/scripts for accidental privileged reads/writes (full API scope; user-data tables verified user-scoped)
- [x] Ensure no `VITE_*` service-role leakage patterns remain in runtime config

Primary files:

- `apps/api/src/db.ts`
- `apps/api/src/env.ts`
- `apps/api/scripts/run-migration.ts`
- `apps/api/scripts/migrateJsonLibraryToSupabase.ts`
- `.github/workflows/ci.yml`

### 0.4 Production Readiness Baseline

- [x] Replace localhost-only CORS with env-configured allowed origins (API)
- [x] Define strict env var contract for API
- [x] Define strict env var contract for Web
- [x] Re-enable frontend Sentry initialization for production
- [x] Add health/readiness docs + runbook checks

Primary files:

- `apps/api/src/index.ts`
- `apps/api/src/env.ts`
- `apps/api/.env.example`
- `apps/web/src/main.tsx`
- `apps/web/src/lib/env.ts`
- `apps/web/src/vite-env.d.ts`
- `apps/web/.env.example`
- `apps/api/scripts/runReadinessChecks.js`
- `DEPLOYMENT_READINESS_RUNBOOK.md`
- `render.yaml`
- `vercel.json`

### Phase 0 Exit Criteria

- [x] No user-data endpoint depends on caller-supplied `userId`
- [x] No persisted user data stored in local JSON files in production path
- [x] RLS exists for all user-owned tables
- [x] Authenticated user can only read/write own records
- [x] Regression tests pass

---

## Phase 1: Desktop MVP Release (Shipping Vehicle)

Target: 2-4 weeks after Phase 0
Exit gate: signed production desktop build deployed to pilot users.

### 1.1 Desktop App Foundation

- [x] Add `apps/desktop` (Electron + React + TypeScript)
- [x] Reuse current web UI where practical
- [x] Add build/sign pipeline for target OSes (start with primary OS)
- [x] Add auto-update strategy (required for fast iteration)

### 1.2 Desktop Auth + Session

- [x] Supabase Auth with anon key only in desktop client
- [x] Add login UX (email/password first, magic link optional)
- [x] Ensure secure local session storage
- [x] Ensure auth token attached to API calls where needed

### 1.3 Desktop QA + Release

- [x] Smoke test: onboarding, auth, highlights, library, chat, map
- [x] Stability test under long sessions
- [x] Crash logging and release diagnostics enabled
- [x] Pilot rollout and rollback package ready

### Phase 1 Exit Criteria

- [x] Desktop pilot users can install, login, and use core features end-to-end
- [x] User data syncs correctly across sessions and devices
- [x] No critical P0/P1 bugs open

---

## Phase 2: iOS Flagship Build (Primary Growth Product)

Target: 4-8 weeks
Exit gate: TestFlight-ready build with world-class auth and core UX.

### 2.1 Mobile App Foundation

- [x] Add `apps/mobile` (Expo + React Native + TypeScript)
- [x] Establish navigation, design tokens, and mobile-first layout rules
- [x] Implement essential core feature paths before parity edge-cases

### 2.2 Mobile Auth (Critical)

- [x] Supabase auth wiring in mobile app
- [x] Provider dashboard configuration (Google + Apple) in Supabase/Apple Developer
- [x] Sign in with Apple
- [x] Google Sign-In
- [x] Email fallback
- [x] Deep-link callback handling for auth flows

### 2.3 Shared Logic Extraction

- [x] Create `packages/shared`
- [ ] Move shared types, zod schemas, domain helpers, and constants
- [ ] Rewire web/desktop/mobile to consume shared package
- [x] Add API contract tests for shared schema stability

### 2.4 Mobile Product Quality

- [ ] Performance profiling on real devices
- [ ] Push notifications (if retained in product scope)
- [ ] Crash/error instrumentation
- [ ] TestFlight beta cycle + bug triage

### Phase 2 Exit Criteria

- [ ] Successful Apple review submission readiness
- [ ] Auth conversion funnel meets target
- [ ] Core tasks complete with acceptable latency and crash-free session rate

---

## Phase 3: Platform Maturity + Monetization

Target: parallel after Phase 1; required before scale launch

- [ ] Stripe flows behind server-side APIs only
- [ ] PostHog product analytics with privacy-safe event taxonomy
- [ ] Role-based admin tooling path
- [ ] Background jobs/queues for heavy processing
- [ ] Support and incident playbooks finalized

## 5) Workstreams and Owners

- Backend/API: auth enforcement, route migration, DB clients
- Database/Supabase: migrations, RLS, policies, data migration validation
- Web/Desktop: identity wiring, session UX, desktop packaging
- Mobile: Expo app, auth providers, mobile-first UX
- DevOps: CI/CD, env strategy, deploy pipelines, rollback readiness
- QA: regression suite, release criteria sign-off

## 6) Tracking Cadence

- Daily: blocker triage + progress updates
- Twice weekly: integration test pass/fail review
- Weekly: phase gate review against exit criteria

Recommended status labels:

- `not_started`
- `in_progress`
- `blocked`
- `in_review`
- `done`

## 7) Release Gates Checklist

## Gate A: Security + Identity

- [ ] Auth enforced for protected endpoints
- [ ] RLS verified with negative tests (cross-user access denied)
- [ ] Secrets audit complete

## Gate B: Reliability + Observability

- [ ] Error rates below threshold for 7 consecutive days
- [ ] Critical alerts tested
- [ ] Backup/restore path verified

## Gate C: Product Readiness

- [ ] Core flows tested on target clients
- [ ] Onboarding + auth conversion acceptable
- [ ] Support docs complete

## 8) Test Matrix (Minimum)

- Auth: signup/signin/signout/session restore/token expiry
- Data ownership: user A cannot access user B data
- Sync: offline edit -> reconnect merge behavior
- API: rate limiting, validation failures, SSE behavior
- Deploy: fresh environment bootstrap + smoke tests

## 9) Launch Day Runbook

## T-7 to T-1

- [ ] Freeze schema-changing work unless critical
- [ ] Run full regression and resolve blockers
- [ ] Validate monitoring dashboards and alerts

## T-0 (Launch)

- [ ] Deploy API
- [ ] Deploy web/desktop/mobile release artifacts
- [ ] Run smoke script and manual critical-path checks
- [ ] Monitor error budget and rollback thresholds

## T+1 to T+7

- [ ] Daily incident review
- [ ] Funnel and retention checks
- [ ] Prioritized hotfix queue

## 10) Rollback Plan

- API: revert to last known good deployment
- DB: forward-fix preferred; restore snapshot only for severe corruption
- Client: hotfix release for desktop/mobile; web immediate redeploy
- Communications: internal incident template + user-facing status update

## 11) Immediate Next Actions (This Week)

- [ ] Approve this plan as source of truth
- [ ] Open Phase 0 epic with sub-tasks by section 0.1-0.4
- [x] Start with route/auth hardening for `library` and `bookmarks`
- [x] Draft and apply Supabase migrations for library/bookmark tables
- [x] Remove `anonymous` user path in web components and API contracts (library/bookmark scope)

## 12) Definition of Deployment Ready

Deployment-ready means:

- Identity model is consistent across all persisted user features
- Data model is in Supabase with enforced RLS (no JSON persistence for prod paths)
- CI/CD + monitoring + rollback are operational
- Desktop launch is stable and measurable
- iOS build is prepared on shared logic, not a second code silo
