-- LLM-discovered connection edges (typology, pattern, etc.)

CREATE TABLE IF NOT EXISTS llm_connections (
  id SERIAL PRIMARY KEY,
  from_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  to_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  connection_type VARCHAR(20) NOT NULL,
  explanation TEXT NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_llm_connection UNIQUE (from_verse_id, to_verse_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_llm_connections_from ON llm_connections(from_verse_id);
CREATE INDEX IF NOT EXISTS idx_llm_connections_to ON llm_connections(to_verse_id);
CREATE INDEX IF NOT EXISTS idx_llm_connections_type ON llm_connections(connection_type);
CREATE INDEX IF NOT EXISTS idx_llm_connections_confidence ON llm_connections(confidence);

COMMENT ON TABLE llm_connections IS 'LLM-discovered typology/pattern connections for map enrichment';
COMMENT ON COLUMN llm_connections.connection_type IS 'TYPOLOGY, FULFILLMENT, CONTRAST, PROGRESSION, PATTERN';
COMMENT ON COLUMN llm_connections.confidence IS 'LLM confidence score (0-1)';
