-- Migration: Add Substep Tracking to Projects and Artifacts
-- Purpose: Enable artifact upload feedback loop - track which substeps are complete

-- Add completed_substeps tracking to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completed_substeps jsonb DEFAULT '[]'::jsonb;

-- Add current_substep tracking (which substep within current phase)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_substep integer DEFAULT 1;

COMMENT ON COLUMN projects.completed_substeps IS 'Array of completed substep records: [{phase_number, substep_number, status, evidence, confidence, timestamp}]';
COMMENT ON COLUMN projects.current_substep IS 'Current substep number within the current phase (1-indexed)';

-- Add roadmap diff tracking to artifacts table
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS completed_substeps jsonb DEFAULT '[]'::jsonb;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS roadmap_diff text;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS progress_percentage integer DEFAULT 0;

COMMENT ON COLUMN artifacts.completed_substeps IS 'Array of substeps this artifact completed: [{phase_number, substep_number, status, evidence, confidence, timestamp}]';
COMMENT ON COLUMN artifacts.roadmap_diff IS 'Human-readable summary of what changed in the roadmap after analyzing this artifact';
COMMENT ON COLUMN artifacts.progress_percentage IS 'Overall project completion percentage (0-100) after this artifact';

-- Create index for querying completed substeps
CREATE INDEX IF NOT EXISTS idx_projects_completed_substeps ON projects USING gin (completed_substeps);
CREATE INDEX IF NOT EXISTS idx_artifacts_completed_substeps ON artifacts USING gin (completed_substeps);

-- Create helper function to check if a specific substep is complete
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

COMMENT ON FUNCTION is_substep_complete IS 'Check if a specific substep is marked complete in the completions array';

-- Create helper function to get completion percentage for a phase
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

COMMENT ON FUNCTION get_phase_completion_percentage IS 'Calculate completion percentage for a specific phase';
