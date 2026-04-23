-- pgTAP tests for RLS on video_submissions.
-- See rls_equipment_submissions.sql for the rationale.

BEGIN;

SELECT plan(5);

INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'rls-vs-a@test.local',
   '00000000-0000-0000-0000-000000000000'),
  ('22222222-2222-2222-2222-222222222222',
   'rls-vs-b@test.local',
   '00000000-0000-0000-0000-000000000000');

INSERT INTO players (id, name, slug) VALUES
  ('33333333-3333-3333-3333-333333333333', 'RLS VS Player', 'rls-vs-player');

INSERT INTO video_submissions (id, user_id, player_id, videos, status) VALUES
  ('aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333',
   '[]'::jsonb,
   'pending');

SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT 1 FROM video_submissions WHERE id = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa'$$,
  'anon cannot SELECT video_submissions'
);
RESET ROLE;

-- User A cannot self-approve.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
UPDATE video_submissions SET status = 'approved'
 WHERE id = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';
SELECT is(
  (SELECT status::text FROM video_submissions
     WHERE id = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa'),
  'pending',
  'user A cannot self-approve their own video_submissions row'
);
RESET ROLE;

-- User B cannot tamper.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
UPDATE video_submissions SET moderator_notes = 'tampered'
 WHERE id = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa';
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","user_role":"admin"}';
SELECT is(
  (SELECT moderator_notes FROM video_submissions
     WHERE id = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa'),
  NULL,
  'user B cannot tamper with user A video_submissions row'
);

UPDATE video_submissions SET moderator_notes = 'reviewed'
 WHERE id = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa';
SELECT is(
  (SELECT moderator_notes FROM video_submissions
     WHERE id = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa'),
  'reviewed',
  'admin can UPDATE video_submissions'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$INSERT INTO video_submissions (user_id, player_id, videos)
    VALUES ('11111111-1111-1111-1111-111111111111',
            '33333333-3333-3333-3333-333333333333',
            '[]'::jsonb)$$,
  '42501',
  NULL,
  'anon cannot INSERT into video_submissions'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
