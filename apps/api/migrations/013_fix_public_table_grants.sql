-- Ensure user-owned tables and grants exist for authenticated API access.
-- Fixes issues such as:
-- PGRST205: Could not find the table 'public.highlights' in the schema cache

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS idx_highlights_user_id ON highlights(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_user_book_chapter
  ON highlights(user_id, book, chapter);
CREATE INDEX IF NOT EXISTS idx_highlights_not_deleted
  ON highlights(user_id) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION update_highlights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'highlights_updated_at'
      AND tgrelid = 'public.highlights'::regclass
  ) THEN
    CREATE TRIGGER highlights_updated_at
      BEFORE UPDATE ON highlights
      FOR EACH ROW
      EXECUTE FUNCTION update_highlights_updated_at();
  END IF;
END
$$;

ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'highlights'
      AND policyname = 'highlights_select_own'
  ) THEN
    CREATE POLICY highlights_select_own ON highlights
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'highlights'
      AND policyname = 'highlights_insert_own'
  ) THEN
    CREATE POLICY highlights_insert_own ON highlights
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'highlights'
      AND policyname = 'highlights_update_own'
  ) THEN
    CREATE POLICY highlights_update_own ON highlights
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'highlights'
      AND policyname = 'highlights_delete_own'
  ) THEN
    CREATE POLICY highlights_delete_own ON highlights
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('public.highlights') IS NOT NULL THEN
    GRANT ALL PRIVILEGES ON TABLE highlights TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE highlights TO authenticated;
  END IF;

  IF to_regclass('public.bookmarks') IS NOT NULL THEN
    GRANT ALL PRIVILEGES ON TABLE bookmarks TO service_role;
    GRANT SELECT, INSERT, DELETE ON TABLE bookmarks TO authenticated;
  END IF;

  IF to_regclass('public.library_bundles') IS NOT NULL THEN
    GRANT ALL PRIVILEGES ON TABLE library_bundles TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE library_bundles TO authenticated;
  END IF;

  IF to_regclass('public.library_connections') IS NOT NULL THEN
    GRANT ALL PRIVILEGES ON TABLE library_connections TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE library_connections TO authenticated;
  END IF;

  IF to_regclass('public.library_maps') IS NOT NULL THEN
    GRANT ALL PRIVILEGES ON TABLE library_maps TO service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE library_maps TO authenticated;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
