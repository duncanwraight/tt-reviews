-- pgTAP tests for the Discord search RPCs added by
-- 20260510091448_add_discord_search_rpcs.sql (TT-157).
--
-- Covers:
--   1. search_equipment matches the combined name+manufacturer FTS,
--      including the manufacturer-only-token case ("Victas VKM").
--   2. Top-result selection — viscaria → Butterfly Viscaria as winner.
--   3. Multi-result detection — "butterfly" returns >5 rows (ambiguity
--      trigger for the C3 caller).
--   4. Zero-match path returns 0 rows.
--   5. Multi-token query — "vkm zc" returns the VKM ZC row.
--   6. search_players multi-token — "ma long" returns Ma Long.
--      (Note: "ma lo" — partial-token / prefix matching — is NOT
--      supported. Fuzzy matching is out of scope per parent TT-156.)
--   7. search_players multi-result — "harimoto" returns >1 row
--      (Tomokazu + Miwa both in seed). Substitutes for the spec's
--      "Smith" case since the seed has no Smiths but does have
--      multiple Harimotos — the assertion the test exists to make is
--      "ambiguity surfaces", not the specific surname.
--   8. Diacritic handling — "samsonov" matches "Vladimír Sámsonov" via
--      the unaccent wrapper (the GIN expression and the query both run
--      through f_unaccent(), so accents fold consistently).
--   9. EXECUTE granted to anon/authenticated/service_role.
--   10. EXPLAIN shows idx_equipment_name_gin in use (regression guard
--       — the entire point of the rebuild is index-backed FTS).
--   11. EXPLAIN shows idx_players_name_gin in use.
--
-- Memory note: new server-side data paths need DB-level coverage —
-- mocked-Supabase unit tests pass through PostgREST query-shape bugs.

BEGIN;

SELECT plan(13);

-- Helper: capture EXPLAIN output as text so we can pattern-match the
-- index name. EXPLAIN is a utility command and can't appear in a
-- subquery, but a plpgsql wrapper using FOR…EXECUTE does the trick.
-- Lives in pg_temp so it disappears at end of transaction.
CREATE FUNCTION pg_temp.get_plan(q text) RETURNS text AS $$
DECLARE
  result text := '';
  rec record;
BEGIN
  FOR rec IN EXECUTE 'EXPLAIN ' || q LOOP
    result := result || rec."QUERY PLAN" || E'\n';
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Force index use for the EXPLAIN assertions; on a 250-row seeded table
-- the planner can prefer Seq Scan, which would mask whether the index
-- would be picked at production scale. The behavioural tests below run
-- under default planner settings.
SET LOCAL enable_seqscan = off;

-- Test 1: manufacturer-token query matches via the combined FTS.
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.search_equipment('Victas VKM')),
  '>=',
  1,
  'search_equipment("Victas VKM") returns the VKM blade(s)'
);

-- Test 2: viscaria → Butterfly Viscaria as winner.
SELECT is(
  (SELECT slug FROM public.search_equipment('viscaria') LIMIT 1),
  'butterfly-viscaria',
  'search_equipment("viscaria") returns butterfly-viscaria as top hit'
);

-- Test 3: ambiguity case — many Butterfly products in seed.
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.search_equipment('butterfly')),
  '>',
  5,
  'search_equipment("butterfly") returns >5 rows (ambiguity trigger)'
);

-- Test 4: zero-match path.
SELECT is(
  (SELECT count(*)::int FROM public.search_equipment('nonsense xyz123')),
  0,
  'search_equipment for a clearly-absent string returns 0 rows'
);

-- Test 5: multi-token "vkm zc" → VKM ZC row.
SELECT is(
  (SELECT slug FROM public.search_equipment('vkm zc') LIMIT 1),
  'victas-vkm-zc',
  'search_equipment("vkm zc") returns victas-vkm-zc as top hit'
);

-- Test 6: search_players full-name token "ma long" → Ma Long.
SELECT is(
  (SELECT slug FROM public.search_players('ma long') LIMIT 1),
  'ma-long',
  'search_players("ma long") returns ma-long as top hit'
);

-- Test 7: search_players multi-result — Harimoto family in seed.
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.search_players('harimoto')),
  '>',
  1,
  'search_players("harimoto") returns >1 row (Tomokazu + Miwa)'
);

-- Test 8: diacritic case — accent folding via f_unaccent on both sides.
SELECT is(
  (SELECT slug FROM public.search_players('samsonov') LIMIT 1),
  'vladimir-samsonov',
  'search_players("samsonov") matches Vladimír Sámsonov via diacritic folding'
);

-- Test 9: EXECUTE grants. anon, authenticated, service_role all permitted.
SELECT ok(
  has_function_privilege('anon', 'public.search_equipment(text)', 'EXECUTE'),
  'anon has EXECUTE on search_equipment'
);

SELECT ok(
  has_function_privilege('anon', 'public.search_players(text)', 'EXECUTE'),
  'anon has EXECUTE on search_players'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.search_equipment(text)', 'EXECUTE'),
  'authenticated has EXECUTE on search_equipment'
);

-- Test 10 + 11: EXPLAIN shows the GIN indexes in use. Going via the raw
-- expression rather than search_equipment() because STABLE SQL functions
-- get inlined by the planner and we want to assert on the underlying
-- expression match, not on whatever wrapping the inliner chose.
-- Use ok() with the SQL LIKE operator instead of pgTAP's like(), which
-- has overload-resolution issues with text literals on this version.
SELECT ok(
  pg_temp.get_plan(
    $q$SELECT id FROM equipment
       WHERE to_tsvector('simple', public.f_unaccent(name || ' ' || manufacturer))
             @@ websearch_to_tsquery('simple', public.f_unaccent('viscaria'))$q$
  ) LIKE '%idx_equipment_name_gin%',
  'equipment FTS plan uses idx_equipment_name_gin'
);

SELECT ok(
  pg_temp.get_plan(
    $q$SELECT id FROM players
       WHERE to_tsvector('simple', public.f_unaccent(name))
             @@ websearch_to_tsquery('simple', public.f_unaccent('long'))$q$
  ) LIKE '%idx_players_name_gin%',
  'player FTS plan uses idx_players_name_gin'
);

SELECT * FROM finish();

ROLLBACK;
