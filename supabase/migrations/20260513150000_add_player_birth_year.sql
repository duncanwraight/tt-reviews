-- TT-202: add players.birth_year so the importer can persist the ITTF
-- profile's "Birth Year:" field. Nullable on existing rows — backfill
-- happens through subsequent importer runs (ittfid match → admin uses
-- /admin/import-players which will re-run enrichment) or via the
-- player_edits flow.
--
-- Bounded check at the DB layer: anyone born before 1900 or after the
-- current year is upstream garbage. Importer also sanity-bounds; the
-- DB check is a belt-and-braces guard against direct INSERT/UPDATE
-- (e.g. seed.sql refreshes via TT-167 / TT-191).

ALTER TABLE players
  ADD COLUMN birth_year INTEGER
    CHECK (birth_year IS NULL OR (birth_year >= 1900 AND birth_year <= 2200));

COMMENT ON COLUMN players.birth_year IS
  'Four-digit birth year sourced from ITTF results profile (TT-202). NULL for legacy rows and for upstream profiles with the Unknown fallback. CHECK guards against garbage values; importer applies a tighter bound (currentYear) at write time.';
