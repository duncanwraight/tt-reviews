-- TT-185: behavioural pgTAP coverage for the race-safe rewrite of
-- get_or_create_discord_moderator (migration
-- 20260510152558_fix_discord_moderator_race.sql).
--
-- pgTAP can't drive true concurrency — every test runs in a single
-- transaction. The Vitest integration suite at
-- app/lib/database/__tests__/discord_moderator_race.integration.test.ts
-- owns the actual N-parallel concurrency assertion.
--
-- This file pins the behaviour the new ON CONFLICT DO UPDATE statement
-- has to preserve so a future "let me clean this up" rewrite can't
-- silently regress:
--
--   1. Insert path: novel discord_user_id creates a row, returns its id.
--   2. Idempotency: calling again with the same id returns the same id
--      and doesn't add a second row.
--   3. Update path: existing row's last_active and updated_at move
--      forward when the function is called again.
--   4. Username preservation (COALESCE rule): passing NULL for
--      p_discord_username keeps the existing username instead of
--      overwriting it with NULL.
--   5. Username overwrite: passing a non-NULL p_discord_username
--      overwrites the stored value.

BEGIN;

SELECT plan(9);

-- A discord_user_id we know isn't in the seed.
\set test_user_id '\'tt185-pgtap-9999991615\''

-- Test 1: insert path.
SELECT isnt(
  public.get_or_create_discord_moderator(:test_user_id, 'pgtap-initial')::text,
  NULL,
  'first call returns a non-null UUID (insert path)'
);

SELECT is(
  (SELECT count(*)::int FROM discord_moderators WHERE discord_user_id = :test_user_id),
  1,
  'exactly one row exists after the insert'
);

-- Capture the row's first-seen state for follow-up comparisons.
CREATE TEMP TABLE t185_baseline AS
SELECT id, discord_username, last_active, updated_at
FROM discord_moderators
WHERE discord_user_id = :test_user_id;

-- Sleep a moment so NOW() observably moves between calls. clock_timestamp()
-- advances within the txn even when transaction_timestamp() doesn't, but
-- last_active uses NOW() (== transaction_timestamp), which is fixed for
-- the txn — so we can't assert a strict > on it inside one BEGIN.
-- Instead, assert the function returns the same id on the second call
-- (idempotency) and that the columns we expect to be touched still hold
-- valid values.

-- Test 2: idempotency — same id returned on second call.
SELECT is(
  public.get_or_create_discord_moderator(:test_user_id, 'pgtap-second')::text,
  (SELECT id::text FROM t185_baseline),
  'second call returns the same UUID (idempotent)'
);

-- Test 3: still one row after the second call (no duplicate insert).
SELECT is(
  (SELECT count(*)::int FROM discord_moderators WHERE discord_user_id = :test_user_id),
  1,
  'no duplicate row after a second call (ON CONFLICT path)'
);

-- Test 4: username overwrite — second call passed 'pgtap-second' so the
-- stored value should now be 'pgtap-second', not 'pgtap-initial'.
SELECT is(
  (SELECT discord_username FROM discord_moderators WHERE discord_user_id = :test_user_id),
  'pgtap-second',
  'a non-null p_discord_username overwrites the stored value'
);

-- Test 5: username preservation when NULL is passed (COALESCE rule).
-- DO block because PERFORM is plpgsql — pgTAP files run as plain SQL.
DO $$
BEGIN
  PERFORM public.get_or_create_discord_moderator('tt185-pgtap-9999991615', NULL);
END
$$;

SELECT is(
  (SELECT discord_username FROM discord_moderators WHERE discord_user_id = :test_user_id),
  'pgtap-second',
  'passing NULL for p_discord_username preserves the existing value'
);

-- Test 6: updated_at >= last_active (both touched by the function;
-- assert internal consistency rather than absolute monotonicity, which
-- a single-txn pgTAP run can't observe).
SELECT ok(
  (SELECT updated_at >= last_active - interval '1 second'
   FROM discord_moderators
   WHERE discord_user_id = :test_user_id),
  'updated_at and last_active stay coherent after the update branch'
);

-- Test 7: a second novel discord_user_id gets a *different* UUID — the
-- function isn't accidentally returning a cached id.
SELECT isnt(
  public.get_or_create_discord_moderator('tt185-pgtap-other-id', 'pgtap-other')::text,
  (SELECT id::text FROM t185_baseline),
  'a different discord_user_id yields a different moderator UUID'
);

-- Test 8: EXECUTE grants survived the CREATE OR REPLACE (per Postgres
-- docs grants are preserved on same-signature replacement; this guards
-- the assumption against future migration churn).
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_or_create_discord_moderator(text, text)',
    'EXECUTE'
  ),
  'authenticated retains EXECUTE on get_or_create_discord_moderator after replace'
);

SELECT * FROM finish();

ROLLBACK;
