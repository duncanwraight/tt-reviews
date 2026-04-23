-- pgTAP tests for RLS on player_submissions.
-- See rls_equipment_submissions.sql for the rationale.

BEGIN;

SELECT plan(5);

INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'rls-ps-a@test.local',
   '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222',
   'rls-ps-b@test.local',
   '00000000-0000-0000-0000-000000000000');

INSERT INTO player_submissions (id, user_id, name, status) VALUES
  ('aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Pending Player',
   'pending');

-- Anon cannot SELECT.
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT 1 FROM player_submissions WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'$$,
  'anon cannot SELECT player_submissions'
);
RESET ROLE;

-- User A cannot self-approve.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
UPDATE player_submissions SET status = 'approved'
 WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';
SELECT is(
  (SELECT status::text FROM player_submissions
     WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'),
  'pending',
  'user A cannot self-approve their own player_submissions row'
);
RESET ROLE;

-- User B cannot tamper.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
UPDATE player_submissions SET moderator_notes = 'tampered'
 WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';
SELECT is(
  (SELECT moderator_notes FROM player_submissions
     WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'),
  NULL,
  'user B cannot tamper with user A player_submissions row'
);

-- Admin can update.
UPDATE player_submissions SET moderator_notes = 'reviewed'
 WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa';
SELECT is(
  (SELECT moderator_notes FROM player_submissions
     WHERE id = 'aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa'),
  'reviewed',
  'admin can UPDATE player_submissions'
);
RESET ROLE;

-- Anon cannot INSERT.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO player_submissions (user_id, name)
    VALUES ('11111111-1111-1111-1111-111111111111', 'X')$$,
  '42501',
  NULL,
  'anon cannot INSERT into player_submissions'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
