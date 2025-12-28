-- Edge Type Tables for Multi-Strand Visualization
-- Adds ROOTS (lexical), ECHOES (citations), PROPHECY, and GENEALOGY edge types

-- ============================================
-- 1. VERSE_STRONGS TABLE (for ROOTS edges)
-- ============================================
-- Maps verses to Strong's concordance numbers for lexical connections

CREATE TABLE IF NOT EXISTS verse_strongs (
  id SERIAL PRIMARY KEY,
  verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  strongs_number VARCHAR(10) NOT NULL,  -- e.g., "H1234" (Hebrew) or "G5678" (Greek)
  position INT,  -- Position of word in verse (optional, for word-level precision)

  -- Prevent duplicate Strong's numbers for same verse
  CONSTRAINT unique_verse_strongs UNIQUE (verse_id, strongs_number, position)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_verse_strongs_verse ON verse_strongs(verse_id);
CREATE INDEX IF NOT EXISTS idx_verse_strongs_number ON verse_strongs(strongs_number);

COMMENT ON TABLE verse_strongs IS 'Strong''s concordance numbers for each verse (for ROOTS edge type)';
COMMENT ON COLUMN verse_strongs.strongs_number IS 'Strong''s number (H#### for Hebrew, G#### for Greek)';
COMMENT ON COLUMN verse_strongs.position IS 'Word position in verse (1-based, nullable)';

-- ============================================
-- 2. CITATIONS TABLE (for ECHOES edges)
-- ============================================
-- Tracks NT verses that quote or reference OT verses

CREATE TABLE IF NOT EXISTS citations (
  id SERIAL PRIMARY KEY,
  ot_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  nt_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  quote_type VARCHAR(20),  -- 'direct', 'allusion', 'paraphrase', etc.

  -- Prevent duplicate citations
  CONSTRAINT unique_citation UNIQUE (ot_verse_id, nt_verse_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_citations_ot ON citations(ot_verse_id);
CREATE INDEX IF NOT EXISTS idx_citations_nt ON citations(nt_verse_id);

COMMENT ON TABLE citations IS 'NT citations of OT verses (for ECHOES edge type)';
COMMENT ON COLUMN citations.quote_type IS 'Type of citation: direct, allusion, paraphrase, etc.';

-- ============================================
-- 3. PROPHECIES TABLE (for PROPHECY edges)
-- ============================================
-- Maps prophetic verses to their fulfillments

CREATE TABLE IF NOT EXISTS prophecies (
  id SERIAL PRIMARY KEY,
  prophecy_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  fulfillment_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  prophecy_type VARCHAR(20),  -- 'messianic', 'historical', 'eschatological', etc.

  -- Prevent duplicate prophecy links
  CONSTRAINT unique_prophecy UNIQUE (prophecy_verse_id, fulfillment_verse_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_prophecies_prophecy ON prophecies(prophecy_verse_id);
CREATE INDEX IF NOT EXISTS idx_prophecies_fulfillment ON prophecies(fulfillment_verse_id);

COMMENT ON TABLE prophecies IS 'Prophetic verses and their fulfillments (for PROPHECY edge type)';
COMMENT ON COLUMN prophecies.prophecy_type IS 'Type: messianic, historical, eschatological, etc.';

-- ============================================
-- 4. GENEALOGIES TABLE (for GENEALOGY edges)
-- ============================================
-- Family relationships mentioned in Scripture

CREATE TABLE IF NOT EXISTS genealogies (
  id SERIAL PRIMARY KEY,
  ancestor_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  descendant_verse_id INT NOT NULL REFERENCES verses(id) ON DELETE CASCADE,
  relationship VARCHAR(50),  -- 'father', 'son', 'brother', 'descendant', etc.

  -- Prevent duplicate genealogy links
  CONSTRAINT unique_genealogy UNIQUE (ancestor_verse_id, descendant_verse_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_genealogies_ancestor ON genealogies(ancestor_verse_id);
CREATE INDEX IF NOT EXISTS idx_genealogies_descendant ON genealogies(descendant_verse_id);

COMMENT ON TABLE genealogies IS 'Family relationships for lineage tracking (for GENEALOGY edge type)';
COMMENT ON COLUMN genealogies.relationship IS 'Type of relationship: father, son, brother, descendant, etc.';
