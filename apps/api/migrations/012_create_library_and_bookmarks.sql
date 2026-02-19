-- Bookmarks and Library persistence tables (replace JSON file storage)

-- Shared trigger function to maintain updated_at columns
CREATE OR REPLACE FUNCTION update_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created
  ON bookmarks(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_user_text_unique
  ON bookmarks(user_id, text);

CREATE TABLE IF NOT EXISTS library_bundles (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  bundle_hash TEXT NOT NULL,
  bundle JSONB NOT NULL,
  anchor_ref TEXT,
  verse_count INTEGER NOT NULL DEFAULT 0,
  edge_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_bundles_user_hash_unique
  ON library_bundles(user_id, bundle_hash);

CREATE INDEX IF NOT EXISTS idx_library_bundles_user_created
  ON library_bundles(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS library_connections (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  bundle_id TEXT NOT NULL REFERENCES library_bundles(id) ON DELETE CASCADE,
  from_verse JSONB NOT NULL,
  to_verse JSONB NOT NULL,
  connection_type TEXT NOT NULL,
  similarity DOUBLE PRECISION NOT NULL DEFAULT 0,
  synopsis TEXT NOT NULL,
  explanation TEXT,
  connected_verse_ids INTEGER[],
  connected_verses JSONB,
  go_deeper_prompt TEXT NOT NULL,
  map_session JSONB,
  note TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_connections_user_created
  ON library_connections(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_library_connections_user_bundle
  ON library_connections(user_id, bundle_id);

CREATE INDEX IF NOT EXISTS idx_library_connections_user_type
  ON library_connections(user_id, connection_type);

CREATE TABLE IF NOT EXISTS library_maps (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  bundle_id TEXT NOT NULL REFERENCES library_bundles(id) ON DELETE CASCADE,
  title TEXT,
  note TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_maps_user_bundle_unique
  ON library_maps(user_id, bundle_id);

CREATE INDEX IF NOT EXISTS idx_library_maps_user_created
  ON library_maps(user_id, created_at DESC);

CREATE TRIGGER library_bundles_updated_at
  BEFORE UPDATE ON library_bundles
  FOR EACH ROW
  EXECUTE FUNCTION update_library_updated_at();

CREATE TRIGGER library_connections_updated_at
  BEFORE UPDATE ON library_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_library_updated_at();

CREATE TRIGGER library_maps_updated_at
  BEFORE UPDATE ON library_maps
  FOR EACH ROW
  EXECUTE FUNCTION update_library_updated_at();

ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY bookmarks_select_own ON bookmarks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY bookmarks_insert_own ON bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY bookmarks_delete_own ON bookmarks
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY library_bundles_select_own ON library_bundles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY library_bundles_insert_own ON library_bundles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY library_bundles_update_own ON library_bundles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY library_bundles_delete_own ON library_bundles
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY library_connections_select_own ON library_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY library_connections_insert_own ON library_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY library_connections_update_own ON library_connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY library_connections_delete_own ON library_connections
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY library_maps_select_own ON library_maps
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY library_maps_insert_own ON library_maps
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY library_maps_update_own ON library_maps
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY library_maps_delete_own ON library_maps
  FOR DELETE USING (auth.uid() = user_id);
