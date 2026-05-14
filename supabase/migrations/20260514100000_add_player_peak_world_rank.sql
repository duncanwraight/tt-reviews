-- TT-219: split the player's peak ITTF world ranking into typed
-- numeric columns so /players "Sort By → Highest Rating" can order
-- on the actual rank number instead of lexicographically sorting the
-- "WR<n> (<year>)" display string.
--
-- The display string (`players.highest_rating`, VARCHAR(50)) stays as
-- the human-facing field — PlayerHeader, PlayerEditForm, and the
-- public submission form continue to read/write it untouched. New
-- numeric columns are written alongside it by the importer (TT-204
-- queue consumer) and by seed.sql.
--
-- Backfill: parse existing display strings on prod into the new
-- columns. Pattern is "WR<n> (<year>)" — anything that doesn't match
-- (free-form historical entries, etc.) stays NULL rather than risking
-- garbage from a sloppier regex. The sanity bounds mirror the
-- importer's parseIttfProfile guard so direct INSERT/UPDATE paths
-- (seed.sql, admin edits) can't poke nonsense values through.

ALTER TABLE players
  ADD COLUMN peak_world_rank INTEGER
    CHECK (peak_world_rank IS NULL OR (peak_world_rank >= 1 AND peak_world_rank <= 10000)),
  ADD COLUMN peak_rank_year INTEGER
    CHECK (peak_rank_year IS NULL OR (peak_rank_year >= 2001 AND peak_rank_year <= 2200));

COMMENT ON COLUMN players.peak_world_rank IS
  'Career-best ITTF Seniors Singles world ranking (peak rank number). NULL when the player has no recorded peak or the legacy highest_rating string failed to parse. Sourced from the ITTF profile via the importer (TT-204).';

COMMENT ON COLUMN players.peak_rank_year IS
  'Calendar year in which peak_world_rank was achieved. NULL alongside peak_world_rank when not known. The ITTF published rankings series starts January 2001 per the page footer; CHECK guards against earlier years.';

-- One-shot backfill from existing display strings. Matches the
-- canonical "WR<n> (<year>)" shape only; partial / free-form entries
-- stay NULL. substring() returns NULL when the pattern doesn't match,
-- so the CASE guards against feeding bare NULL into the numeric
-- comparisons (avoids spurious CHECK failures).
WITH parsed AS (
  SELECT
    id,
    NULLIF(substring(highest_rating FROM 'WR(\d+)'), '')::int AS rank,
    NULLIF(substring(highest_rating FROM '\((\d{4})\)'), '')::int AS year
  FROM players
  WHERE highest_rating ~ '^WR\d+ \(\d{4}\)$'
)
UPDATE players p
SET
  peak_world_rank = parsed.rank,
  peak_rank_year = parsed.year
FROM parsed
WHERE
  p.id = parsed.id
  AND parsed.rank IS NOT NULL
  AND parsed.year IS NOT NULL
  AND parsed.rank BETWEEN 1 AND 10000
  AND parsed.year BETWEEN 2001 AND 2200;
