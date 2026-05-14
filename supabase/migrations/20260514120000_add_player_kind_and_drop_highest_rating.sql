-- TT-221 (Player kind A): introduce the professional / amateur split
-- in the players + player_submissions schema, and drop the legacy
-- `highest_rating` VARCHAR(50) column entirely. TT-219 already typed
-- the pro side (peak_world_rank, peak_rank_year); this migration adds
-- the amateur counterpart (peak_rating_value, peak_rating_year), the
-- discriminating `player_kind` enum, and a CHECK constraint to keep
-- the two field families mutually exclusive at the DB layer.
--
-- The country-derived rating label (TTR / Points / USATT / etc.) is a
-- RENDER-time concern only — no column for it here. See
-- `app/lib/players/rating-systems.ts` (TT-222) for the lookup map.
--
-- One-shot backfill: re-run the TT-219 "WR<n> (<year>)" parse so any
-- non-importer rows that previously held a parseable display string
-- still land their typed columns before the column drops. Anything
-- that doesn't match the canonical pattern is intentionally lost (the
-- value was unstructured marketing copy or stale data).

-- 1. Enum.
CREATE TYPE player_kind AS ENUM ('professional', 'amateur');

-- 2. players: backfill anything still parseable into the typed pro
-- columns BEFORE dropping highest_rating. TT-219 covered the rows the
-- importer touched; this is belt-and-braces for any rows the importer
-- skipped (seed-only, ad-hoc admin edits).
WITH parsed AS (
  SELECT
    id,
    NULLIF(substring(highest_rating FROM 'WR(\d+)'), '')::int AS rank,
    NULLIF(substring(highest_rating FROM '\((\d{4})\)'), '')::int AS year
  FROM players
  WHERE highest_rating ~ '^WR\d+ \(\d{4}\)$'
    AND peak_world_rank IS NULL
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

-- 3. players: add kind discriminator + amateur peak fields.
ALTER TABLE players
  ADD COLUMN player_kind player_kind NOT NULL DEFAULT 'professional',
  ADD COLUMN peak_rating_value INTEGER
    CHECK (peak_rating_value IS NULL OR (peak_rating_value >= 1 AND peak_rating_value <= 9999)),
  ADD COLUMN peak_rating_year INTEGER
    CHECK (peak_rating_year IS NULL OR (peak_rating_year >= 1900 AND peak_rating_year <= 2200));

COMMENT ON COLUMN players.player_kind IS
  'Discriminates professional players (world-ranked, peak_world_rank / peak_rank_year populated) from amateurs (country-rated, peak_rating_value / peak_rating_year populated). The ITTF importer always writes ''professional''; amateurs only enter via the submission flow. Default is ''professional'' so existing seed/import paths stay correct.';

COMMENT ON COLUMN players.peak_rating_value IS
  'Career-best country-specific rating (e.g. German TTR ~2400, French Points, USATT rating). NULL for professionals (enforced by players_kind_fields_exclusive CHECK). The rating-system LABEL is derived at render time from represents ?? birth_country — never stored — so flipping a player''s country re-labels the value without a write.';

COMMENT ON COLUMN players.peak_rating_year IS
  'Calendar year peak_rating_value was achieved. NULL alongside peak_rating_value when not known. 1900..2200 sanity bound matches the wider career-data bounds elsewhere in the schema.';

-- 4. players: mutual-exclusion CHECK. Pros never carry amateur fields,
-- amateurs never carry pro fields. Application-layer validators mirror
-- this so submission writes get a clean 400 instead of a Postgres
-- constraint-violation back to the user.
ALTER TABLE players
  ADD CONSTRAINT players_kind_fields_exclusive CHECK (
    (player_kind = 'professional'
      AND peak_rating_value IS NULL
      AND peak_rating_year IS NULL)
    OR
    (player_kind = 'amateur'
      AND peak_world_rank IS NULL
      AND peak_rank_year IS NULL)
  );

-- 5. players: drop the legacy display column. Anything parseable was
-- already moved into peak_world_rank/peak_rank_year above; anything
-- else was free-form and not worth preserving.
ALTER TABLE players DROP COLUMN highest_rating;

-- 6. player_submissions: drop legacy free-form, add the typed fields
-- that the new submission form (TT-225) writes. No backfill needed:
-- submissions are throwaway after moderation, and any in-flight rows
-- with `highest_rating` set were unstructured pre-split data the
-- moderator can re-key.
ALTER TABLE player_submissions DROP COLUMN highest_rating;

ALTER TABLE player_submissions
  ADD COLUMN player_kind player_kind NOT NULL DEFAULT 'professional',
  ADD COLUMN peak_world_rank INTEGER
    CHECK (peak_world_rank IS NULL OR (peak_world_rank >= 1 AND peak_world_rank <= 10000)),
  ADD COLUMN peak_rank_year INTEGER
    CHECK (peak_rank_year IS NULL OR (peak_rank_year >= 2001 AND peak_rank_year <= 2200)),
  ADD COLUMN peak_rating_value INTEGER
    CHECK (peak_rating_value IS NULL OR (peak_rating_value >= 1 AND peak_rating_value <= 9999)),
  ADD COLUMN peak_rating_year INTEGER
    CHECK (peak_rating_year IS NULL OR (peak_rating_year >= 1900 AND peak_rating_year <= 2200));

ALTER TABLE player_submissions
  ADD CONSTRAINT player_submissions_kind_fields_exclusive CHECK (
    (player_kind = 'professional'
      AND peak_rating_value IS NULL
      AND peak_rating_year IS NULL)
    OR
    (player_kind = 'amateur'
      AND peak_world_rank IS NULL
      AND peak_rank_year IS NULL)
  );

COMMENT ON COLUMN player_submissions.player_kind IS
  'Discriminates professional vs amateur for the moderation pipeline. Submission validators (app/lib/submissions/) enforce that only the kind-appropriate peak fields are set before INSERT — the CHECK constraint here is the belt-and-braces backstop.';
