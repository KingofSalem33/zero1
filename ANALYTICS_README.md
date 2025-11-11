# Zero1 Analytics Foundation

## Overview

This analytics foundation captures critical business intelligence to create a competitive moat for Zero1. The system tracks the full user journey from initial vision to project launch, providing insights into what users want to build, how they progress, and where they succeed or struggle.

## What We Capture

### 1. **Vision Data** (Most Critical)

- Every project vision users enter **before** roadmap generation
- Captures what people want to build even if roadmap generation fails
- Includes context: build approach, project purpose, vision length
- Creates a dataset of market demand and user intent

### 2. **Activity Events** (Behavioral Intelligence)

- Roadmap generation (start, success, failure)
- Step completions with timing data
- Artifact uploads and analysis results
- Completion suggestion feedback loops
- Project milestones and completions

## Architecture

### Three-Tier Design

1. **Tier 1: Core Business Data** (Normalized Tables)
   - `project_visions` - Every vision entered
   - Strong typing, relationships, fast queries

2. **Tier 2: Behavioral Events** (Flexible Logging)
   - `activity_log` - All user actions with JSONB metadata
   - Fire-and-forget logging (never breaks the app)
   - Type-safe action constants for consistency

3. **Tier 3: Computed Metrics** (Performance)
   - `daily_metrics` - Materialized view for dashboards
   - Pre-computed conversion rates and trends
   - Refresh nightly or on-demand

## Files Created

### Database Schema

- **`apps/api/supabase/migrations/20250210_analytics_foundation.sql`**
  - Complete schema with tables, indexes, RLS policies
  - Materialized view for daily metrics
  - Run manually in Supabase Dashboard

### Backend Services

- **`apps/api/src/services/ActivityLogger.ts`**
  - `captureVision()` - Capture vision before roadmap generation
  - `linkVisionToProject()` - Link vision to created project
  - `logActivity()` - Fire-and-forget event logging
  - Type-safe `ActivityActions` constants

### Analytics Queries

- **`apps/api/supabase/analytics_queries.sql`**
  - 20 ready-to-use SQL queries for insights:
    - Vision funnel analysis
    - Popular project ideas
    - User engagement & retention
    - Step completion patterns
    - Completion suggestion effectiveness
    - Roadmap generation performance
    - And more...

## Integration Points

### 1. Project Creation (`apps/api/src/routes/roadmap-v2.ts`)

- **Before roadmap generation**: Capture vision
- **On generation start**: Log event with metadata
- **On success**: Link vision to project, log success with timing
- **On failure**: Log error for investigation

### 2. Step Completion (`apps/api/src/routes/roadmap-v2.ts`)

- **On manual completion**: Log with step details
- Tracks completion patterns and timing

### 3. Completion Suggestions (`apps/api/src/routes/roadmap-v2.ts`)

- **When AI suggests completion**: Log confidence score
- Enables feedback loop analysis

### 4. Artifact Uploads (`apps/api/src/routes/artifacts.ts`)

- **On file upload**: Log artifact type and size
- **On repo clone**: Log repo URL and branch
- **On analysis complete**: Log quality score and suggestions

### 5. Project Completion (`apps/api/src/routes/roadmap-v2.ts`)

- **When all steps complete**: Log final metrics

## How to Use

### 1. Run the Migration

```bash
# Navigate to Supabase Dashboard
# Go to: https://[your-project].supabase.co/project/_/sql
# Copy contents of: apps/api/supabase/migrations/20250210_analytics_foundation.sql
# Paste and click "Run"
```

### 2. Verify Tables Created

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('project_visions', 'activity_log', 'daily_metrics');
```

### 3. Test Vision Capture

Create a new project via the API and check that vision was captured:

```sql
SELECT * FROM project_visions ORDER BY created_at DESC LIMIT 5;
```

### 4. Check Activity Events

```sql
SELECT action, COUNT(*) as event_count
FROM activity_log
GROUP BY action
ORDER BY event_count DESC;
```

### 5. Run Dashboard Queries

All queries are in `apps/api/supabase/analytics_queries.sql`

Key queries to start with:

- **Query 1**: Overall Vision-to-Project Conversion Funnel
- **Query 2**: Daily Vision Funnel Metrics
- **Query 5**: What Are People Building?
- **Query 9**: Most Common User Actions
- **Query 13**: Project Completion Rate

## Data Privacy & Security

### Row-Level Security (RLS)

- Users can only see their own visions and activity
- Service role (backend) has full access for operations
- All queries respect RLS policies

### Fire-and-Forget Logging

- Analytics failures never break the app
- Errors logged to console but execution continues
- Non-blocking async operations

## Performance Considerations

### Indexes

- Strategic indexes on user_id, project_id, created_at
- GIN index on JSONB metadata for flexible queries
- Materialized view for expensive aggregations

### Materialized View Refresh

```sql
-- Refresh daily metrics (run nightly via cron)
SELECT refresh_daily_metrics();
```

## Key Insights You Can Get

### Product Intelligence

- **What do users want to build?** (Vision data analysis)
- **Where do users drop off?** (Funnel analysis)
- **Which features drive engagement?** (Activity patterns)
- **How effective are AI suggestions?** (Completion suggestion feedback)

### Growth Metrics

- **Daily/Weekly Active Users**
- **Vision → Roadmap → Project conversion rates**
- **User cohort retention**
- **Time to first value** (first step completion)

### Quality Metrics

- **Roadmap generation success rate**
- **Average steps per project**
- **Artifact quality scores**
- **Project completion rates**

### Competitive Moat

- **Dataset of user intent**: What beginners want to build
- **Behavioral patterns**: How they learn and progress
- **Success patterns**: What works, what doesn't
- **Market intelligence**: Trending technologies and approaches

## Next Steps

### Phase 1: Manual Analysis (Now)

- Run SQL queries in Supabase Dashboard
- Export to CSV for deeper analysis
- Identify initial patterns and insights

### Phase 2: Internal Dashboard (Later)

- Build admin dashboard with key metrics
- Automated daily/weekly reports
- Real-time monitoring of key funnels

### Phase 3: Product Improvements (Ongoing)

- Use insights to improve roadmap generation
- Optimize completion detection based on patterns
- Personalize experiences based on user behavior

## Example Queries

### Find High-Converting User Journeys

```sql
-- Users who went from vision to completed project
SELECT
  pv.user_id,
  pv.raw_vision,
  pv.created_at as vision_created,
  p.created_at as project_created,
  p.status as project_status
FROM project_visions pv
JOIN projects p ON pv.project_id = p.id
WHERE p.status = 'completed'
ORDER BY pv.created_at DESC;
```

### Analyze Roadmap Generation Performance

```sql
-- Success rate and timing by complexity
SELECT
  CASE
    WHEN (metadata->>'stepCount')::int < 10 THEN 'Simple'
    WHEN (metadata->>'stepCount')::int < 20 THEN 'Medium'
    ELSE 'Complex'
  END as complexity,
  COUNT(*) as generations,
  ROUND(AVG((metadata->>'generationTimeMs')::numeric / 1000), 2) as avg_seconds
FROM activity_log
WHERE action = 'roadmap.generated'
GROUP BY complexity;
```

### Track User Engagement Over Time

```sql
-- Weekly active users
SELECT
  DATE_TRUNC('week', created_at) as week,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_actions
FROM activity_log
GROUP BY week
ORDER BY week DESC;
```

## Troubleshooting

### No Data Appearing?

1. Check that migration ran successfully
2. Verify API server is using latest code
3. Check console logs for ActivityLogger errors
4. Ensure RLS policies allow your queries

### Slow Queries?

1. Refresh materialized view: `SELECT refresh_daily_metrics();`
2. Check index usage with EXPLAIN ANALYZE
3. Add date filters to large queries
4. Consider additional indexes for common queries

## Contributing

When adding new analytics:

1. Add action constant to `ActivityActions` in ActivityLogger.ts
2. Call `logActivity()` at the appropriate point
3. Update this README with the new event
4. Add relevant dashboard queries to analytics_queries.sql

---

**Built with**: Supabase PostgreSQL + Fire-and-Forget Logging
**Philosophy**: Simple, non-blocking, privacy-respecting analytics
**Goal**: Create a competitive moat through user intelligence
