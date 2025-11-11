-- ============================================================================
-- Zero1 Analytics Dashboard Queries
-- ============================================================================
-- This file contains useful SQL queries for analyzing user behavior and
-- product metrics. These queries can be used in Supabase SQL Editor or
-- integrated into a dashboard.
-- ============================================================================

-- ============================================================================
-- VISION FUNNEL ANALYSIS
-- ============================================================================

-- 1. Overall Vision-to-Project Conversion Funnel
-- Shows the full funnel from vision entry to project launch
SELECT
  COUNT(*) as total_visions,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(roadmap_generated_at) as roadmaps_generated,
  COUNT(project_id) as projects_created,
  ROUND(COUNT(roadmap_generated_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as roadmap_conversion_rate,
  ROUND(COUNT(project_id)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as project_conversion_rate
FROM project_visions;


-- 2. Daily Vision Funnel Metrics (from materialized view)
-- Pre-computed daily metrics for fast dashboard loading
SELECT * FROM daily_metrics
ORDER BY date DESC
LIMIT 30;


-- 3. Vision Conversion by Build Approach
-- Which build approaches have the highest conversion rates?
SELECT
  build_approach,
  COUNT(*) as total_visions,
  COUNT(roadmap_generated_at) as roadmaps_generated,
  ROUND(COUNT(roadmap_generated_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as conversion_rate
FROM project_visions
GROUP BY build_approach
ORDER BY conversion_rate DESC;


-- 4. Vision Conversion by Project Purpose
-- Are business projects more likely to complete than learning projects?
SELECT
  project_purpose,
  COUNT(*) as total_visions,
  COUNT(roadmap_generated_at) as roadmaps_generated,
  ROUND(COUNT(roadmap_generated_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as conversion_rate
FROM project_visions
GROUP BY project_purpose
ORDER BY conversion_rate DESC;


-- ============================================================================
-- POPULAR PROJECT IDEAS
-- ============================================================================

-- 5. What Are People Building? (Most Common Keywords in Visions)
-- Extract common themes from project visions
SELECT
  word,
  COUNT(*) as frequency
FROM (
  SELECT LOWER(unnest(string_to_array(raw_vision, ' '))) as word
  FROM project_visions
) words
WHERE LENGTH(word) > 4  -- Filter out short words
  AND word NOT IN ('about', 'using', 'could', 'would', 'should', 'there', 'where', 'these', 'those')
GROUP BY word
ORDER BY frequency DESC
LIMIT 50;


-- 6. Vision Length vs Success Rate
-- Do longer or shorter visions convert better?
SELECT
  CASE
    WHEN vision_length < 50 THEN 'Very Short (< 50 chars)'
    WHEN vision_length < 100 THEN 'Short (50-100 chars)'
    WHEN vision_length < 200 THEN 'Medium (100-200 chars)'
    WHEN vision_length < 400 THEN 'Long (200-400 chars)'
    ELSE 'Very Long (400+ chars)'
  END as vision_length_bucket,
  COUNT(*) as total_visions,
  COUNT(roadmap_generated_at) as roadmaps_generated,
  ROUND(COUNT(roadmap_generated_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as conversion_rate,
  ROUND(AVG(vision_length), 0) as avg_chars
FROM project_visions
GROUP BY vision_length_bucket
ORDER BY avg_chars ASC;


-- ============================================================================
-- USER ENGAGEMENT & RETENTION
-- ============================================================================

-- 7. New vs Returning Users (Weekly)
-- Track user acquisition and retention
SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(DISTINCT user_id) as total_users,
  COUNT(DISTINCT CASE WHEN user_first_vision THEN user_id END) as new_users,
  COUNT(DISTINCT CASE WHEN NOT user_first_vision THEN user_id END) as returning_users
FROM (
  SELECT
    user_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) = 1 as user_first_vision
  FROM project_visions
) user_visions
GROUP BY week
ORDER BY week DESC
LIMIT 12;


-- 8. User Cohort Retention
-- How many users who created a vision in Week 0 came back in Week 1, 2, 3?
WITH first_vision AS (
  SELECT
    user_id,
    DATE_TRUNC('week', MIN(created_at)) as cohort_week
  FROM project_visions
  GROUP BY user_id
),
user_weeks AS (
  SELECT DISTINCT
    pv.user_id,
    DATE_TRUNC('week', pv.created_at) as activity_week
  FROM project_visions pv
)
SELECT
  fv.cohort_week,
  COUNT(DISTINCT fv.user_id) as cohort_size,
  COUNT(DISTINCT CASE WHEN uw.activity_week = fv.cohort_week + INTERVAL '1 week' THEN uw.user_id END) as week_1_retained,
  COUNT(DISTINCT CASE WHEN uw.activity_week = fv.cohort_week + INTERVAL '2 weeks' THEN uw.user_id END) as week_2_retained,
  COUNT(DISTINCT CASE WHEN uw.activity_week = fv.cohort_week + INTERVAL '3 weeks' THEN uw.user_id END) as week_3_retained
FROM first_vision fv
LEFT JOIN user_weeks uw ON fv.user_id = uw.user_id
GROUP BY fv.cohort_week
ORDER BY fv.cohort_week DESC
LIMIT 8;


-- ============================================================================
-- ACTIVITY LOG ANALYSIS
-- ============================================================================

-- 9. Most Common User Actions
-- What are users doing in the product?
SELECT
  action,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT project_id) as unique_projects
FROM activity_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY action
ORDER BY event_count DESC;


-- 10. Step Completion Patterns
-- How long does it take users to complete steps on average?
WITH step_completions AS (
  SELECT
    project_id,
    (metadata->>'stepNumber')::int as step_number,
    created_at
  FROM activity_log
  WHERE action = 'step.completed'
),
step_durations AS (
  SELECT
    project_id,
    step_number,
    created_at - LAG(created_at) OVER (PARTITION BY project_id ORDER BY step_number) as time_to_complete
  FROM step_completions
)
SELECT
  step_number,
  COUNT(*) as completions,
  ROUND(EXTRACT(EPOCH FROM AVG(time_to_complete)) / 60, 2) as avg_minutes_to_complete,
  ROUND(EXTRACT(EPOCH FROM PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY time_to_complete)) / 60, 2) as median_minutes_to_complete
FROM step_durations
WHERE time_to_complete IS NOT NULL
  AND time_to_complete < INTERVAL '7 days'  -- Filter outliers
GROUP BY step_number
ORDER BY step_number;


-- 11. Completion Suggestion Effectiveness
-- When we suggest completion, do users accept it?
SELECT
  COUNT(*) as total_suggestions,
  COUNT(*) FILTER (WHERE action = 'completion.accepted') as accepted,
  COUNT(*) FILTER (WHERE action = 'completion.rejected') as rejected,
  ROUND(
    COUNT(*) FILTER (WHERE action = 'completion.accepted')::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as acceptance_rate,
  ROUND(AVG((metadata->>'confidence')::numeric), 2) as avg_confidence_score
FROM activity_log
WHERE action IN ('completion.suggested', 'completion.accepted', 'completion.rejected')
  AND created_at > NOW() - INTERVAL '30 days';


-- 12. Artifact Upload & Analysis Patterns
-- How many artifacts do users upload? What quality scores do they get?
SELECT
  COUNT(*) FILTER (WHERE action = 'artifact.uploaded') as total_uploads,
  COUNT(*) FILTER (WHERE action = 'artifact.analyzed') as total_analyzed,
  ROUND(AVG((metadata->>'qualityScore')::numeric), 2) as avg_quality_score,
  COUNT(*) FILTER (WHERE (metadata->>'suggestCompletion')::boolean = true) as suggested_completions,
  ROUND(
    COUNT(*) FILTER (WHERE (metadata->>'suggestCompletion')::boolean = true)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE action = 'artifact.analyzed'), 0) * 100,
    2
  ) as suggestion_rate
FROM activity_log
WHERE action IN ('artifact.uploaded', 'artifact.analyzed')
  AND created_at > NOW() - INTERVAL '30 days';


-- ============================================================================
-- PROJECT SUCCESS METRICS
-- ============================================================================

-- 13. Project Completion Rate
-- How many projects make it to the finish line?
SELECT
  COUNT(*) as total_projects,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_projects,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed')::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as completion_rate
FROM projects;


-- 14. Time to First Step Completion
-- How long after project creation do users complete their first step?
WITH first_steps AS (
  SELECT
    al.project_id,
    MIN(al.created_at) as first_step_completed_at,
    p.created_at as project_created_at
  FROM activity_log al
  JOIN projects p ON al.project_id = p.id
  WHERE al.action = 'step.completed'
  GROUP BY al.project_id, p.created_at
)
SELECT
  COUNT(*) as projects_with_completions,
  ROUND(EXTRACT(EPOCH FROM AVG(first_step_completed_at - project_created_at)) / 60, 2) as avg_minutes_to_first_step,
  ROUND(EXTRACT(EPOCH FROM PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY first_step_completed_at - project_created_at)) / 60, 2) as median_minutes_to_first_step
FROM first_steps
WHERE (first_step_completed_at - project_created_at) < INTERVAL '7 days';


-- 15. Most Active Users
-- Who are your power users?
SELECT
  user_id,
  COUNT(DISTINCT project_id) as total_projects,
  COUNT(*) FILTER (WHERE action LIKE 'step.%') as step_actions,
  COUNT(*) FILTER (WHERE action LIKE 'artifact.%') as artifact_actions,
  MAX(created_at) as last_active
FROM activity_log
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY step_actions + artifact_actions DESC
LIMIT 20;


-- ============================================================================
-- ROADMAP GENERATION PERFORMANCE
-- ============================================================================

-- 16. Roadmap Generation Success Rate
-- How often does roadmap generation succeed vs fail?
SELECT
  COUNT(*) FILTER (WHERE action = 'roadmap.generation_started') as started,
  COUNT(*) FILTER (WHERE action = 'roadmap.generated') as succeeded,
  COUNT(*) FILTER (WHERE action = 'roadmap.generation_failed') as failed,
  ROUND(
    COUNT(*) FILTER (WHERE action = 'roadmap.generated')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE action = 'roadmap.generation_started'), 0) * 100,
    2
  ) as success_rate,
  ROUND(AVG((metadata->>'generationTimeMs')::numeric / 1000), 2) as avg_generation_time_seconds
FROM activity_log
WHERE action IN ('roadmap.generation_started', 'roadmap.generated', 'roadmap.generation_failed')
  AND created_at > NOW() - INTERVAL '30 days';


-- 17. Roadmap Complexity Distribution
-- How complex are the roadmaps we're generating?
SELECT
  CASE
    WHEN (metadata->>'stepCount')::int < 5 THEN 'Simple (< 5 steps)'
    WHEN (metadata->>'stepCount')::int < 10 THEN 'Medium (5-10 steps)'
    WHEN (metadata->>'stepCount')::int < 20 THEN 'Complex (10-20 steps)'
    ELSE 'Very Complex (20+ steps)'
  END as complexity_bucket,
  COUNT(*) as roadmaps_generated,
  ROUND(AVG((metadata->>'stepCount')::numeric), 1) as avg_steps,
  ROUND(AVG((metadata->>'generationTimeMs')::numeric / 1000), 2) as avg_generation_time_seconds
FROM activity_log
WHERE action = 'roadmap.generated'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY complexity_bucket
ORDER BY avg_steps ASC;


-- ============================================================================
-- HELPER QUERIES FOR MANUAL INVESTIGATION
-- ============================================================================

-- 18. Recent Failed Roadmap Generations
-- Investigate recent failures to improve reliability
SELECT
  created_at,
  user_id,
  metadata->>'visionId' as vision_id,
  metadata->>'errorMessage' as error_message,
  metadata->>'failedAtMs' as failed_at_ms
FROM activity_log
WHERE action = 'roadmap.generation_failed'
ORDER BY created_at DESC
LIMIT 50;


-- 19. User Journey for a Specific Project
-- Deep dive into a single project's timeline
-- Replace 'PROJECT_ID_HERE' with actual project ID
SELECT
  created_at,
  action,
  metadata
FROM activity_log
WHERE project_id = 'PROJECT_ID_HERE'
ORDER BY created_at ASC;


-- 20. Vision Details for High-Converting Users
-- What did successful users want to build?
SELECT
  pv.raw_vision,
  pv.build_approach,
  pv.project_purpose,
  pv.created_at,
  p.status as project_status
FROM project_visions pv
LEFT JOIN projects p ON pv.project_id = p.id
WHERE pv.roadmap_generated_at IS NOT NULL
ORDER BY pv.created_at DESC
LIMIT 100;


-- ============================================================================
-- PERFORMANCE & CLEANUP
-- ============================================================================

-- Refresh the materialized view (run this daily via cron or manually)
-- SELECT refresh_daily_metrics();

-- Get table sizes to monitor growth
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('project_visions', 'activity_log', 'daily_metrics')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
