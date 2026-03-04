# Mobile Parity Checklist

Date: 2026-03-04

## Foundation

- [x] Dark token map aligned to web palette
- [x] Reusable native primitives introduced (`ActionButton`, `SurfaceCard`)
- [x] Auth screen re-skinned to dark parity baseline

## Navigation / IA

- [x] Library-first tab shell
- [x] Clear tab labels (`Bookmarks`, `Highlights`)
- [x] Home removed from active flow

## Screens

- [x] Library parity pass (layout/state hierarchy)
- [x] Bookmarks parity pass
- [x] Highlights parity pass
- [x] Account parity pass
- [ ] Map native implementation (fallback removed)

## Retirement

- [ ] Web-shell per-feature retirement complete
- [ ] `AppRuntime` web-shell machinery removed

## Build Gates

- [x] Two consecutive TestFlight builds pass native smoke gates
- [x] 3-day crash/launch baseline meets thresholds
