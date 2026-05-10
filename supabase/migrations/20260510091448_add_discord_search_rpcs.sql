-- TT-157: Discord bot search RPCs.
--
-- Replaces the column-blind .textSearch() calls used by the Discord bot
-- with two RPCs that match new GIN indexes built on
-- to_tsvector('simple', unaccent(...)). Three deliberate departures from
-- the original initial-schema indexes:
--
--   1. `simple` (vs `english`) config. Stemming on player and product
--      names is a precision regression — "Tenergy" stemmed to "tenergi"
--      and similar nonsense. Proper-noun search wants no stemming.
--   2. `unaccent` wrapper. The `english` config preserved diacritics, so
--      "Sámsonov" never matched "samsonov". Folding accents at index +
--      query time fixes that, at the cost of being unable to distinguish
--      é vs e (acceptable for a name search).
--   3. The old `idx_equipment_name_gin` and `idx_players_name_gin`
--      indexes are dropped. Their expressions matched the english config
--      and weren't used anywhere outside of these RPCs (the existing
--      bot code did `.textSearch("name", ...)` against a single column,
--      missing the combined-name index entirely).
--
-- Out of scope (parent TT-156 explicitly defers): fuzzy matching via
-- pg_trgm. Partial-token queries like "ma lo" → "Ma Long" don't work
-- with FTS alone and are not handled here.
--
-- Read-only — STABLE — and granted to anon/authenticated/service_role
-- since both `equipment` and `players` are publicly readable today via
-- RLS. Will need to be revisited if RLS ever clamps anon read access.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- IMMUTABLE wrapper around unaccent so it can be used inside index
-- expressions. The two-arg form pins the dictionary so the function
-- stays deterministic.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT public.unaccent('public.unaccent', $1) $$;

DROP INDEX IF EXISTS idx_equipment_name_gin;
DROP INDEX IF EXISTS idx_players_name_gin;

CREATE INDEX idx_equipment_name_gin ON equipment USING gin (
  to_tsvector('simple', public.f_unaccent(name || ' ' || manufacturer))
);

CREATE INDEX idx_players_name_gin ON players USING gin (
  to_tsvector('simple', public.f_unaccent(name))
);

CREATE FUNCTION search_equipment(query text)
RETURNS TABLE (
  id uuid,
  name text,
  manufacturer text,
  slug text,
  category text,
  rank real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.name,
    e.manufacturer,
    e.slug,
    e.category::text,
    ts_rank(
      to_tsvector('simple', public.f_unaccent(e.name || ' ' || e.manufacturer)),
      websearch_to_tsquery('simple', public.f_unaccent(query))
    ) AS rank
  FROM equipment e
  WHERE to_tsvector('simple', public.f_unaccent(e.name || ' ' || e.manufacturer))
        @@ websearch_to_tsquery('simple', public.f_unaccent(query))
  ORDER BY rank DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION search_equipment(text)
  TO anon, authenticated, service_role;

CREATE FUNCTION search_players(query text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  represents text,
  rank real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.name,
    p.slug,
    p.represents,
    ts_rank(
      to_tsvector('simple', public.f_unaccent(p.name)),
      websearch_to_tsquery('simple', public.f_unaccent(query))
    ) AS rank
  FROM players p
  WHERE to_tsvector('simple', public.f_unaccent(p.name))
        @@ websearch_to_tsquery('simple', public.f_unaccent(query))
  ORDER BY rank DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION search_players(text)
  TO anon, authenticated, service_role;
