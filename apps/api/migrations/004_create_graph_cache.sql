--
-- Materialized Graph Cache
--
-- Pre-computes the top N connections for every verse in the Bible.
-- This eliminates the need to calculate Ring 1-3 connections on every request.
--
-- Performance Impact:
-- - OLD: 200-400ms per graph request (real-time BFS traversal)
-- - NEW: 10-20ms per graph request (simple SELECT from cache)
--

CREATE TABLE IF NOT EXISTS related_verses_cache (
  id SERIAL PRIMARY KEY,
  source_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  target_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  edge_type VARCHAR(20) NOT NULL, -- 'DEEPER', 'ROOTS', 'ECHOES', 'SEMANTIC'
  similarity_score FLOAT NOT NULL, -- 0.0 to 1.0
  ring_depth INT NOT NULL, -- 1, 2, or 3
  metadata JSONB, -- Additional data (e.g., Strong's number, quote type)
  created_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicate edges
  CONSTRAINT unique_cached_edge UNIQUE (source_verse_id, target_verse_id, edge_type)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_cache_source
  ON related_verses_cache(source_verse_id);

CREATE INDEX IF NOT EXISTS idx_cache_source_ring
  ON related_verses_cache(source_verse_id, ring_depth);

CREATE INDEX IF NOT EXISTS idx_cache_source_type
  ON related_verses_cache(source_verse_id, edge_type);

CREATE INDEX IF NOT EXISTS idx_cache_target
  ON related_verses_cache(target_verse_id);

-- Composite index for common query pattern: get all edges for a verse of specific type
CREATE INDEX IF NOT EXISTS idx_cache_source_type_ring
  ON related_verses_cache(source_verse_id, edge_type, ring_depth);

--
-- Function to fetch cached edges for a verse
-- This replaces the complex graph traversal logic
--
CREATE OR REPLACE FUNCTION get_cached_edges(
  p_source_verse_id INT,
  p_edge_types VARCHAR[] DEFAULT ARRAY['DEEPER', 'ROOTS', 'ECHOES'],
  p_max_ring_depth INT DEFAULT 3,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  target_verse_id INT,
  edge_type VARCHAR,
  similarity_score FLOAT,
  ring_depth INT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.target_verse_id,
    rc.edge_type,
    rc.similarity_score,
    rc.ring_depth,
    rc.metadata
  FROM related_verses_cache rc
  WHERE rc.source_verse_id = p_source_verse_id
    AND rc.edge_type = ANY(p_edge_types)
    AND rc.ring_depth <= p_max_ring_depth
  ORDER BY rc.ring_depth ASC, rc.similarity_score DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

--
-- Stats view for monitoring cache coverage
--
CREATE OR REPLACE VIEW cache_stats AS
SELECT
  COUNT(DISTINCT source_verse_id) as verses_cached,
  COUNT(*) as total_edges,
  AVG(similarity_score) as avg_score,
  COUNT(*) FILTER (WHERE edge_type = 'DEEPER') as deeper_edges,
  COUNT(*) FILTER (WHERE edge_type = 'ROOTS') as roots_edges,
  COUNT(*) FILTER (WHERE edge_type = 'ECHOES') as echoes_edges,
  COUNT(*) FILTER (WHERE edge_type = 'SEMANTIC') as semantic_edges,
  COUNT(*) FILTER (WHERE ring_depth = 1) as ring1_edges,
  COUNT(*) FILTER (WHERE ring_depth = 2) as ring2_edges,
  COUNT(*) FILTER (WHERE ring_depth = 3) as ring3_edges
FROM related_verses_cache;

COMMENT ON TABLE related_verses_cache IS 'Pre-computed graph connections for instant verse relationship queries';
COMMENT ON COLUMN related_verses_cache.ring_depth IS '1 = direct connections, 2 = connections of connections, 3 = deep thematic links';
COMMENT ON COLUMN related_verses_cache.similarity_score IS 'Strength of connection (0.0-1.0), higher = stronger';
COMMENT ON FUNCTION get_cached_edges IS 'Fast lookup of pre-computed edges for a verse, replacing real-time graph traversal';
