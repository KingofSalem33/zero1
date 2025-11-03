-- Migration: Dynamic LLM-Driven Roadmap
-- This replaces the static P0-P7 phase structure with a dynamic, linear step system

-- ============================================================================
-- 1. Create roadmap_steps table (replaces phases/substeps)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roadmap_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  master_prompt TEXT NOT NULL,

  -- Context for AI execution
  context JSONB DEFAULT '{}'::jsonb,

  -- Acceptance criteria (what defines "done")
  acceptance_criteria TEXT[] DEFAULT '{}',

  -- Complexity and effort tracking
  estimated_complexity INTEGER DEFAULT 5 CHECK (estimated_complexity >= 1 AND estimated_complexity <= 10),
  actual_effort JSONB DEFAULT '{}'::jsonb, -- { messages: 0, time_spent_minutes: 0 }

  -- Step status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'skipped')),

  -- Timestamps
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(project_id, step_number)
);

-- Index for quick lookups
CREATE INDEX idx_roadmap_steps_project ON roadmap_steps(project_id);
CREATE INDEX idx_roadmap_steps_status ON roadmap_steps(project_id, status);
CREATE INDEX idx_roadmap_steps_current ON roadmap_steps(project_id, step_number) WHERE status = 'active';

-- ============================================================================
-- 2. Create project_roadmap_metadata table
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_roadmap_metadata (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  total_steps INTEGER NOT NULL DEFAULT 0,
  current_step INTEGER NOT NULL DEFAULT 1,
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),

  -- Roadmap versioning (increments when roadmap adapts)
  roadmap_version INTEGER NOT NULL DEFAULT 1,

  -- LLM metadata
  generated_by TEXT, -- e.g., "claude-3-5-sonnet-20241022"
  generation_prompt TEXT,

  -- Timestamps
  last_adapted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 3. Add new columns to projects table
-- ============================================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS roadmap_status TEXT DEFAULT 'generating' CHECK (roadmap_status IN ('generating', 'ready', 'in_progress', 'completed'));

-- ============================================================================
-- 4. Create completion_suggestions table (for LLM suggestions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS completion_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES roadmap_steps(id) ON DELETE CASCADE,

  -- Suggestion details
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('auto_detected', 'artifact_based', 'user_requested')),
  confidence_score INTEGER CHECK (confidence_score >= 0 AND confidence_score <= 100),
  reasoning TEXT,

  -- Evidence
  evidence JSONB DEFAULT '{}'::jsonb, -- { completed_criteria: [], artifacts: [], conversation_excerpts: [] }

  -- User response
  user_action TEXT CHECK (user_action IN ('accepted', 'rejected', 'ignored')),
  actioned_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_completion_suggestions_project ON completion_suggestions(project_id);
CREATE INDEX idx_completion_suggestions_pending ON completion_suggestions(project_id, step_id) WHERE user_action IS NULL;

-- ============================================================================
-- 5. Create function to auto-update updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_roadmap_steps_updated_at ON roadmap_steps;
CREATE TRIGGER update_roadmap_steps_updated_at
  BEFORE UPDATE ON roadmap_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_roadmap_metadata_updated_at ON project_roadmap_metadata;
CREATE TRIGGER update_project_roadmap_metadata_updated_at
  BEFORE UPDATE ON project_roadmap_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. Create helper views
-- ============================================================================

-- View: Current project status with roadmap info
CREATE OR REPLACE VIEW project_roadmap_status AS
SELECT
  p.id AS project_id,
  p.goal,
  p.status AS project_status,
  p.current_step,
  p.roadmap_status,
  m.total_steps,
  m.completion_percentage,
  m.roadmap_version,
  r.title AS current_step_title,
  r.status AS current_step_status,
  r.estimated_complexity AS current_step_complexity
FROM projects p
LEFT JOIN project_roadmap_metadata m ON p.id = m.project_id
LEFT JOIN roadmap_steps r ON p.id = r.project_id AND p.current_step = r.step_number
WHERE r.status = 'active' OR r.status IS NULL;

-- View: Completed steps count per project
CREATE OR REPLACE VIEW project_progress AS
SELECT
  project_id,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_steps,
  COUNT(*) FILTER (WHERE status = 'active') AS active_steps,
  COUNT(*) FILTER (WHERE status = 'pending') AS pending_steps,
  COUNT(*) AS total_steps,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0))::INTEGER AS completion_percentage
FROM roadmap_steps
GROUP BY project_id;

-- ============================================================================
-- 7. Comments for documentation
-- ============================================================================
COMMENT ON TABLE roadmap_steps IS 'Dynamic roadmap steps generated by LLM for each project';
COMMENT ON TABLE project_roadmap_metadata IS 'Metadata about the generated roadmap for each project';
COMMENT ON TABLE completion_suggestions IS 'LLM-generated suggestions for step completion';
COMMENT ON COLUMN roadmap_steps.master_prompt IS 'Context-aware prompt for AI to guide user through this step';
COMMENT ON COLUMN roadmap_steps.context IS 'JSON context including previous steps summary, next steps preview, artifacts';
COMMENT ON COLUMN roadmap_steps.acceptance_criteria IS 'Array of criteria that define when this step is complete';
COMMENT ON COLUMN roadmap_steps.estimated_complexity IS 'Complexity rating from 1 (trivial) to 10 (highly complex)';
COMMENT ON COLUMN roadmap_steps.actual_effort IS 'Tracked effort: messages sent, time spent, etc.';

-- ============================================================================
-- 8. Grant permissions (adjust based on your RLS policies)
-- ============================================================================
-- Note: Adjust these based on your auth setup
-- ALTER TABLE roadmap_steps ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE project_roadmap_metadata ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE completion_suggestions ENABLE ROW LEVEL SECURITY;
