-- Complete Zero1 Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- ============================================================================
-- BASE TABLES (Original Schema)
-- ============================================================================

-- Projects table to store user project goals and status
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  goal text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),

  -- New fields for roadmap tracking
  current_phase text DEFAULT 'P0',
  completed_phases jsonb DEFAULT '[]'::jsonb,
  completed_substeps jsonb DEFAULT '[]'::jsonb,
  roadmap jsonb DEFAULT '{}'::jsonb
);

-- Steps table to store prompt cards for each project
CREATE TABLE IF NOT EXISTS steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  step_number int,
  prompt_text text,
  why_text text,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),

  -- New fields for artifact integration
  artifact_id uuid,
  auto_completed boolean DEFAULT false,
  confidence_score numeric(3,2) DEFAULT 0.00
);

-- History table to store all user interactions and AI responses
CREATE TABLE IF NOT EXISTS history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  input_text text,
  output_text text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- ARTIFACTS TABLE
-- Stores uploaded files, repos, and their analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  type text CHECK (type IN ('single', 'zip', 'repo')),
  file_path text,
  file_name text,
  repo_url text,
  repo_branch text DEFAULT 'main',
  size_bytes integer,
  uploaded_at timestamptz DEFAULT now(),
  analyzed_at timestamptz,

  -- Static analysis results (fast, no LLM)
  signals jsonb DEFAULT '{}'::jsonb,

  -- LLM analysis results
  analysis jsonb DEFAULT '{}'::jsonb,

  -- Metadata
  status text DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'analyzing', 'analyzed', 'failed')),
  error_message text
);

-- ============================================================================
-- ARTIFACT_SIGNALS TABLE
-- Lightweight static analysis (extracted for querying)
-- ============================================================================
CREATE TABLE IF NOT EXISTS artifact_signals (
  artifact_id uuid PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,

  -- Code quality indicators
  has_tests boolean DEFAULT false,
  has_linter boolean DEFAULT false,
  has_typescript boolean DEFAULT false,
  has_prettier boolean DEFAULT false,

  -- Version control
  has_git boolean DEFAULT false,
  last_commit_time timestamptz,
  commit_count integer,

  -- Deployment
  has_deploy_config boolean DEFAULT false,
  deploy_platform text,

  -- Project structure
  file_count integer DEFAULT 0,
  folder_depth integer DEFAULT 0,
  readme_length integer DEFAULT 0,
  has_documentation boolean DEFAULT false,

  -- Tech stack (for quick filtering)
  tech_stack jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- CHECKPOINTS TABLE
-- Version history for projects
-- ============================================================================
CREATE TABLE IF NOT EXISTS checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,

  -- Checkpoint metadata
  name text,
  reason text,
  created_by text DEFAULT 'system',

  -- Project state snapshot
  current_phase text,
  completed_substeps jsonb DEFAULT '[]'::jsonb,
  roadmap_snapshot jsonb DEFAULT '{}'::jsonb,
  project_state_hash text,

  -- Linked artifacts
  artifact_ids jsonb DEFAULT '[]'::jsonb,

  created_at timestamptz DEFAULT now()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Base table indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_current_phase ON projects(current_phase);

CREATE INDEX IF NOT EXISTS idx_steps_project_id ON steps(project_id);
CREATE INDEX IF NOT EXISTS idx_steps_completed ON steps(completed);

CREATE INDEX IF NOT EXISTS idx_history_project_id ON history(project_id);

-- Artifact table indexes
CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_uploaded_at ON artifacts(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_signals_has_tests ON artifact_signals(has_tests);
CREATE INDEX IF NOT EXISTS idx_artifact_signals_has_typescript ON artifact_signals(has_typescript);
CREATE INDEX IF NOT EXISTS idx_artifact_signals_tech_stack ON artifact_signals USING gin(tech_stack);

CREATE INDEX IF NOT EXISTS idx_checkpoints_project_id ON checkpoints(project_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at DESC);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to create automatic checkpoint on phase completion
CREATE OR REPLACE FUNCTION auto_create_checkpoint()
RETURNS trigger AS $$
BEGIN
  -- Only create checkpoint if phase actually changed
  IF OLD.current_phase IS DISTINCT FROM NEW.current_phase THEN
    INSERT INTO checkpoints (
      project_id,
      name,
      reason,
      created_by,
      current_phase,
      completed_substeps,
      roadmap_snapshot
    ) VALUES (
      NEW.id,
      'Phase ' || NEW.current_phase || ' Complete',
      'Automatic checkpoint on phase completion',
      'system',
      NEW.current_phase,
      NEW.completed_substeps,
      NEW.roadmap
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS trigger_auto_checkpoint ON projects;

CREATE TRIGGER trigger_auto_checkpoint
  AFTER UPDATE OF current_phase ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_checkpoint();

-- ============================================================================
-- ROW LEVEL SECURITY (Enable RLS for all tables)
-- ============================================================================

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;

-- Projects: Users can only access their own projects
CREATE POLICY IF NOT EXISTS projects_user_policy ON projects
  FOR ALL
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Steps: Users can only access steps for their projects
CREATE POLICY IF NOT EXISTS steps_user_policy ON steps
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid() OR user_id IS NULL
    )
  );

-- History: Users can only access history for their projects
CREATE POLICY IF NOT EXISTS history_user_policy ON history
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid() OR user_id IS NULL
    )
  );

-- Artifacts: Users can only access their own project artifacts
CREATE POLICY IF NOT EXISTS artifacts_user_policy ON artifacts
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid() OR user_id IS NULL
    )
  );

-- Artifact signals: Same as artifacts
CREATE POLICY IF NOT EXISTS artifact_signals_user_policy ON artifact_signals
  FOR ALL
  USING (
    artifact_id IN (
      SELECT id FROM artifacts WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid() OR user_id IS NULL
      )
    )
  );

-- Checkpoints: Users can only access their own project checkpoints
CREATE POLICY IF NOT EXISTS checkpoints_user_policy ON checkpoints
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid() OR user_id IS NULL
    )
  );