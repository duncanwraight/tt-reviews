-- pgTAP tests for RLS on the core `player_equipment_setups` table.
-- Also pins that non-admins cannot set verified=true, which was the
-- escape hatch called out in SECURITY.md Phase 3.

BEGIN;

SELECT plan(5);

INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'rls-pes-a@test.local',
   '00000000-0000-0000-0000-000000000000');

INSERT INTO players (id, name, slug) VALUES
  ('cccccccc-1111-1111-1111-cccccccccccc', 'Seed PES Player', 'seed-pes-player');
INSERT INTO player_equipment_setups (id, player_id, year, verified) VALUES
  ('dddddddd-1111-1111-1111-dddddddddddd',
   'cccccccc-1111-1111-1111-cccccccccccc',
   2024,
   true);
INSERT INTO player_equipment_setups (id, player_id, year, verified) VALUES
  ('dddddddd-2222-2222-2222-dddddddddddd',
   'cccccccc-1111-1111-1111-cccccccccccc',
   2023,
   false);

-- Anon cannot INSERT.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO player_equipment_setups (player_id, year, verified)
    VALUES ('cccccccc-1111-1111-1111-cccccccccccc', 2022, true)$$,
  '42501',
  NULL,
  'anon cannot INSERT into player_equipment_setups'
);
RESET ROLE;

-- Anon cannot UPDATE (even visible verified rows).
SET LOCAL ROLE anon;
UPDATE player_equipment_setups SET source_url = 'https://evil.example'
 WHERE id = 'dddddddd-1111-1111-1111-dddddddddddd';
RESET ROLE;

SELECT is(
  (SELECT source_url FROM player_equipment_setups
     WHERE id = 'dddddddd-1111-1111-1111-dddddddddddd'),
  NULL,
  'anon UPDATE on player_equipment_setups does not persist'
);

-- Authenticated user cannot INSERT.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO player_equipment_setups (player_id, year, verified)
    VALUES ('cccccccc-1111-1111-1111-cccccccccccc', 2022, true)$$,
  '42501',
  NULL,
  'authenticated user cannot INSERT into player_equipment_setups'
);

-- Authenticated user cannot UPDATE a verified=true row.
UPDATE player_equipment_setups SET source_url = 'https://user-evil.example'
 WHERE id = 'dddddddd-1111-1111-1111-dddddddddddd';
RESET ROLE;

SELECT is(
  (SELECT source_url FROM player_equipment_setups
     WHERE id = 'dddddddd-1111-1111-1111-dddddddddddd'),
  NULL,
  'authenticated user UPDATE on verified player_equipment_setups does not persist'
);

-- Authenticated user cannot flip verified=false → true on someone's row.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
UPDATE player_equipment_setups SET verified = true
 WHERE id = 'dddddddd-2222-2222-2222-dddddddddddd';
RESET ROLE;

SELECT is(
  (SELECT verified FROM player_equipment_setups
     WHERE id = 'dddddddd-2222-2222-2222-dddddddddddd'),
  false,
  'authenticated user cannot flip verified=true on player_equipment_setups'
);

SELECT * FROM finish();
ROLLBACK;
