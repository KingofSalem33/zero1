# Testing Database Migration

## Step 1: Execute Migration

1. Open your Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the contents of `database_migration_artifacts.sql`
4. Click "Run"

## Step 2: Verify Tables Created

Run this query in Supabase SQL Editor:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name IN ('artifacts', 'artifact_signals', 'checkpoints')
ORDER BY table_name, ordinal_position;
```

**Expected Result:** Should return ~40 rows showing all columns from the 3 new tables.

## Step 3: Verify Indexes Created

```sql
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('artifacts', 'artifact_signals', 'checkpoints')
ORDER BY tablename, indexname;
```

**Expected Result:** Should return 8+ index rows.

## Step 4: Verify Existing Projects Table Updated

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'projects'
AND column_name IN ('current_phase', 'completed_phases', 'completed_substeps', 'roadmap')
ORDER BY column_name;
```

**Expected Result:** Should return 4 rows showing the new columns added to `projects`.

## Step 5: Test Insert (Safe Test)

```sql
-- Create a test project
INSERT INTO projects (user_id, goal, status)
VALUES ('00000000-0000-0000-0000-000000000000', 'Test migration', 'active')
RETURNING id;

-- Note the returned ID, then use it below (replace PROJECT_ID)

-- Insert a test artifact
INSERT INTO artifacts (project_id, type, file_name, status)
VALUES ('PROJECT_ID', 'single', 'test.txt', 'uploaded')
RETURNING id;

-- Note the returned ID, then use it below (replace ARTIFACT_ID)

-- Insert test signals
INSERT INTO artifact_signals (artifact_id, has_tests, has_typescript, file_count)
VALUES ('ARTIFACT_ID', true, true, 10);

-- Insert test checkpoint
INSERT INTO checkpoints (project_id, name, current_phase)
VALUES ('PROJECT_ID', 'Test checkpoint', 'P1');

-- Verify the test data
SELECT 'artifacts' as table_name, COUNT(*) as count FROM artifacts
UNION ALL
SELECT 'artifact_signals', COUNT(*) FROM artifact_signals
UNION ALL
SELECT 'checkpoints', COUNT(*) FROM checkpoints;
```

**Expected Result:**
- artifacts: 1
- artifact_signals: 1
- checkpoints: 1 (or 2 if auto-checkpoint trigger fired)

## Step 6: Test Auto-Checkpoint Trigger

```sql
-- Update project phase to trigger checkpoint
UPDATE projects
SET current_phase = 'P2'
WHERE id = 'PROJECT_ID';

-- Check if checkpoint was auto-created
SELECT name, reason, created_by, current_phase
FROM checkpoints
WHERE project_id = 'PROJECT_ID'
ORDER BY created_at DESC;
```

**Expected Result:** Should see a new checkpoint with:
- name: "Phase P2 Complete"
- reason: "Automatic checkpoint on phase completion"
- created_by: "system"

## Step 7: Cleanup Test Data

```sql
-- Delete test data (cascades to related tables)
DELETE FROM projects WHERE goal = 'Test migration';
```

## Fidelity Tests Passed ✅

- [ ] Migration executed without errors
- [ ] All tables created (artifacts, artifact_signals, checkpoints)
- [ ] All indexes created
- [ ] Projects table updated with new columns
- [ ] Test inserts successful
- [ ] Auto-checkpoint trigger works
- [ ] RLS policies active (check with `SELECT * FROM pg_policies WHERE tablename LIKE '%artifact%'`)
- [ ] Test cleanup successful

## Rollback (If Needed)

```sql
-- WARNING: This deletes all artifact data
DROP TRIGGER IF EXISTS trigger_auto_checkpoint ON projects;
DROP FUNCTION IF EXISTS auto_create_checkpoint();
DROP TABLE IF EXISTS artifact_signals CASCADE;
DROP TABLE IF EXISTS artifacts CASCADE;
DROP TABLE IF EXISTS checkpoints CASCADE;

ALTER TABLE projects
  DROP COLUMN IF EXISTS current_phase,
  DROP COLUMN IF EXISTS completed_phases,
  DROP COLUMN IF EXISTS completed_substeps,
  DROP COLUMN IF EXISTS roadmap;

ALTER TABLE steps
  DROP COLUMN IF EXISTS artifact_id,
  DROP COLUMN IF EXISTS auto_completed,
  DROP COLUMN IF EXISTS confidence_score;
```