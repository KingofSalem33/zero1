-- Migration: Add Artifact Analysis & Checkpoint System
-- Execute this SQL in your Supabase SQL Editor after the initial schema

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
  deploy_platform text, -- 'vercel', 'netlify', 'docker', etc.

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
  created_by text DEFAULT 'system', -- 'user' or 'system'

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
-- UPDATE EXISTING TABLES
-- Add fields to track artifact-based progress
-- ============================================================================

-- Add roadmap tracking to projects table
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS current_phase text DEFAULT 'P0',
  ADD COLUMN IF NOT EXISTS completed_phases jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS completed_substeps jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS roadmap jsonb DEFAULT '{}'::jsonb;

-- Add artifact context to steps
ALTER TABLE steps
  ADD COLUMN IF NOT EXISTS artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(3,2) DEFAULT 0.00;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_artifacts_uploaded_at ON artifacts(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_signals_has_tests ON artifact_signals(has_tests);
CREATE INDEX IF NOT EXISTS idx_artifact_signals_has_typescript ON artifact_signals(has_typescript);
CREATE INDEX IF NOT EXISTS idx_artifact_signals_tech_stack ON artifact_signals USING gin(tech_stack);

CREATE INDEX IF NOT EXISTS idx_checkpoints_project_id ON checkpoints(project_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_current_phase ON projects(current_phase);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to create automatic checkpoint on phase completion
CREATE OR REPLACE FUNCTION auto_create_checkpoint()
RETURNS trigger AS $$
BEGIN
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Create checkpoint when phase changes
CREATE TRIGGER trigger_auto_checkpoint
  AFTER UPDATE OF current_phase ON projects
  FOR EACH ROW
  WHEN (OLD.current_phase IS DISTINCT FROM NEW.current_phase)
  EXECUTE FUNCTION auto_create_checkpoint();

-- ============================================================================
-- ROW LEVEL SECURITY (if using Supabase Auth)
-- ============================================================================

-- Enable RLS
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;

-- Artifacts: Users can only access their own project artifacts
CREATE POLICY artifacts_user_policy ON artifacts
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- Artifact signals: Same as artifacts
CREATE POLICY artifact_signals_user_policy ON artifact_signals
  FOR ALL
  USING (
    artifact_id IN (
      SELECT id FROM artifacts WHERE project_id IN (
        SELECT id FROM projects WHERE user_id = auth.uid()
      )
    )
  );

-- Checkpoints: Users can only access their own project checkpoints
CREATE POLICY checkpoints_user_policy ON checkpoints
  FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Uncomment to verify tables were created:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- AND table_name IN ('artifacts', 'artifact_signals', 'checkpoints');

-- Uncomment to verify indexes:
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public'
-- AND tablename IN ('artifacts', 'artifact_signals', 'checkpoints');