-- pgTAP tests for RLS on equipment_submissions.
-- Pins the Phase 3 fix from SECURITY.md: the old
-- "FOR UPDATE USING (auth.uid() IS NOT NULL)" let any authenticated
-- user self-approve or tamper with another user's submission.

BEGIN;

SELECT plan(5);

-- ----------------------------------------------------------------------
-- Seed: two users and one pending submission owned by user A.
-- ----------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'rls-es-a@test.local',
   '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222',
   'rls-es-b@test.local',
   '00000000-0000-0000-0000-000000000000');

INSERT INTO equipment_submissions (id, user_id, name, manufacturer, category, status) VALUES
  ('aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Test Blade',
   'Acme',
   'blade',
   'pending');

-- ----------------------------------------------------------------------
-- Anon cannot SELECT a pending submission.
-- ----------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT 1 FROM equipment_submissions
    WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'$$,
  'anon cannot SELECT equipment_submissions'
);
RESET ROLE;

-- ----------------------------------------------------------------------
-- User A cannot self-approve their own submission. The UPDATE silently
-- no-ops under the new admin-only policy.
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

UPDATE equipment_submissions
   SET status = 'approved'
 WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';

SELECT is(
  (SELECT status::text FROM equipment_submissions
     WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'),
  'pending',
  'user A cannot self-approve their own equipment_submissions row'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- User B cannot update user A's submission (cross-user tamper).
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

UPDATE equipment_submissions
   SET moderator_notes = 'tampered by user B'
 WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';

SELECT is(
  (SELECT moderator_notes FROM equipment_submissions
     WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'),
  NULL,
  'user B cannot tamper with user A equipment_submissions row'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Admin CAN update (for moderation) and the change persists.
-- ----------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';

UPDATE equipment_submissions
   SET moderator_notes = 'reviewed by admin'
 WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

SELECT is(
  (SELECT moderator_notes FROM equipment_submissions
     WHERE id = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa'),
  'reviewed by admin',
  'admin can UPDATE equipment_submissions'
);

RESET ROLE;

-- ----------------------------------------------------------------------
-- Anon INSERT denied (no policy allows it).
-- ----------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO equipment_submissions (user_id, name, manufacturer, category)
    VALUES ('11111111-1111-1111-1111-111111111111','X','Y','blade')$$,
  '42501',
  NULL,
  'anon cannot INSERT into equipment_submissions'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
