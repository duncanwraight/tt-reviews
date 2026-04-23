-- pgTAP tests for the length CHECK constraints added by
-- 20260423120000_submission_length_caps.sql (SECURITY.md Phase 7, TT-16).
-- Belt-and-braces protection beside the Workers-side validator — this
-- file proves that the DB rejects oversize payloads on its own if the
-- app-layer check is ever bypassed.

BEGIN;

SELECT plan(6);

-- Seed a user + an equipment + a player we can reference as FKs.
INSERT INTO auth.users (id, email, instance_id) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'lencap-user@test.local',
   '00000000-0000-0000-0000-000000000000');

INSERT INTO equipment (id, name, slug, category, manufacturer)
VALUES ('22222222-2222-2222-2222-222222222222',
        'Length Cap Rubber', 'length-cap-rubber',
        'rubber', 'TestCo');

INSERT INTO players (id, name, slug) VALUES
  ('33333333-3333-3333-3333-333333333333',
   'LenCap Player', 'lencap-player');

-- equipment_reviews.review_text cap (5000 chars).
SELECT throws_ok(
  format($$INSERT INTO equipment_reviews (equipment_id, user_id, overall_rating, review_text)
           VALUES ('22222222-2222-2222-2222-222222222222',
                   '11111111-1111-1111-1111-111111111111',
                   5,
                   %L)$$, repeat('x', 5001)),
  '23514',  -- check_violation
  NULL,
  'equipment_reviews rejects review_text over 5000 chars'
);

-- player_edits.edit_data cap (10000 chars of JSON).
SELECT throws_ok(
  format($$INSERT INTO player_edits (player_id, user_id, edit_data)
           VALUES ('33333333-3333-3333-3333-333333333333',
                   '11111111-1111-1111-1111-111111111111',
                   jsonb_build_object('edit_reason', %L))$$,
         repeat('x', 10001)),
  '23514',
  NULL,
  'player_edits rejects edit_data over 10000 chars'
);

-- player_equipment_setups.source_url cap (2048 chars).
SELECT throws_ok(
  format($$INSERT INTO player_equipment_setups (player_id, year, source_url)
           VALUES ('33333333-3333-3333-3333-333333333333', 2024, %L)$$,
         'https://example.com/' || repeat('a', 2100)),
  '23514',
  NULL,
  'player_equipment_setups rejects source_url over 2048 chars'
);

-- player_equipment_setup_submissions.source_url cap.
SELECT throws_ok(
  format($$INSERT INTO player_equipment_setup_submissions
           (user_id, player_id, year, source_url)
           VALUES ('11111111-1111-1111-1111-111111111111',
                   '33333333-3333-3333-3333-333333333333',
                   2024, %L)$$,
         'https://example.com/' || repeat('a', 2100)),
  '23514',
  NULL,
  'player_equipment_setup_submissions rejects source_url over 2048 chars'
);

-- Well-formed row of acceptable size still writes through.
INSERT INTO equipment_reviews (equipment_id, user_id, overall_rating, review_text)
VALUES ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        7,
        'within limits');

SELECT is(
  (SELECT review_text FROM equipment_reviews
    WHERE user_id = '11111111-1111-1111-1111-111111111111'
      AND overall_rating = 7),
  'within limits',
  'a normal-sized review row still inserts cleanly'
);

-- video_submissions.videos JSON cap.
SELECT throws_ok(
  format($$INSERT INTO video_submissions (user_id, player_id, videos)
           VALUES ('11111111-1111-1111-1111-111111111111',
                   '33333333-3333-3333-3333-333333333333',
                   jsonb_build_array(jsonb_build_object('url', %L)))$$,
         'https://example.com/' || repeat('v', 30100)),
  '23514',
  NULL,
  'video_submissions rejects videos payload over 30000 chars'
);

SELECT * FROM finish();
ROLLBACK;
