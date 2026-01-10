-- Migration: Create verse_analytics table for pre-computed network metrics
-- Date: 2025-01-08
-- Sprint: 1 (Offline Centrality + Hub Prominence)

-- ============================================================================
-- TABLE: verse_analytics
-- ============================================================================
-- Stores pre-computed network analytics for verses
-- Enables fast lookup of centrality, degree, and future metrics (PageRank, communities)

CREATE TABLE IF NOT EXISTS verse_analytics (
  verse_id INTEGER PRIMARY KEY REFERENCES verses(id) ON DELETE CASCADE,

  -- Centrality metrics
  degree INTEGER NOT NULL DEFAULT 0,
  centrality_score REAL NOT NULL DEFAULT 0.1,

  -- Reserved for future sprints
  pagerank_score REAL,
  community_id INTEGER,

  -- Metadata
  computed_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup by centrality (for finding hubs)
CREATE INDEX idx_verse_analytics_centrality
  ON verse_analytics(centrality_score DESC);

-- Fast lookup by degree
CREATE INDEX idx_verse_analytics_degree
  ON verse_analytics(degree DESC);

-- ============================================================================
-- FUNCTION: compute_verse_centrality
-- ============================================================================
-- Computes degree centrality for all verses
-- Degree centrality = (number of incoming references) / (max references to any verse)
--
-- Returns: Table with (verse_id, degree, centrality_score)

CREATE OR REPLACE FUNCTION compute_verse_centrality()
RETURNS TABLE(verse_id INTEGER, degree BIGINT, centrality_score REAL) AS $$
BEGIN
  RETURN QUERY
  WITH degree_counts AS (
    -- Count incoming edges for each verse (how many verses reference this one)
    SELECT
      target_id as vid,
      COUNT(DISTINCT source_id) as deg
    FROM cross_references
    GROUP BY target_id
  ),
  max_degree AS (
    -- Find the most-referenced verse
    SELECT MAX(deg) as max_deg FROM degree_counts
  )
  SELECT
    dc.vid::INTEGER as verse_id,
    dc.deg as degree,
    CASE
      WHEN md.max_deg > 0 THEN (dc.deg::REAL / md.max_deg::REAL)
      ELSE 0.1
    END as centrality_score
  FROM degree_counts dc
  CROSS JOIN max_degree md;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: centrality_stats
-- ============================================================================
-- Returns average and median centrality scores
-- Useful for analysis and validation

CREATE OR REPLACE FUNCTION centrality_stats()
RETURNS TABLE(avg REAL, median REAL) AS $$
BEGIN
  RETURN QUERY
  WITH ordered AS (
    SELECT centrality_score,
           ROW_NUMBER() OVER (ORDER BY centrality_score) as row_num,
           COUNT(*) OVER() as total_count
    FROM verse_analytics
  )
  SELECT
    (SELECT AVG(centrality_score) FROM verse_analytics)::REAL as avg,
    (SELECT centrality_score
     FROM ordered
     WHERE row_num = (total_count + 1) / 2)::REAL as median;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE verse_analytics IS
  'Pre-computed network analytics for verses (centrality, communities, PageRank)';

COMMENT ON COLUMN verse_analytics.verse_id IS
  'Foreign key to verses table';

COMMENT ON COLUMN verse_analytics.degree IS
  'Number of distinct verses that reference this verse (incoming edge count)';

COMMENT ON COLUMN verse_analytics.centrality_score IS
  'Normalized degree centrality (0-1), where 1.0 = most connected verse in the Bible';

COMMENT ON COLUMN verse_analytics.pagerank_score IS
  'Reserved for future: PageRank score (iterative importance measure)';

COMMENT ON COLUMN verse_analytics.community_id IS
  'Reserved for future: Louvain community cluster ID (doctrine grouping)';

COMMENT ON FUNCTION compute_verse_centrality IS
  'Computes degree centrality for all verses based on cross_references table';

COMMENT ON FUNCTION centrality_stats IS
  'Returns average and median centrality scores for analysis';
