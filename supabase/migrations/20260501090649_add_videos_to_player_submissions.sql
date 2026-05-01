-- TT-131: add `videos` JSONB column to player_submissions so the player
-- submission flow can carry submitted video entries through to approval,
-- where the cascade applier promotes them into player_footage rows.
--
-- Until now the column was missing, which combined with the action's
-- failure to parse the form's `videos[N][...]` hidden inputs meant
-- player submissions silently dropped any videos the user added. We
-- backfill nothing; previously-submitted players that were approved
-- without videos stay as-is (out of scope per the ticket).

ALTER TABLE player_submissions
  ADD COLUMN videos JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN player_submissions.videos IS
  'Pending video entries (url/title/platform) submitted alongside the player. Cascaded into player_footage on approval. TT-131.';
