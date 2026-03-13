-- Highlights table for cloud sync of user Bible highlights
CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verses INTEGER[] NOT NULL DEFAULT '{}',
  text TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#FEF3C7',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Index for fast user queries
CREATE INDEX IF NOT EXISTS idx_highlights_user_id ON highlights(user_id);

-- Index for verse lookups (checking if a verse is highlighted)
CREATE INDEX IF NOT EXISTS idx_highlights_user_book_chapter ON highlights(user_id, book, chapter);

-- Soft-delete filter
CREATE INDEX IF NOT EXISTS idx_highlights_not_deleted ON highlights(user_id) WHERE deleted_at IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_highlights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER highlights_updated_at
  BEFORE UPDATE ON highlights
  FOR EACH ROW
  EXECUTE FUNCTION update_highlights_updated_at();

-- Row Level Security
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

-- Users can only access their own highlights
CREATE POLICY highlights_select_own ON highlights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY highlights_insert_own ON highlights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY highlights_update_own ON highlights
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY highlights_delete_own ON highlights
  FOR DELETE USING (auth.uid() = user_id);
