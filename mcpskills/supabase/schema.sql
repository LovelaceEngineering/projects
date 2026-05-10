-- MCPSkills Supabase Schema
-- Run this in Supabase → SQL Editor

-- ── User profiles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username    TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'user_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ── Collections ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collections (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  is_public   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Collection items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_items (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id  UUID REFERENCES collections(id) ON DELETE CASCADE NOT NULL,
  item_slug      TEXT NOT NULL,
  item_type      TEXT NOT NULL CHECK (item_type IN ('server', 'skill')),
  added_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE(collection_id, item_slug, item_type)
);

-- ── Row Level Security ────────────────────────────────────────────
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Profiles are publicly viewable"
  ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Collections: owner sees all, everyone sees public ones
CREATE POLICY "View collections"
  ON collections FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Insert own collections"
  ON collections FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own collections"
  ON collections FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Delete own collections"
  ON collections FOR DELETE
  USING (auth.uid() = user_id);

-- Collection items
CREATE POLICY "View collection items"
  ON collection_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE id = collection_id
        AND (user_id = auth.uid() OR is_public = true)
    )
  );
CREATE POLICY "Manage own collection items"
  ON collection_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM collections
      WHERE id = collection_id AND user_id = auth.uid()
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_collections_user_id ON collections(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection_id ON collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_slug ON collection_items(item_slug, item_type);
