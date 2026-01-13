-- ============================================================
-- PERICOPE METADATA ENRICHMENT
-- ============================================================

ALTER TABLE pericopes
  ADD COLUMN IF NOT EXISTS title_generated VARCHAR(255),
  ADD COLUMN IF NOT EXISTS archetypes TEXT[],
  ADD COLUMN IF NOT EXISTS shadows TEXT[],
  ADD COLUMN IF NOT EXISTS metadata_model VARCHAR(50),
  ADD COLUMN IF NOT EXISTS metadata_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_pericopes_archetypes
  ON pericopes USING GIN(archetypes);
CREATE INDEX IF NOT EXISTS idx_pericopes_shadows
  ON pericopes USING GIN(shadows);
