-- Player importer pipeline (TT-168 / TT-196).
--
-- Schema-only migration. Adds the proposals staging table and a handful
-- of player-side columns the WTT/ITTF importer (TT-197..TT-199) will
-- populate. No code consumes any of this yet.
--
-- Design context lives on the parent ticket (TT-168). High-level shape:
-- the importer pulls candidates from WTT + ITTF, dedupes against
-- existing players, and upserts one row per upstream profile into
-- player_proposals. Admin approves -> apply step inserts a new players
-- row using the merged field values.
--
-- The dedupe key is the upstream ittfid (an INTEGER returned by the WTT
-- roster). URLs for both ITTF and WTT can be derived from it and live
-- in merged JSONB; we don't need separate URL columns on either table.

-- Players-side additions. Nullable on existing rows — backfill is out
-- of scope here.

ALTER TABLE players
  ADD COLUMN ittfid INTEGER UNIQUE,
  ADD COLUMN handedness TEXT
    CHECK (handedness IN ('left', 'right') OR handedness IS NULL),
  ADD COLUMN grip TEXT
    CHECK (grip IN ('shakehand', 'penhold') OR grip IS NULL);

COMMENT ON COLUMN players.ittfid IS
  'ITTF/WTT canonical player id (matches WTT roster GetPlayersListByFilters response). Primary upstream dedupe key for the importer (TT-168).';
COMMENT ON COLUMN players.handedness IS
  'left | right. Sourced from ITTF profile pages via the importer (TT-168).';
COMMENT ON COLUMN players.grip IS
  'shakehand | penhold. Sourced from ITTF profile pages via the importer (TT-168). Distinct from playing_style — grip is independent of attacking/defending style.';

-- Importer staging table. Mirrors equipment_spec_proposals
-- (supabase/migrations/20260503074556_add_equipment_spec_proposals.sql).
-- One row per upstream profile, replaced on re-scan via ON CONFLICT.

CREATE TABLE player_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ittfid INTEGER NOT NULL UNIQUE,
  merged JSONB NOT NULL,
  candidates JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'applied', 'rejected', 'no_results')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_player_id UUID REFERENCES players(id) ON DELETE SET NULL
);

COMMENT ON TABLE player_proposals IS
  'Per-upstream-profile player proposals from the WTT/ITTF importer (TT-168). One row per ittfid, replaced on re-scan.';
COMMENT ON COLUMN player_proposals.ittfid IS
  'Upstream ITTF/WTT canonical id; matches players.ittfid when applied.';
COMMENT ON COLUMN player_proposals.merged IS
  'Worker-merged result: { name, slug, birth_country, represents, gender, handedness, grip, playing_style, highest_rating, active_years, wtt_profile_url, ittf_profile_url, per_field_source: { field_name: source_label } }.';
COMMENT ON COLUMN player_proposals.candidates IS
  'Raw per-source extractions: { "wtt": {...}, "ittf": {...} } with raw_html_excerpt + fetched_at per source.';
COMMENT ON COLUMN player_proposals.status IS
  'pending_review | applied | rejected | no_results.';
COMMENT ON COLUMN player_proposals.reviewed_by IS
  'auth.users.id of the admin who applied or rejected. SET NULL on user delete to preserve the proposal row.';
COMMENT ON COLUMN player_proposals.applied_player_id IS
  'players.id of the row materialised on approval. NULL until status=applied. SET NULL if the player row is later deleted, so the proposal history is preserved.';

-- Admin queue ordering: oldest pending first.
CREATE INDEX idx_player_proposals_status_created_at
  ON player_proposals (status, created_at);

-- RLS: deny everything to anon/authenticated. The importer + admin
-- loaders both use the service-role key (which bypasses RLS). Same
-- posture as equipment_spec_proposals — no policies for non-service
-- roles is the strictest possible while still allowing the service-role
-- caller to do its job.
ALTER TABLE player_proposals ENABLE ROW LEVEL SECURITY;
