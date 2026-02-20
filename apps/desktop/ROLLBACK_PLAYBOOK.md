# Desktop Rollback Playbook

## Trigger Criteria

- Installer causes launch/login regressions in pilot
- Critical data sync failure (bookmarks/highlights/library)
- Auto-update distribution publishes bad metadata (`latest.yml`)

## Rehearsal Command

- `npm --prefix apps/desktop run rollback:rehearsal`

This creates `apps/desktop/reports/rollbackRehearsal.json` with target artifacts and rollback execution steps.

## Execution Steps

1. Identify prior stable desktop tag (`desktop-v*`).
2. Run `.github/workflows/desktop-artifacts.yml` for rollback tag.
3. Verify generated release assets include:
   - Installer `.exe`
   - `.blockmap`
   - `latest.yml`
4. Confirm updater feed points to rollback release metadata.
5. Re-run pilot smoke checks on rollback installer.

## Validation

- `npm --prefix apps/desktop run phase1:smoke`
- `npm --prefix apps/desktop run phase1:gate -- --skip-dist`
