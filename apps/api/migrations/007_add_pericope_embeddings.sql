-- ============================================================
-- PERICOPE EMBEDDINGS: Narrative-Level Semantic Search
-- ============================================================

-- 1. PERICOPE METADATA
CREATE TABLE IF NOT EXISTS pericopes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    range_start_id INT NOT NULL REFERENCES verses(id),
    range_end_id INT NOT NULL REFERENCES verses(id),
    source VARCHAR(50) NOT NULL,
    pericope_type VARCHAR(50),
    full_text TEXT NOT NULL,
    summary TEXT,
    themes TEXT[],
    key_figures TEXT[],
    testament VARCHAR(2) CHECK (testament IN ('OT', 'NT')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pericopes_range_start
  ON pericopes(range_start_id);
CREATE INDEX IF NOT EXISTS idx_pericopes_range_end
  ON pericopes(range_end_id);
CREATE INDEX IF NOT EXISTS idx_pericopes_source
  ON pericopes(source);
CREATE INDEX IF NOT EXISTS idx_pericopes_type
  ON pericopes(pericope_type);
CREATE INDEX IF NOT EXISTS idx_pericopes_testament
  ON pericopes(testament);
CREATE INDEX IF NOT EXISTS idx_pericopes_themes
  ON pericopes USING GIN(themes);

-- 2. VERSE-TO-PERICOPE MAPPING
CREATE TABLE IF NOT EXISTS verse_pericope_map (
    id SERIAL PRIMARY KEY,
    verse_id INT NOT NULL REFERENCES verses(id),
    pericope_id INT NOT NULL REFERENCES pericopes(id),
    source VARCHAR(50) NOT NULL,
    position_in_pericope INT,
    UNIQUE(verse_id, pericope_id, source)
);

CREATE INDEX IF NOT EXISTS idx_verse_pericope_verse
  ON verse_pericope_map(verse_id);
CREATE INDEX IF NOT EXISTS idx_verse_pericope_pericope
  ON verse_pericope_map(pericope_id);

-- 3. PERICOPE EMBEDDINGS
CREATE TABLE IF NOT EXISTS pericope_embeddings (
    id SERIAL PRIMARY KEY,
    pericope_id INT NOT NULL REFERENCES pericopes(id),
    embedding_type VARCHAR(50) NOT NULL,
    embedding vector(1536) NOT NULL,
    token_count INT,
    model_version VARCHAR(50) DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(pericope_id, embedding_type)
);

CREATE INDEX IF NOT EXISTS idx_pericope_embeddings_vector
ON pericope_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_pericope_embeddings_pericope
  ON pericope_embeddings(pericope_id);

-- 4. PERICOPE CONNECTIONS CACHE
CREATE TABLE IF NOT EXISTS pericope_connections (
    id SERIAL PRIMARY KEY,
    source_pericope_id INT NOT NULL REFERENCES pericopes(id),
    target_pericope_id INT NOT NULL REFERENCES pericopes(id),
    connection_type VARCHAR(50) NOT NULL,
    similarity_score FLOAT NOT NULL,
    ring_depth INT,
    contributing_verses INT[],
    shared_themes TEXT[],
    synopsis TEXT,
    synopsis_model VARCHAR(50),
    confidence FLOAT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_pericope_id, target_pericope_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_pericope_connections_source
  ON pericope_connections(source_pericope_id);
CREATE INDEX IF NOT EXISTS idx_pericope_connections_target
  ON pericope_connections(target_pericope_id);
CREATE INDEX IF NOT EXISTS idx_pericope_connections_type
  ON pericope_connections(connection_type);
CREATE INDEX IF NOT EXISTS idx_pericope_connections_score
  ON pericope_connections(similarity_score DESC);

-- 5. HELPER FUNCTIONS

CREATE OR REPLACE FUNCTION get_pericope_verses(p_pericope_id INT)
RETURNS TABLE(verse_id INT, text TEXT, reference VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.id,
        v.text,
        v.book_name || ' ' || v.chapter || ':' || v.verse AS reference
    FROM verses v
    JOIN verse_pericope_map vpm ON v.id = vpm.verse_id
    WHERE vpm.pericope_id = p_pericope_id
    ORDER BY v.id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION search_pericopes_by_embedding(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 10,
    embedding_type_filter VARCHAR DEFAULT 'full_text'
)
RETURNS TABLE(
    pericope_id INT,
    title VARCHAR,
    similarity FLOAT,
    range_ref VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.title,
        1 - (pe.embedding <=> query_embedding) AS similarity,
        vs.book_name || ' ' || vs.chapter || ':' || vs.verse ||
        ' - ' || ve.book_name || ' ' || ve.chapter || ':' || ve.verse AS range_ref
    FROM pericope_embeddings pe
    JOIN pericopes p ON pe.pericope_id = p.id
    JOIN verses vs ON p.range_start_id = vs.id
    JOIN verses ve ON p.range_end_id = ve.id
    WHERE
        pe.embedding_type = embedding_type_filter
        AND 1 - (pe.embedding <=> query_embedding) >= match_threshold
    ORDER BY pe.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE pericopes IS 'Narrative unit metadata (stories, parables, teachings)';
COMMENT ON TABLE pericope_embeddings IS 'Vector embeddings for narrative-level semantic search';
COMMENT ON TABLE pericope_connections IS 'Cached narrative-to-narrative connections';
COMMENT ON TABLE verse_pericope_map IS 'Many-to-many mapping of verses to pericopes';
