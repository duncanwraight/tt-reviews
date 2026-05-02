-- TT-141: slug_redirects table for 301 forwarding on slug renames.
--
-- When equipment is renamed via the equipment_edit flow (TT-74,
-- TT-105 applier), the slug regenerates from the new name. Without
-- this table, the old URL 404s and any link equity / Google indexing
-- signal collected against it is lost.
--
-- Player slug renames are not currently exposed through any flow
-- (the player_edit form doesn't touch slug), but the table accepts
-- both entity types so the same path is ready when one ships.

-- ============================================================================
-- 1. Enum + table.
-- ============================================================================

CREATE TYPE slug_entity_type AS ENUM ('equipment', 'player');

CREATE TABLE slug_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type slug_entity_type NOT NULL,
  old_slug TEXT NOT NULL,
  new_slug TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (entity_type, old_slug),
  CHECK (old_slug <> new_slug)
);

CREATE INDEX idx_slug_redirects_lookup
  ON slug_redirects(entity_type, old_slug);

-- The chain-collapse update in recordSlugRedirect filters by
-- (entity_type, new_slug). Adding an index keeps that scan cheap as
-- the table grows.
CREATE INDEX idx_slug_redirects_chain
  ON slug_redirects(entity_type, new_slug);

-- ============================================================================
-- 2. RLS — read public, write admin/service-role only.
--
--    The detail-page loaders (anon key) need to read this on a slug
--    miss to issue the 301; the appliers (service-role) write to it
--    and bypass RLS. The admin policy is belt-and-braces for any
--    authenticated key path that ever reaches here.
-- ============================================================================

ALTER TABLE slug_redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read slug_redirects" ON slug_redirects
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage slug_redirects" ON slug_redirects
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');
