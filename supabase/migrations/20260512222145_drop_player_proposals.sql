-- TT-200: drop the player_proposals staging table.
--
-- The TT-196..TT-199 admin UI for reviewing WTT-roster proposals is
-- being replaced by the local CLI workflow in scripts/photo-sourcing/
-- (manifest.json + seed.sql splicing). New players land via the
-- PLAYER-IMPORT block on `supabase db reset`, not through a DB-staged
-- approval queue, so the proposals table has no remaining callers.
--
-- We KEEP the players.ittfid / handedness / grip columns added in
-- 20260512100000_create_player_proposals.sql — those are valuable
-- regardless of how rows arrive in the table.

DROP TABLE IF EXISTS player_proposals;
