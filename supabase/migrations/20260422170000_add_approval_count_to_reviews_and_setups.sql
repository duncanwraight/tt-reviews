-- The update_submission_status trigger (introduced in
-- 20260101120000_admin_ui_single_approval) writes approval_count on every
-- submission table it touches. approval_count was originally added only to
-- equipment_submissions, player_submissions and player_edits (20250614000000),
-- and later to video_submissions (20250622072500). It was never added to
-- equipment_reviews or player_equipment_setup_submissions, so every admin
-- approval for those two submission types fails with
-- `column "approval_count" of relation ... does not exist` — the trigger
-- throws, the moderator_approvals INSERT rolls back, and the admin UI
-- silently reports success via its 302 redirect while nothing changes.
--
-- Add the column to the two missing tables and backfill with counts from
-- moderator_approvals so existing "stuck pending" rows get a sensible value.

ALTER TABLE equipment_reviews
  ADD COLUMN IF NOT EXISTS approval_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE player_equipment_setup_submissions
  ADD COLUMN IF NOT EXISTS approval_count INTEGER NOT NULL DEFAULT 0;

UPDATE equipment_reviews r
SET approval_count = sub.c
FROM (
  SELECT submission_id, COUNT(*)::int AS c
  FROM moderator_approvals
  WHERE submission_type = 'review'
    AND action = 'approved'
  GROUP BY submission_id
) sub
WHERE r.id = sub.submission_id;

UPDATE player_equipment_setup_submissions s
SET approval_count = sub.c
FROM (
  SELECT submission_id, COUNT(*)::int AS c
  FROM moderator_approvals
  WHERE submission_type = 'player_equipment_setup'
    AND action = 'approved'
  GROUP BY submission_id
) sub
WHERE s.id = sub.submission_id;
