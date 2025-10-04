-- ============================================
-- SUBSTEP TRACKING MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================

-- Add completed_substeps tracking to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_substeps jsonb DEFAULT '[]'::jsonb;

-- Add current_substep tracking (which substep within current phase)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_substep integer DEFAULT 1;

-- Add roadmap diff tracking to artifacts table
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS completed_substeps jsonb DEFAULT '[]'::jsonb;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS roadmap_diff text;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS progress_percentage integer DEFAULT 0;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_completed_substeps ON projects USING gin (completed_substeps);
CREATE INDEX IF NOT EXISTS idx_artifacts_completed_substeps ON artifacts USING gin (completed_substeps);

-- Helper function: Check if substep is complete
CREATE OR REPLACE FUNCTION is_substep_complete(
  completions jsonb,
  phase_num integer,
  substep_num integer
) RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(completions) AS item
    WHERE (item->>'phase_number')::integer = phase_num
      AND (item->>'substep_number')::integer = substep_num
      AND item->>'status' = 'complete'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Helper function: Get phase completion percentage
CREATE OR REPLACE FUNCTION get_phase_completion_percentage(
  completions jsonb,
  phase_num integer,
  total_substeps integer DEFAULT 4
) RETURNS integer AS $$
DECLARE
  completed_count integer;
BEGIN
  SELECT COUNT(*)
  INTO completed_count
  FROM jsonb_array_elements(completions) AS item
  WHERE (item->>'phase_number')::integer = phase_num
    AND item->>'status' = 'complete';

  RETURN LEAST(100, (completed_count * 100 / total_substeps));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Verify migration
SELECT
  'projects' as table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'projects'
  AND column_name IN ('completed_substeps', 'current_substep')
UNION ALL
SELECT
  'artifacts' as table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'artifacts'
  AND column_name IN ('completed_substeps', 'roadmap_diff', 'progress_percentage');

-- Test helper functions
SELECT is_substep_complete('[]'::jsonb, 1, 1) as should_be_false;
SELECT is_substep_complete('[{"phase_number": 1, "substep_number": 1, "status": "complete"}]'::jsonb, 1, 1) as should_be_true;
SELECT get_phase_completion_percentage('[{"phase_number": 1, "status": "complete"}, {"phase_number": 1, "status": "complete"}]'::jsonb, 1, 4) as should_be_50_percent;
