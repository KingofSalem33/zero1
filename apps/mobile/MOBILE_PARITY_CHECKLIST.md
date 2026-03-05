# Mobile Parity Checklist

Date: 2026-03-04

## Foundation

- [x] Dark token map aligned to web palette
- [x] Reusable native primitives introduced (`ActionButton`, `SurfaceCard`)
- [x] Auth screen re-skinned to dark parity baseline

## Navigation / IA

- [x] Native core tab shell (`Reader`, `Chat`, `Library`, `Account`)
- [x] Saved content moved under Library sections
- [x] Home removed from active flow

## Screens

- [x] Library parity pass (layout/state hierarchy)
- [x] Bookmarks parity pass
- [x] Highlights parity pass
- [x] Account parity pass
- [x] Chat native implementation (no web shell dependency in core flow)
- [x] Map native implementation (fallback removed from core flow)

## Retirement

- [x] Web-shell per-feature retirement complete
- [x] `AppRuntime` web-shell machinery removed

## Build Gates

- [x] Two consecutive TestFlight builds pass native smoke gates
- [x] 3-day crash/launch baseline meets thresholds
