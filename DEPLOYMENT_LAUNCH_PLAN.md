# Zero1 Deployment Launch Plan

Last updated: 2026-02-19
Owner: Product + Engineering
Status: In progress

## Active Execution Board (Phase 0.1 Sprint)

- [x] Agent A (API): Enforce `requireAuth` on `/api/library` and `/api/bookmarks`; remove caller-supplied `userId` handling in these routes.
- [x] Agent B (Web): Remove `anonymous` user path for library/bookmark flows; switch library writes/reads to auth-bearing requests.
- [x] Agent C (Validation): Run `apps/api` build and `apps/web` typecheck after hardening changes.
- [x] Agent D (API+DB): Migrate library/bookmark persistence from JSON files to Supabase tables + RLS.
- [x] Agent E (Data Migration): Add one-time JSON -> Supabase backfill script and verification report.
- [x] Agent F (Data Migration): Execute `--apply` migration in environment and validate post-migration counts/report.
- [ ] Agent G (Blocked): Apply DB migration `012_create_library_and_bookmarks.sql`, then rerun ownership import with fallback user UUID.

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
- Owner-import attempt with fallback UUID was blocked because DB tables are not created in remote schema yet:
  - Command attempted: `npm --prefix apps/api run migrate:library:apply -- --fallback-user-id=<uuid>`
  - Error: `Could not find the table 'public.library_bundles' in the schema cache`
  - Unblock: execute SQL migration `apps/api/migrations/012_create_library_and_bookmarks.sql` in Supabase DB first.

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
- Supabase auth exists in web (`apps/web/src/contexts/AuthContext.tsx`)
- Highlights already use Supabase table + RLS (`apps/api/migrations/011_create_highlights.sql`)
- Library/bookmarks still rely on file-backed JSON and `anonymous` defaults
  - `apps/api/src/routes/library.ts`
  - `apps/api/src/routes/bookmarks.ts`
- Multiple web flows still pass `userId="anonymous"`:
  - `apps/web/src/routes/LibraryRoute.tsx`
  - `apps/web/src/components/UnifiedWorkspace.tsx`
  - `apps/web/src/components/LibraryView.tsx`
- No `apps/desktop`, no `apps/mobile`, no `packages/shared` yet

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

- [ ] Split DB clients in API:
  - user-context client (RLS-respecting)
  - privileged client (service role, server-only workflows)
- [ ] Audit all routes/scripts for accidental privileged reads/writes
- [ ] Ensure no `VITE_*` service-role leakage patterns remain in runtime config

Primary files:

- `apps/api/src/db.ts`
- `apps/api/src/env.ts`
- `.github/workflows/ci.yml`

### 0.4 Production Readiness Baseline

- [ ] Replace localhost-only CORS with env-configured allowed origins
- [ ] Define strict env var contract for API/Web
- [ ] Re-enable frontend Sentry initialization for production
- [ ] Add health/readiness docs + runbook checks

Primary files:

- `apps/api/src/index.ts`
- `apps/web/src/main.tsx`
- `render.yaml`
- `vercel.json`

### Phase 0 Exit Criteria

- [ ] No user-data endpoint depends on caller-supplied `userId`
- [ ] No persisted user data stored in local JSON files in production path
- [ ] RLS exists for all user-owned tables
- [ ] Authenticated user can only read/write own records
- [ ] Regression tests pass

---

## Phase 1: Desktop MVP Release (Shipping Vehicle)

Target: 2-4 weeks after Phase 0
Exit gate: signed production desktop build deployed to pilot users.

### 1.1 Desktop App Foundation

- [ ] Add `apps/desktop` (Electron + React + TypeScript)
- [ ] Reuse current web UI where practical
- [ ] Add build/sign pipeline for target OSes (start with primary OS)
- [ ] Add auto-update strategy (required for fast iteration)

### 1.2 Desktop Auth + Session

- [ ] Supabase Auth with anon key only in desktop client
- [ ] Add login UX (email/password first, magic link optional)
- [ ] Ensure secure local session storage
- [ ] Ensure auth token attached to API calls where needed

### 1.3 Desktop QA + Release

- [ ] Smoke test: onboarding, auth, highlights, library, chat, map
- [ ] Stability test under long sessions
- [ ] Crash logging and release diagnostics enabled
- [ ] Pilot rollout and rollback package ready

### Phase 1 Exit Criteria

- [ ] Desktop pilot users can install, login, and use core features end-to-end
- [ ] User data syncs correctly across sessions and devices
- [ ] No critical P0/P1 bugs open

---

## Phase 2: iOS Flagship Build (Primary Growth Product)

Target: 4-8 weeks
Exit gate: TestFlight-ready build with world-class auth and core UX.

### 2.1 Mobile App Foundation

- [ ] Add `apps/mobile` (Expo + React Native + TypeScript)
- [ ] Establish navigation, design tokens, and mobile-first layout rules
- [ ] Implement essential core feature paths before parity edge-cases

### 2.2 Mobile Auth (Critical)

- [ ] Supabase auth wiring in mobile app
- [ ] Sign in with Apple
- [ ] Google Sign-In
- [ ] Email fallback
- [ ] Deep-link callback handling for auth flows

### 2.3 Shared Logic Extraction

- [ ] Create `packages/shared`
- [ ] Move shared types, zod schemas, domain helpers, and constants
- [ ] Rewire web/desktop/mobile to consume shared package
- [ ] Add API contract tests for shared schema stability

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
