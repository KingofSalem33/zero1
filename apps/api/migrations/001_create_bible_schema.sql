-- Bible Schema: Verses and Cross-References
-- Phase 1: Expanding Ring Architecture

-- ============================================
-- 1. VERSES TABLE
-- ============================================
-- Sequential ID for graph traversal, indexed by book/chapter/verse for lookups

CREATE TABLE IF NOT EXISTS verses (
  id SERIAL PRIMARY KEY,
  book_abbrev VARCHAR(10) NOT NULL,  -- "gn", "ex", "jn", etc.
  book_name VARCHAR(50) NOT NULL,     -- "Genesis", "Exodus", "John"
  chapter INT NOT NULL,
  verse INT NOT NULL,
  text TEXT NOT NULL,

  -- Composite unique constraint
  CONSTRAINT unique_verse UNIQUE (book_abbrev, chapter, verse)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_verses_book_chapter ON verses(book_abbrev, chapter);
CREATE INDEX IF NOT EXISTS idx_verses_ref ON verses(book_abbrev, chapter, verse);

-- ============================================
-- 2. CROSS-REFERENCES TABLE
-- ============================================
-- Directed edges from one verse to another

CREATE TABLE IF NOT EXISTS cross_references (
  id SERIAL PRIMARY KEY,
  from_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  to_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,

  -- Prevent duplicate edges
  CONSTRAINT unique_cross_ref UNIQUE (from_verse_id, to_verse_id)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_xref_from ON cross_references(from_verse_id);
CREATE INDEX IF NOT EXISTS idx_xref_to ON cross_references(to_verse_id);

-- Composite index for bidirectional lookups
CREATE INDEX IF NOT EXISTS idx_xref_bidirectional ON cross_references(from_verse_id, to_verse_id);

-- ============================================
-- 3. HELPER FUNCTIONS
-- ============================================

-- Function to get verse ID by reference
CREATE OR REPLACE FUNCTION get_verse_id(
  p_book VARCHAR,
  p_chapter INT,
  p_verse INT
) RETURNS INT AS $$
  SELECT id FROM verses
  WHERE book_abbrev = LOWER(p_book)
    AND chapter = p_chapter
    AND verse = p_verse
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to get surrounding context (Ring 0)
CREATE OR REPLACE FUNCTION get_verse_context(
  p_verse_id INT,
  p_radius INT DEFAULT 3
) RETURNS TABLE(id INT, book_abbrev VARCHAR, book_name VARCHAR, chapter INT, verse INT, text TEXT) AS $$
  SELECT id, book_abbrev, book_name, chapter, verse, text
  FROM verses
  WHERE id BETWEEN p_verse_id - p_radius AND p_verse_id + p_radius
  ORDER BY id;
$$ LANGUAGE SQL STABLE;

-- ============================================
-- 4. COMMENTS (Documentation)
-- ============================================

COMMENT ON TABLE verses IS 'KJV Bible verses with sequential IDs for graph traversal';
COMMENT ON TABLE cross_references IS 'Directed graph edges between verses (343k from OpenBible.info)';
COMMENT ON COLUMN verses.id IS 'Sequential ID for efficient range queries (Ring 0 context)';
COMMENT ON COLUMN cross_references.from_verse_id IS 'Source verse (the verse that references)';
COMMENT ON COLUMN cross_references.to_verse_id IS 'Target verse (the verse being referenced)';
