# Phase 2.6 Product Direction

## Decision

- Direction: `native-first`
- Decision date: 2026-03-04
- Scope owner: Mobile workstream

## Why this direction

- Current web-shell mode is functional but still constrained by mobile-web limitations (WebView auth provider behavior, viewport/scroll ergonomics, and inconsistent UX parity).
- The product goal is a world-class iOS experience; this is better achieved by shipping native screens for core journeys rather than extending web-shell complexity.
- Existing web-shell implementation remains useful as a temporary fallback during migration.

## Phase 2.6 execution focus

- Build native route groups for `Home`, `Library`, `Highlights`, and `Account`.
- Keep native auth as the primary entry path; remove dependency on web-shell sign-in UI.
- Implement native-first flows for library read/write, map interactions, and highlight creation/review.
- Use web-shell only for non-critical screens that are not yet migrated.

## Current execution status

- Native runtime path is now default-only in `apps/mobile/src/AppRuntime.tsx` (web-shell bootstrap removed).
- Core mobile UI parity slices landed for tabs, auth/account, and detail/create flows.
- Map remains browser fallback until native map route implementation is complete.

## Exit signal for deprecating web-shell default

- Native `auth + library + map + highlight` flows pass TestFlight smoke checks for two consecutive builds.
- Mobile launch/crash metrics meet threshold targets for the same period.
- No open P0/P1 UX regressions in migrated native routes.
