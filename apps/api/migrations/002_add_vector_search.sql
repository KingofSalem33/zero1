-- Add vector search capabilities for semantic verse lookup
-- This enables fast, accurate anchor verse finding using embeddings

-- ============================================
-- 1. ENABLE PGVECTOR EXTENSION
-- ============================================
-- pgvector adds support for vector similarity search
-- Requires pgvector to be installed on your PostgreSQL instance
-- Supabase has this pre-installed

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 2. ADD EMBEDDING COLUMN TO VERSES
-- ============================================
-- OpenAI text-embedding-3-small produces 1536-dimensional vectors
-- We'll store these for semantic similarity search

ALTER TABLE verses
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ============================================
-- 3. CREATE INDEX FOR VECTOR SEARCH
-- ============================================
-- HNSW (Hierarchical Navigable Small World) index for fast approximate nearest neighbor search
-- cosine distance is best for OpenAI embeddings (they're normalized)

CREATE INDEX IF NOT EXISTS idx_verses_embedding
ON verses
USING hnsw (embedding vector_cosine_ops);

-- ============================================
-- 4. SEMANTIC SEARCH FUNCTION
-- ============================================
-- Search for verses semantically similar to a query embedding
-- Returns top N most similar verses with their similarity scores

CREATE OR REPLACE FUNCTION search_verses_by_embedding(
  query_embedding vector(1536),
  match_limit INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
  id INT,
  book_abbrev VARCHAR,
  book_name VARCHAR,
  chapter INT,
  verse INT,
  text TEXT,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.book_abbrev,
    v.book_name,
    v.chapter,
    v.verse,
    v.text,
    1 - (v.embedding <=> query_embedding) AS similarity
  FROM verses v
  WHERE v.embedding IS NOT NULL
    AND 1 - (v.embedding <=> query_embedding) > similarity_threshold
  ORDER BY v.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 5. COMMENTS (Documentation)
-- ============================================

COMMENT ON COLUMN verses.embedding IS 'OpenAI text-embedding-3-small vector (1536 dims) for semantic search';
COMMENT ON FUNCTION search_verses_by_embedding IS 'Find verses semantically similar to query embedding using cosine similarity';

-- ============================================
-- 6. USAGE NOTES
-- ============================================

-- To use this migration:
-- 1. Run this SQL on your Supabase database
-- 2. Generate embeddings for all verses using the populate script
-- 3. Use search_verses_by_embedding() to find anchor verses

-- Example query:
-- SELECT * FROM search_verses_by_embedding(
--   '[0.1, 0.2, ...]'::vector(1536),  -- query embedding from OpenAI
--   5,                                 -- return top 5 matches
--   0.5                                -- minimum 50% similarity
-- );
