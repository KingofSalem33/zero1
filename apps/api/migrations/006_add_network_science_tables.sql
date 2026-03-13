-- Network Science Tables for Gravity-Based Map Expansion
-- Adds verse_analytics (centrality metrics) and literary_structures (chiasm metadata)

-- ============================================
-- 1. VERSE_ANALYTICS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS verse_analytics (
  verse_id INT PRIMARY KEY REFERENCES verses(id) ON DELETE CASCADE,
  centrality_score FLOAT NOT NULL DEFAULT 0.1,
  pagerank_score FLOAT NOT NULL DEFAULT 0.1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verse_analytics_centrality
  ON verse_analytics(centrality_score);

COMMENT ON TABLE verse_analytics IS 'Precomputed graph metrics for verses (centrality, pagerank).';
COMMENT ON COLUMN verse_analytics.centrality_score IS 'Degree-based centrality score (0-1).';
COMMENT ON COLUMN verse_analytics.pagerank_score IS 'PageRank score (0-1).';

-- ============================================
-- 2. LITERARY_STRUCTURES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS literary_structures (
  id SERIAL PRIMARY KEY,
  structure_type VARCHAR(30) NOT NULL DEFAULT 'chiasm',
  name TEXT,
  center_verse_id INT REFERENCES verses(id) ON DELETE SET NULL,
  verse_ids INT[] NOT NULL DEFAULT '{}',
  json_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence FLOAT NOT NULL DEFAULT 0.9,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_literary_structures_center
  ON literary_structures(center_verse_id);

CREATE INDEX IF NOT EXISTS idx_literary_structures_verse_ids
  ON literary_structures USING GIN (verse_ids);

COMMENT ON TABLE literary_structures IS 'Chiastic/literary structure metadata for structural gravity.';
COMMENT ON COLUMN literary_structures.verse_ids IS 'All verse IDs in the structure (for fast containment lookup).';
COMMENT ON COLUMN literary_structures.json_mapping IS $$Label-to-verse mapping (e.g., {"A":123,"B":124,"C":125,"B'":126,"A'":127}).$$;
COMMENT ON COLUMN literary_structures.confidence IS 'Curated confidence for the structure (0-1).';
