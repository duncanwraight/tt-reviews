-- pgTAP tests for RLS on the core `players` table.
-- See rls_equipment.sql for rationale.

BEGIN;

SELECT plan(4);

INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'rls-pl-a@test.local',
   '00000000-0000-0000-0000-000000000000');

INSERT INTO players (id, name, slug) VALUES
  ('bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb', 'Seed Player', 'seed-player');

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO players (name, slug) VALUES ('Anon Hack', 'anon-hack')$$,
  '42501',
  NULL,
  'anon cannot INSERT into players'
);
RESET ROLE;

SET LOCAL ROLE anon;
UPDATE players SET name = 'Hacked'
 WHERE id = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
RESET ROLE;

SELECT is(
  (SELECT name FROM players WHERE id = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb'),
  'Seed Player',
  'anon UPDATE on players does not persist'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO players (name, slug) VALUES ('User Hack', 'user-hack')$$,
  '42501',
  NULL,
  'authenticated user cannot INSERT into players'
);

UPDATE players SET name = 'User Hacked'
 WHERE id = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
RESET ROLE;

SELECT is(
  (SELECT name FROM players WHERE id = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb'),
  'Seed Player',
  'authenticated user UPDATE on players does not persist'
);

SELECT * FROM finish();
ROLLBACK;
