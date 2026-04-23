-- pgTAP tests for RLS on player_edits.
-- See rls_equipment_submissions.sql for the rationale.

BEGIN;

SELECT plan(5);

INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'rls-pe-a@test.local',
   '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222',
   'rls-pe-b@test.local',
   '00000000-0000-0000-0000-000000000000');

INSERT INTO players (id, name, slug) VALUES
  ('33333333-3333-3333-3333-333333333333', 'RLS PE Player', 'rls-pe-player');

INSERT INTO player_edits (id, player_id, user_id, edit_data, status) VALUES
  ('aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa',
   '33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   '{"name":"New Name"}'::jsonb,
   'pending');

-- Anon cannot SELECT.
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT 1 FROM player_edits WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa'$$,
  'anon cannot SELECT player_edits'
);
RESET ROLE;

-- User A cannot self-approve.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
UPDATE player_edits SET status = 'approved'
 WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';
SELECT is(
  (SELECT status::text FROM player_edits
     WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa'),
  'pending',
  'user A cannot self-approve their own player_edits row'
);
RESET ROLE;

-- User B cannot tamper with A's row.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
UPDATE player_edits SET moderator_notes = 'tampered'
 WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';
SELECT is(
  (SELECT moderator_notes FROM player_edits
     WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa'),
  NULL,
  'user B cannot tamper with user A player_edits row'
);

-- Admin CAN update.
UPDATE player_edits SET moderator_notes = 'reviewed'
 WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
SELECT is(
  (SELECT moderator_notes FROM player_edits
     WHERE id = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa'),
  'reviewed',
  'admin can UPDATE player_edits'
);
RESET ROLE;

-- Anon cannot INSERT.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO player_edits (player_id, user_id, edit_data)
    VALUES ('33333333-3333-3333-3333-333333333333',
            '11111111-1111-1111-1111-111111111111',
            '{"name":"X"}'::jsonb)$$,
  '42501',
  NULL,
  'anon cannot INSERT into player_edits'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
