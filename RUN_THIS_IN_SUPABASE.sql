-- ============================================================================
-- ZERO1 DATABASE SCHEMA - RUN THIS IN SUPABASE SQL EDITOR
-- ============================================================================
-- Instructions:
-- 1. Go to: https://supabase.com/dashboard/project/ciuxquemfnbruvvzbfth/sql/new
-- 2. Copy this entire file
-- 3. Paste into SQL Editor
-- 4. Click "Run" or press Ctrl/Cmd + Enter
-- ============================================================================

-- Projects table to store user project goals and status
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  goal text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
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

-- Artifacts table
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
  signals jsonb DEFAULT '{}'::jsonb,
  analysis jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'analyzing', 'analyzed', 'failed')),
  error_message text
);

-- Artifact signals table
CREATE TABLE IF NOT EXISTS artifact_signals (
  artifact_id uuid PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
  has_tests boolean DEFAULT false,
  has_linter boolean DEFAULT false,
  has_typescript boolean DEFAULT false,
  has_prettier boolean DEFAULT false,
  has_git boolean DEFAULT false,
  last_commit_time timestamptz,
  commit_count integer,
  has_deploy_config boolean DEFAULT false,
  deploy_platform text,
  file_count integer DEFAULT 0,
  folder_depth integer DEFAULT 0,
  readme_length integer DEFAULT 0,
  has_documentation boolean DEFAULT false,
  tech_stack jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Checkpoints table
CREATE TABLE IF NOT EXISTS checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text,
  reason text,
  created_by text DEFAULT 'system',
  current_phase text,
  completed_substeps jsonb DEFAULT '[]'::jsonb,
  roadmap_snapshot jsonb DEFAULT '{}'::jsonb,
  project_state_hash text,
  artifact_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_current_phase ON projects(current_phase);
CREATE INDEX IF NOT EXISTS idx_steps_project_id ON steps(project_id);
CREATE INDEX IF NOT EXISTS idx_steps_completed ON steps(completed);
CREATE INDEX IF NOT EXISTS idx_history_project_id ON history(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project_id ON artifacts(project_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_status ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
CREATE INDEX IF NOT EXISTS idx_checkpoints_project_id ON checkpoints(project_id);

-- Auto-checkpoint function
CREATE OR REPLACE FUNCTION auto_create_checkpoint()
RETURNS trigger AS $$
BEGIN
  IF OLD.current_phase IS DISTINCT FROM NEW.current_phase THEN
    INSERT INTO checkpoints (
      project_id, name, reason, created_by, current_phase,
      completed_substeps, roadmap_snapshot
    ) VALUES (
      NEW.id, 'Phase ' || NEW.current_phase || ' Complete',
      'Automatic checkpoint on phase completion', 'system',
      NEW.current_phase, NEW.completed_substeps, NEW.roadmap
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trigger_auto_checkpoint ON projects;
CREATE TRIGGER trigger_auto_checkpoint
  AFTER UPDATE OF current_phase ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_checkpoint();

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifact_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoints ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now, tighten later with auth)
DROP POLICY IF EXISTS projects_policy ON projects;
CREATE POLICY projects_policy ON projects FOR ALL USING (true);

DROP POLICY IF EXISTS steps_policy ON steps;
CREATE POLICY steps_policy ON steps FOR ALL USING (true);

DROP POLICY IF EXISTS history_policy ON history;
CREATE POLICY history_policy ON history FOR ALL USING (true);

DROP POLICY IF EXISTS artifacts_policy ON artifacts;
CREATE POLICY artifacts_policy ON artifacts FOR ALL USING (true);

DROP POLICY IF EXISTS artifact_signals_policy ON artifact_signals;
CREATE POLICY artifact_signals_policy ON artifact_signals FOR ALL USING (true);

DROP POLICY IF EXISTS checkpoints_policy ON checkpoints;
CREATE POLICY checkpoints_policy ON checkpoints FOR ALL USING (true);