-- ============================================================================
-- Analytics Foundation: Vision Tracking & Activity Logging
-- ============================================================================

-- ============================================================================
-- Table: project_visions
-- Purpose: Capture every project vision entered, before roadmap generation
-- This is CORE BUSINESS DATA, not just analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS project_visions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- User context
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- The vision itself
  raw_vision TEXT NOT NULL,
  vision_length INTEGER NOT NULL,
  
  -- Context from form
  build_approach TEXT, -- 'platform', 'mobile', 'web', 'automation', 'auto'
  project_purpose TEXT, -- 'business', 'learning', 'personal'
  
  -- Lifecycle tracking (simple columns, not events)
  roadmap_generated_at TIMESTAMPTZ,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Metadata
  session_id TEXT,
  user_agent TEXT
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_visions_user 
  ON project_visions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_visions_created 
  ON project_visions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_visions_project 
  ON project_visions(project_id) WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_visions_funnel 
  ON project_visions(roadmap_generated_at, project_id);

-- Comments
COMMENT ON TABLE project_visions IS 'Captures every project vision entered by users, tracking the full funnel from idea to project';
COMMENT ON COLUMN project_visions.raw_vision IS 'The exact text the user entered as their project vision';
COMMENT ON COLUMN project_visions.roadmap_generated_at IS 'When a roadmap was successfully generated from this vision';
COMMENT ON COLUMN project_visions.project_id IS 'Links to the project created from this vision (if any)';


-- ============================================================================
-- Table: activity_log
-- Purpose: Flexible event logging for behavioral analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Context
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Event
  action TEXT NOT NULL, -- 'step_completed', 'artifact_uploaded', etc
  metadata JSONB DEFAULT '{}',
  
  -- Session tracking
  session_id TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_log_created 
  ON activity_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_project 
  ON activity_log(user_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_action 
  ON activity_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_project 
  ON activity_log(project_id, created_at DESC) 
  WHERE project_id IS NOT NULL;

-- GIN index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_activity_log_metadata 
  ON activity_log USING GIN (metadata);

-- Comments
COMMENT ON TABLE activity_log IS 'Flexible event log for tracking user activities and behavioral patterns';
COMMENT ON COLUMN activity_log.action IS 'Action type (e.g., step_completed, artifact_uploaded, completion_suggested)';
COMMENT ON COLUMN activity_log.metadata IS 'Flexible JSONB field for action-specific data';


-- ============================================================================
-- Materialized View: Daily Metrics
-- Purpose: Pre-computed daily statistics for dashboards
-- ============================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_metrics AS
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_visions,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(roadmap_generated_at) as roadmaps_generated,
  COUNT(project_id) as projects_created,
  ROUND(
    COUNT(roadmap_generated_at)::numeric / NULLIF(COUNT(*), 0) * 100, 
    2
  ) as roadmap_conversion_rate,
  ROUND(
    COUNT(project_id)::numeric / NULLIF(COUNT(*), 0) * 100, 
    2
  ) as project_conversion_rate
FROM project_visions
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_metrics_date 
  ON daily_metrics(date DESC);

-- Comments
COMMENT ON MATERIALIZED VIEW daily_metrics IS 'Daily aggregated metrics for vision-to-project funnel (refresh nightly)';


-- ============================================================================
-- Function: Refresh daily metrics
-- Purpose: Can be called manually or via cron
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_daily_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics;
END;
$$;

COMMENT ON FUNCTION refresh_daily_metrics IS 'Refreshes the daily_metrics materialized view';


-- ============================================================================
-- Row Level Security (RLS)
-- Purpose: Ensure users can only see their own data
-- ============================================================================

-- Enable RLS
ALTER TABLE project_visions ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own visions
CREATE POLICY "Users can view their own visions"
  ON project_visions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own visions
CREATE POLICY "Users can insert their own visions"
  ON project_visions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend operations)
CREATE POLICY "Service role has full access to visions"
  ON project_visions
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Policy: Users can view their own activity
CREATE POLICY "Users can view their own activity"
  ON activity_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for backend operations)
CREATE POLICY "Service role has full access to activity"
  ON activity_log
  FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');


-- ============================================================================
-- Grant permissions
-- ============================================================================
GRANT SELECT ON daily_metrics TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_daily_metrics TO service_role;
