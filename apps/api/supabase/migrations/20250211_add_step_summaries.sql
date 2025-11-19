-- Migration: Add completion summaries to roadmap steps
-- Adds a field to store a 2-3 sentence summary of what was accomplished when completing a step

-- Add completion_summary column to roadmap_steps
ALTER TABLE roadmap_steps
  ADD COLUMN IF NOT EXISTS completion_summary TEXT;

-- Add comment for documentation
COMMENT ON COLUMN roadmap_steps.completion_summary IS 'AI-generated 2-3 sentence summary of what was accomplished in this step';
