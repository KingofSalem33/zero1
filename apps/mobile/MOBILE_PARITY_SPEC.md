# Mobile Parity Spec (Web -> Native)

Date: 2026-03-04  
Owner: Mobile workstream  
Goal: Match web visual language on mobile while preserving native ergonomics.

## 1) Token Mapping (Source of Truth)

| Web token/value | Mobile token | Value |
| --- | --- | --- |
| `--color-bg-primary` / `neutral-900` | `colors.canvas` | `#18181B` |
| `bg-neutral-800/95` | `colors.surface` | `rgba(39, 39, 42, 0.95)` |
| `bg-white/[0.08]` glass card | `colors.surfaceRaised` | `rgba(255, 255, 255, 0.08)` |
| `border-white/10` | `colors.border` | `rgba(255, 255, 255, 0.10)` |
| `text-neutral-200` | `colors.text` | `#E4E4E7` |
| `text-neutral-400` | `colors.textMuted` | `#A1A1AA` |
| Accent `#D4AF37` | `colors.accent` | `#D4AF37` |
| Accent hover/tint | `colors.accentStrong` | `#F0D77F` |
| `bg-[#D4AF37]/15` | `colors.accentSoft` | `rgba(212, 175, 55, 0.16)` |
| `bg-black/60` overlay | busy/error overlays | `rgba(9, 9, 11, 0.45+)` |

## 2) Card Recipe (Native)

- Base card: `surfaceRaised + border + high blur-like translucency look`.
- Container style: rounded corners, 1px border, elevated shadow.
- Keep copy density low: one title, one subtitle, one primary action row.

## 3) Intentional Mobile Differences

- Touch targets: minimum button height equivalent to ~44pt.
- Navigation: bottom tabs, Library-first.
- Density: fewer columns, stacked actions on narrow widths.
- Map stays fallback-only until native map slice is complete.

## 4) Rules

- Web is visual source of truth.
- Native adapts layout/interaction only where phone ergonomics require it.
- Any deviation from web language must be documented in parity checklist.
