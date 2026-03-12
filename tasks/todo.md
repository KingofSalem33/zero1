# Todo

- [x] Review existing shared button components and target Reader/Chat usages
- [x] Add shared primitives for icon, compact, and chip buttons
- [x] Migrate Reader high-impact buttons to shared primitives
- [x] Migrate Chat high-impact buttons to shared primitives
- [x] Run typecheck and document remaining button drift
- [x] Extend the shared system for row-style selector buttons
- [x] Migrate Library tabs and card quick-action pills
- [x] Migrate Reader selector rows and chapter chips
- [x] Migrate Web fallback shell buttons to shared primitives
- [x] Migrate remaining detail/create suggestion chips to shared primitives

## Review

- Added shared button primitives: `IconButton`, `CompactButton`, `ChipButton`, and `ListRowButton`.
- Migrated Reader header/footer icon buttons, compact action rows, cross-reference disclosure chip, root-translation controls, selector rows, and chapter chips.
- Migrated Chat trace/send/new-session controls and normalized quick-prompt sizing/typography.
- Migrated Library mode tabs and card quick-action pills to the shared chip system.
- Migrated navigation shell menu/close icon buttons and Web fallback shell actions to the shared button system.
- Migrated bookmark suggestion chips in older detail/create flows to the shared chip system.
- Validation: `npx tsc -p apps/mobile/tsconfig.json --noEmit`.
- Residual drift is now mostly intentional specialty controls, such as color-picker chips and card-like surfaces, rather than one-off button systems.
