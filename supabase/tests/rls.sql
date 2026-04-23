-- pgTAP tests for RLS policies on player_equipment_setup_submissions.
-- Run via `supabase test db`.
--
-- This file pins the three guarantees called out in todo/RELIABILITY.md
-- Phase 6: anon cannot read pending submissions; a regular user sees
-- only their own rows; an admin (via `user_role=admin` JWT claim) sees
-- everything.

BEGIN;

SELECT plan(6);

-- ----------------------------------------------------------------------
-- Seed — two users and one player, with one pending submission owned
-- by user A. auth.users is a plain Supabase-managed table and accepts
-- direct inserts of just the columns we care about here.
-- ----------------------------------------------------------------------

INSERT INTO auth.users (id, email, instance_id) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'rls-user-a@test.local',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'rls-user-b@test.local',
    '00000000-0000-0000-0000-000000000000'
  );

INSERT INTO players (id, name, slug) VALUES
  (
    '33333333-3333-3333-3333-333333333333',
    'RLS Test Player',
    'rls-test-player'
  );

INSERT INTO player_equipment_setup_submissions (
  id, user_id, player_id, year, status
) VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  2024,
  'pending'
);

-- ----------------------------------------------------------------------
-- Test 1: anon cannot SELECT pending submissions (no anon policy at all)
-- ----------------------------------------------------------------------
SET LOCAL ROLE anon;

SELECT is_empty(
  $$SELECT 1 FROM player_equipment_setup_submissions
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'anon cannot SELECT a pending submission'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Test 2: the owning user sees their own submission
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

SELECT is(
  (
    SELECT count(*)::int FROM player_equipment_setup_submissions
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'user A SELECTs their own submission'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Test 3: a different authenticated user cannot see user A's submission
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

SELECT is_empty(
  $$SELECT 1 FROM player_equipment_setup_submissions
    WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'user B cannot SELECT user A submissions'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Test 4: an admin (user_role claim = 'admin') sees all submissions
-- regardless of who owns them
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';

-- Scope to the seeded id so pre-existing dev data (or other tests) does
-- not perturb the count on a non-clean database.
SELECT is(
  (SELECT count(*)::int FROM player_equipment_setup_submissions
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1,
  'admin sees submissions including ones they do not own'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Test 5: an admin can UPDATE any submission
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';

UPDATE player_equipment_setup_submissions
   SET moderator_notes = 'reviewed'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(
  (
    SELECT moderator_notes FROM player_equipment_setup_submissions
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'reviewed',
  'admin UPDATE on another user\''s submission succeeds'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Test 6: a non-admin authenticated user CANNOT UPDATE someone else's
-- submission — the UPDATE silently no-ops under RLS
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

UPDATE player_equipment_setup_submissions
   SET moderator_notes = 'tampered'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

RESET ROLE;

-- Switch to admin to verify the value did NOT change.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';

SELECT is(
  (
    SELECT moderator_notes FROM player_equipment_setup_submissions
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'reviewed',
  'non-admin UPDATE on someone else''s submission does not persist'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
