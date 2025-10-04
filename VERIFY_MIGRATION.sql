-- Quick verification query to check if migration completed
-- Run this in Supabase SQL Editor to confirm

SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('projects', 'artifacts')
  AND column_name IN ('completed_substeps', 'current_substep', 'roadmap_diff', 'progress_percentage')
ORDER BY table_name, column_name;
