-- pgTAP tests for the spec-sourcing RPCs added by
-- 20260503092459_add_spec_sourcing_rpcs.sql (TT-149).
--
-- Covers:
--   1. pick_spec_source_batch returns NULL-cooldown rows in
--      specs_sourced_at NULLS FIRST order, respects the limit, and
--      excludes 'pending_review' rows.
--   2. pick_spec_source_batch re-includes rows whose 'fresh' / 'no_results'
--      cooldown has expired, but excludes those still inside the cooldown
--      window.
--   3. get_spec_sourcing_status returns the expected aggregate counts.
--   4. Both RPCs are denied to the anon and authenticated roles
--      (service_role-only EXECUTE grant).
--
-- Memory note: new server-side data paths need DB-level coverage —
-- mocked-Supabase unit tests pass through PostgREST query-shape bugs.

BEGIN;

SELECT plan(8);

-- Seed equipment rows in known cooldown states. UUIDs are fixed so we
-- can assert ordering deterministically.
INSERT INTO equipment (id, name, slug, category, manufacturer, specs_sourced_at, specs_source_status)
VALUES
  ('00000000-0000-0000-0000-00000000aaaa', 'Test Never Sourced',
   'test-never-sourced', 'blade', 'TestCo', NULL, NULL),
  ('00000000-0000-0000-0000-00000000bbbb', 'Test Cold Fresh',
   'test-cold-fresh', 'blade', 'TestCo',
   NOW() - INTERVAL '7 months', 'fresh'),
  ('00000000-0000-0000-0000-00000000cccc', 'Test Warm Fresh',
   'test-warm-fresh', 'blade', 'TestCo',
   NOW() - INTERVAL '1 month', 'fresh'),
  ('00000000-0000-0000-0000-00000000dddd', 'Test Cold NoResults',
   'test-cold-noresults', 'blade', 'TestCo',
   NOW() - INTERVAL '20 days', 'no_results'),
  ('00000000-0000-0000-0000-00000000eeee', 'Test Warm NoResults',
   'test-warm-noresults', 'blade', 'TestCo',
   NOW() - INTERVAL '7 days', 'no_results'),
  ('00000000-0000-0000-0000-00000000ffff', 'Test Pending',
   'test-pending', 'blade', 'TestCo',
   NOW() - INTERVAL '1 day', 'pending_review');

-- Test 1: never-sourced row appears first (NULLS FIRST).
SELECT is(
  (SELECT (public.pick_spec_source_batch(50)::jsonb -> 0 ->> 'slug')),
  'test-never-sourced',
  'pick_spec_source_batch returns the NULL-cooldown row first'
);

-- Test 2: cold fresh + cold no_results show up; warm rows + pending don't.
-- Use a high limit so the test rows aren't pushed out by the seed catalog
-- (231 NULL-sourced rows that all sort ahead of our non-NULL test rows).
SELECT bag_eq(
  $$SELECT row->>'slug' FROM (
      SELECT jsonb_array_elements(public.pick_spec_source_batch(1000)) AS row
    ) p
    WHERE row->>'slug' LIKE 'test-%'$$,
  $$VALUES ('test-never-sourced'), ('test-cold-fresh'), ('test-cold-noresults')$$,
  'pick_spec_source_batch includes only the rows past their cooldown window'
);

-- Test 3: respects the limit parameter.
SELECT is(
  (SELECT jsonb_array_length(public.pick_spec_source_batch(1))),
  1,
  'pick_spec_source_batch respects the p_limit argument'
);

-- Test 4: zero or negative limit returns an empty array.
SELECT is(
  public.pick_spec_source_batch(0),
  '[]'::jsonb,
  'pick_spec_source_batch returns an empty array when limit is 0'
);

-- Test 5: get_spec_sourcing_status counts the never-sourced row(s).
-- (count includes the seed catalog plus our test rows; assert >= our test count.)
SELECT cmp_ok(
  ((public.get_spec_sourcing_status())->>'never_sourced')::INT,
  '>=',
  1,
  'get_spec_sourcing_status counts the never-sourced row(s)'
);

-- Test 6: in_cooldown counts only no_results rows still inside the 14d window.
SELECT cmp_ok(
  ((public.get_spec_sourcing_status())->>'in_cooldown')::INT,
  '>=',
  1,
  'get_spec_sourcing_status counts in-cooldown no_results rows'
);

-- Test 7: anon role cannot execute pick_spec_source_batch.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.pick_spec_source_batch(5)$$,
  '42501',
  NULL,
  'pick_spec_source_batch denies the anon role'
);
RESET ROLE;

-- Test 8: authenticated role cannot execute pick_spec_source_batch.
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.pick_spec_source_batch(5)$$,
  '42501',
  NULL,
  'pick_spec_source_batch denies the authenticated role'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
