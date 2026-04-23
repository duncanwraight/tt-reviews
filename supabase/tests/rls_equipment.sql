-- pgTAP tests for RLS on the core `equipment` table.
-- Pins Phase 3 part 2 of SECURITY.md: the old public INSERT/UPDATE
-- policies (migrations 20250609220200, 20250609220300, 20250610195700)
-- let anyone with the anon key create or rewrite equipment rows from a
-- browser console. All legitimate writes go through the service-role
-- client, which bypasses RLS — so these policies should be closed.

BEGIN;

SELECT plan(4);

INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'rls-eq-a@test.local',
   '00000000-0000-0000-0000-000000000000');

-- Seed one equipment row. The pgTAP session runs as table owner, so RLS
-- does not apply to the seed itself.
INSERT INTO equipment (id, name, slug, category, manufacturer) VALUES
  ('eeeeeeee-1111-1111-1111-eeeeeeeeeeee', 'Seed Blade', 'seed-blade', 'blade', 'SeedCo');

-- Anon cannot INSERT.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO equipment (name, slug, category, manufacturer)
    VALUES ('Anon Hack', 'anon-hack', 'blade', 'Evil')$$,
  '42501',
  NULL,
  'anon cannot INSERT into equipment'
);
RESET ROLE;

-- Anon cannot UPDATE.
SET LOCAL ROLE anon;
UPDATE equipment SET name = 'Hacked'
 WHERE id = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee';
RESET ROLE;

SELECT is(
  (SELECT name FROM equipment
     WHERE id = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee'),
  'Seed Blade',
  'anon UPDATE on equipment does not persist'
);

-- Authenticated user cannot INSERT.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO equipment (name, slug, category, manufacturer)
    VALUES ('User Hack', 'user-hack', 'blade', 'Evil')$$,
  '42501',
  NULL,
  'authenticated user cannot INSERT into equipment'
);

-- Authenticated user cannot UPDATE.
UPDATE equipment SET name = 'User Hacked'
 WHERE id = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee';
RESET ROLE;

SELECT is(
  (SELECT name FROM equipment
     WHERE id = 'eeeeeeee-1111-1111-1111-eeeeeeeeeeee'),
  'Seed Blade',
  'authenticated user UPDATE on equipment does not persist'
);

SELECT * FROM finish();
ROLLBACK;
