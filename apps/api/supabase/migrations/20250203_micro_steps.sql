-- Migration: Add Micro-Steps Support
-- Purpose: Break roadmap steps into smaller, controllable micro-tasks
-- Date: 2025-02-03

-- Create micro_steps table
CREATE TABLE IF NOT EXISTS micro_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL REFERENCES roadmap_steps(id) ON DELETE CASCADE,
  micro_step_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  estimated_duration TEXT, -- e.g., "2-3 minutes", "5 minutes"
  acceptance_criteria TEXT[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(step_id, micro_step_number)
);

-- Create index for efficient lookups
CREATE INDEX idx_micro_steps_step_id ON micro_steps(step_id);
CREATE INDEX idx_micro_steps_status ON micro_steps(status);

-- Add step_plan_status to roadmap_steps to track planning phase
ALTER TABLE roadmap_steps
ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'not_generated' CHECK (plan_status IN ('not_generated', 'generated', 'approved', 'rejected'));

-- Add current_micro_step to roadmap_steps to track progress
ALTER TABLE roadmap_steps
ADD COLUMN IF NOT EXISTS current_micro_step INT DEFAULT 0;

-- Comments for documentation
COMMENT ON TABLE micro_steps IS 'Micro-tasks that break down roadmap steps into 2-3 minute chunks';
COMMENT ON COLUMN micro_steps.micro_step_number IS 'Sequential number within the parent step (1, 2, 3...)';
COMMENT ON COLUMN micro_steps.estimated_duration IS 'Human-readable duration estimate (e.g., "2-3 minutes")';
COMMENT ON COLUMN roadmap_steps.plan_status IS 'Whether micro-step plan has been generated and approved';
COMMENT ON COLUMN roadmap_steps.current_micro_step IS 'Currently active micro-step number (0 = show plan)';
