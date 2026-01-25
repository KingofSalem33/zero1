-- Add OpenBible vote counts to cross-references for quality weighting

ALTER TABLE IF EXISTS cross_references
  ADD COLUMN IF NOT EXISTS votes INTEGER;

COMMENT ON COLUMN cross_references.votes IS 'OpenBible cross-reference votes (consensus)';

CREATE INDEX IF NOT EXISTS idx_xref_from_votes
  ON cross_references(from_verse_id, votes DESC);
