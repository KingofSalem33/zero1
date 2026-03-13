-- ============================================================
-- Fix pericope search function return types
-- ============================================================

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
        p.title::varchar,
        1 - (pe.embedding <=> query_embedding) AS similarity,
        (
          vs.book_name || ' ' || vs.chapter || ':' || vs.verse ||
          ' - ' || ve.book_name || ' ' || ve.chapter || ':' || ve.verse
        )::varchar AS range_ref
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
