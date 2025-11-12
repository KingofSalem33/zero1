# Apply Micro-Steps Database Migration

## Overview

This migration adds support for the new "Plan → Approve → Execute" micro-steps workflow. It creates a new `micro_steps` table and adds tracking columns to `roadmap_steps`.

## What Gets Added

### New Table: `micro_steps`

Stores 2-3 minute micro-tasks that break down roadmap steps.

**Columns:**

- `id` - UUID primary key
- `step_id` - References parent roadmap step
- `micro_step_number` - Sequential number (1, 2, 3...)
- `title` - Micro-step title
- `description` - Detailed description
- `estimated_duration` - Human-readable (e.g., "2-3 minutes")
- `acceptance_criteria` - Array of completion criteria
- `status` - 'pending', 'in_progress', 'completed', 'skipped'
- `created_at` / `completed_at` - Timestamps

### Modified Table: `roadmap_steps`

Adds plan tracking columns.

**New Columns:**

- `plan_status` - 'not_generated', 'generated', 'approved', 'rejected'
- `current_micro_step` - Currently active micro-step number (0 = show plan)

## How to Apply Migration

### Option 1: Supabase Dashboard (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New query"

3. **Copy Migration SQL**
   - Open: `apps/api/supabase/migrations/20250203_micro_steps.sql`
   - Copy the entire contents

4. **Run Migration**
   - Paste the SQL into the editor
   - Click "Run" or press Ctrl+Enter
   - Wait for success message

5. **Verify**
   - Check that `micro_steps` table exists
   - Check that `roadmap_steps` has new columns

### Option 2: Supabase CLI

If you have Supabase CLI installed:

```bash
# From project root
supabase db push
```

### Option 3: Direct SQL Connection

If you have a direct database connection:

```bash
# Using psql
psql "your-connection-string" < apps/api/supabase/migrations/20250203_micro_steps.sql
```

## Verification Steps

After applying the migration, verify it worked:

1. **Check Tables**

   ```sql
   -- Should return the micro_steps table
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'micro_steps';
   ```

2. **Check Columns**

   ```sql
   -- Should return plan_status and current_micro_step
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'roadmap_steps'
   AND column_name IN ('plan_status', 'current_micro_step');
   ```

3. **Check Indexes**
   ```sql
   -- Should show indexes on micro_steps
   SELECT indexname FROM pg_indexes
   WHERE tablename = 'micro_steps';
   ```

## Testing the Workflow

Once migration is applied, test the micro-steps workflow:

1. **Create a test project**
   - Navigate to http://localhost:5174
   - Create a new project with any goal

2. **Click on a roadmap step**
   - The system should auto-generate a micro-step plan
   - You'll see a "Plan Approval Card" with 3-5 micro-steps

3. **Approve the plan**
   - Click "Start Building"
   - First micro-step should start executing

4. **Complete micro-steps**
   - After execution, you'll see a "Checkpoint Card"
   - Click "Continue" to execute next micro-step
   - Or "Take a Break" to pause

5. **Verify completion**
   - Complete all micro-steps
   - Step should mark as complete
   - Move to next step to test again

## Rollback (If Needed)

If you need to rollback this migration:

```sql
-- Remove micro_steps table
DROP TABLE IF EXISTS micro_steps CASCADE;

-- Remove new columns from roadmap_steps
ALTER TABLE roadmap_steps DROP COLUMN IF EXISTS plan_status;
ALTER TABLE roadmap_steps DROP COLUMN IF EXISTS current_micro_step;
```

## Troubleshooting

### Migration Fails with "table already exists"

- The migration uses `IF NOT EXISTS`, so this shouldn't happen
- If it does, the table already exists from a previous attempt
- You can skip this error or run the rollback SQL first

### Migration Fails with "column already exists"

- Similar to above - column was added in a previous attempt
- The migration uses `IF NOT EXISTS`, so this is safe
- You can skip this error

### Can't connect to Supabase

- Check your `.env` file has correct `SUPABASE_URL` and `SUPABASE_KEY`
- Verify your Supabase project is running
- Check network connection

## Next Steps

After successful migration:

1. ✅ Migration applied
2. ✅ Verification passed
3. 🧪 Test the micro-steps workflow
4. 🚀 Start using the new bite-sized execution!

## Questions?

If you encounter issues:

1. Check the console logs in browser DevTools
2. Check API server logs (`npm run dev:api`)
3. Review `MICRO_STEPS_IMPLEMENTATION.md` for architecture details

---

**Migration File Location:** `apps/api/supabase/migrations/20250203_micro_steps.sql`
**Documentation:** `MICRO_STEPS_IMPLEMENTATION.md`
