-- Migration: Phase-Based Roadmap (P0-P7)
-- Adds phase structure to support P0-P7 template system

-- ============================================================================
-- 1. Create roadmap_phases table
-- ============================================================================
CREATE TABLE IF NOT EXISTS roadmap_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_number INTEGER NOT NULL CHECK (phase_number >= 0 AND phase_number <= 7),
  phase_id TEXT NOT NULL, -- "P0", "P1", ... "P7"
  title TEXT NOT NULL,
  goal TEXT NOT NULL,
  pedagogical_purpose TEXT NOT NULL,
  visible_win TEXT NOT NULL,
  master_prompt TEXT NOT NULL,

  -- Phase status
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'active', 'completed')),

  -- Timestamps
  unlocked_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  UNIQUE(project_id, phase_number),
  UNIQUE(project_id, phase_id)
);

-- Indexes
CREATE INDEX idx_roadmap_phases_project ON roadmap_phases(project_id);
CREATE INDEX idx_roadmap_phases_status ON roadmap_phases(project_id, status);
CREATE INDEX idx_roadmap_phases_active ON roadmap_phases(project_id) WHERE status = 'active';

-- ============================================================================
-- 2. Update roadmap_steps to become substeps (link to phases)
-- ============================================================================
ALTER TABLE roadmap_steps
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES roadmap_phases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS substep_number INTEGER,
  ADD COLUMN IF NOT EXISTS is_substep BOOLEAN DEFAULT false;

-- Create index for substep lookups
CREATE INDEX IF NOT EXISTS idx_roadmap_steps_phase ON roadmap_steps(phase_id);
CREATE INDEX IF NOT EXISTS idx_roadmap_steps_substeps ON roadmap_steps(project_id, phase_id, substep_number);

-- ============================================================================
-- 3. Update project_roadmap_metadata for phases
-- ============================================================================
ALTER TABLE project_roadmap_metadata
  ADD COLUMN IF NOT EXISTS total_phases INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS current_phase INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roadmap_type TEXT DEFAULT 'dynamic' CHECK (roadmap_type IN ('dynamic', 'phase_based')),
  ADD COLUMN IF NOT EXISTS estimated_timeline TEXT;

-- ============================================================================
-- 4. Add columns to projects table
-- ============================================================================
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_phase INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vision_statement TEXT,
  ADD COLUMN IF NOT EXISTS launch_metrics JSONB DEFAULT '{}'::jsonb;

-- ============================================================================
-- 5. Create triggers for phase table
-- ============================================================================
DROP TRIGGER IF EXISTS update_roadmap_phases_updated_at ON roadmap_phases;
CREATE TRIGGER update_roadmap_phases_updated_at
  BEFORE UPDATE ON roadmap_phases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. Create helper views for phase-based roadmaps
-- ============================================================================

-- View: Phase progress per project
CREATE OR REPLACE VIEW project_phase_progress AS
SELECT
  project_id,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_phases,
  COUNT(*) FILTER (WHERE status = 'active') AS active_phases,
  COUNT(*) FILTER (WHERE status = 'locked') AS locked_phases,
  COUNT(*) AS total_phases,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0))::INTEGER AS completion_percentage
FROM roadmap_phases
GROUP BY project_id;

-- View: Current phase with substeps
CREATE OR REPLACE VIEW project_current_phase_view AS
SELECT
  p.id AS project_id,
  p.goal,
  p.current_phase,
  ph.id AS phase_id,
  ph.phase_number,
  ph.phase_id AS phase_code,
  ph.title AS phase_title,
  ph.goal AS phase_goal,
  ph.status AS phase_status,
  ph.master_prompt AS phase_master_prompt,
  COUNT(rs.id) AS total_substeps,
  COUNT(rs.id) FILTER (WHERE rs.status = 'completed') AS completed_substeps
FROM projects p
LEFT JOIN roadmap_phases ph ON p.id = ph.project_id AND p.current_phase = ph.phase_number
LEFT JOIN roadmap_steps rs ON ph.id = rs.phase_id AND rs.is_substep = true
WHERE ph.status = 'active' OR ph.status IS NULL
GROUP BY p.id, p.goal, p.current_phase, ph.id, ph.phase_number, ph.phase_id, ph.title, ph.goal, ph.status, ph.master_prompt;

-- ============================================================================
-- 7. Function to unlock next phase
-- ============================================================================
CREATE OR REPLACE FUNCTION unlock_next_phase(p_project_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_phase_num INTEGER;
  next_phase_id UUID;
BEGIN
  -- Get current phase number
  SELECT current_phase INTO current_phase_num
  FROM projects
  WHERE id = p_project_id;

  -- Check if current phase is completed
  IF NOT EXISTS (
    SELECT 1 FROM roadmap_phases
    WHERE project_id = p_project_id
    AND phase_number = current_phase_num
    AND status = 'completed'
  ) THEN
    RETURN FALSE; -- Current phase not completed
  END IF;

  -- Check if there's a next phase
  IF current_phase_num >= 7 THEN
    RETURN FALSE; -- Already at last phase (P7)
  END IF;

  -- Unlock next phase
  UPDATE roadmap_phases
  SET status = 'active', unlocked_at = NOW()
  WHERE project_id = p_project_id
  AND phase_number = current_phase_num + 1
  AND status = 'locked'
  RETURNING id INTO next_phase_id;

  -- Update project current phase
  IF next_phase_id IS NOT NULL THEN
    UPDATE projects
    SET current_phase = current_phase_num + 1
    WHERE id = p_project_id;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. Function to complete phase
-- ============================================================================
CREATE OR REPLACE FUNCTION complete_phase(p_project_id UUID, p_phase_number INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  phase_id_var UUID;
  all_substeps_complete BOOLEAN;
BEGIN
  -- Check if all substeps are completed
  SELECT
    COALESCE(
      NOT EXISTS (
        SELECT 1 FROM roadmap_steps
        WHERE phase_id = (
          SELECT id FROM roadmap_phases
          WHERE project_id = p_project_id AND phase_number = p_phase_number
        )
        AND is_substep = true
        AND status != 'completed'
      ),
      TRUE -- If no substeps, consider it complete
    ) INTO all_substeps_complete;

  IF NOT all_substeps_complete THEN
    RETURN FALSE; -- Not all substeps completed
  END IF;

  -- Mark phase as completed
  UPDATE roadmap_phases
  SET status = 'completed', completed_at = NOW()
  WHERE project_id = p_project_id
  AND phase_number = p_phase_number
  AND status = 'active'
  RETURNING id INTO phase_id_var;

  IF phase_id_var IS NULL THEN
    RETURN FALSE; -- Phase not found or not active
  END IF;

  -- Try to unlock next phase
  PERFORM unlock_next_phase(p_project_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. Comments for documentation
-- ============================================================================
COMMENT ON TABLE roadmap_phases IS 'P0-P7 phases for phase-based roadmap projects';
COMMENT ON COLUMN roadmap_phases.phase_number IS 'Phase number 0-7 (P0=Define Vision, P7=Reflect & Evolve)';
COMMENT ON COLUMN roadmap_phases.status IS 'locked (not yet accessible), active (current phase), completed';
COMMENT ON COLUMN roadmap_phases.pedagogical_purpose IS 'Teaching goal of this phase (e.g., "Teach MVP thinking")';
COMMENT ON COLUMN roadmap_phases.visible_win IS 'Concrete deliverable user gets from completing this phase';

COMMENT ON COLUMN roadmap_steps.phase_id IS 'Links substep to parent phase (NULL for standalone steps)';
COMMENT ON COLUMN roadmap_steps.is_substep IS 'TRUE if this is a substep of a phase, FALSE if standalone step';
COMMENT ON COLUMN roadmap_steps.substep_number IS 'Substep number within phase (1, 2, 3...)';

COMMENT ON FUNCTION unlock_next_phase IS 'Unlocks the next phase when current phase is completed';
COMMENT ON FUNCTION complete_phase IS 'Marks a phase as completed and unlocks next phase';
