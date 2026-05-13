-- TT-201: recreate the player_proposals staging table.
--
-- TT-200 dropped this table in favour of a CLI-only flow that spliced
-- new players directly into seed.sql. That direction is being reversed:
-- the canonical surface for new-player discovery is the admin UI under
-- /admin/import-players, with an optional review queue for entries that
-- arrive without complete upstream data.
--
-- Schema mirrors the original (20260512100000_create_player_proposals.sql)
-- with one addition: status='auto_applied' for the importer-skipped-queue
-- path. Complete upstream entries (handedness, grip, birth year, photo
-- all present) bypass the review queue and land straight in `players`;
-- a player_proposals row with status='auto_applied' records the event
-- for audit without forcing the admin to click anything.
--
-- players.ittfid / handedness / grip remain in place from
-- 20260512100000_create_player_proposals.sql — never dropped.

CREATE TABLE player_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ittfid INTEGER NOT NULL UNIQUE,
  merged JSONB NOT NULL,
  candidates JSONB NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending_review', 'applied', 'auto_applied', 'rejected', 'no_results')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_player_id UUID REFERENCES players(id) ON DELETE SET NULL
);

COMMENT ON TABLE player_proposals IS
  'Per-upstream-profile player proposals from the WTT/ITTF importer (TT-201). One row per ittfid, replaced on re-scan.';
COMMENT ON COLUMN player_proposals.ittfid IS
  'Upstream ITTF/WTT canonical id; matches players.ittfid when applied.';
COMMENT ON COLUMN player_proposals.merged IS
  'Worker-merged result: { name, slug, birth_country, represents, gender, handedness, grip, birth_year, wtt_profile_url, ittf_profile_url, headshot_url, per_field_source: { field_name: source_label } }.';
COMMENT ON COLUMN player_proposals.candidates IS
  'Raw per-source extractions: { "wtt": {...}, "ittf": {...} } with fetched_at per source.';
COMMENT ON COLUMN player_proposals.status IS
  'pending_review | applied | auto_applied | rejected | no_results. auto_applied is set when the importer materialises a players row without admin review (complete upstream data).';
COMMENT ON COLUMN player_proposals.reviewed_by IS
  'auth.users.id of the admin who applied or rejected. NULL for auto_applied rows. SET NULL on user delete to preserve the proposal row.';
COMMENT ON COLUMN player_proposals.applied_player_id IS
  'players.id of the row materialised on approval. NULL until status=applied/auto_applied. SET NULL if the player row is later deleted, so the proposal history is preserved.';

-- Admin queue ordering: oldest pending first.
CREATE INDEX idx_player_proposals_status_created_at
  ON player_proposals (status, created_at);

-- RLS: deny everything to anon/authenticated. The importer + admin
-- loaders both use the service-role key (which bypasses RLS). Same
-- posture as equipment_spec_proposals.
ALTER TABLE player_proposals ENABLE ROW LEVEL SECURITY;
