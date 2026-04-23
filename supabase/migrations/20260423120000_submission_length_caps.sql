-- SECURITY.md Phase 7 (TT-16) — belt-and-braces length caps on the
-- largest user-writable text/JSONB columns. The Workers-side validator in
-- app/lib/submissions/validate.server.ts is the primary defence; these
-- constraints ensure that if a caller ever reaches the DB with the
-- validator bypassed (direct service-role insert, future endpoint that
-- forgets to call it, etc.), an oversized payload is still rejected
-- rather than silently committed.

-- Review text: validator caps at 5000 chars.
ALTER TABLE equipment_reviews
  ADD CONSTRAINT equipment_reviews_review_text_length
  CHECK (review_text IS NULL OR length(review_text) <= 5000);

-- Equipment specifications (inbound and live tables). Validator caps at
-- 5000 chars of text; give the serialized JSON a matching budget.
ALTER TABLE equipment
  ADD CONSTRAINT equipment_specifications_length
  CHECK (specifications IS NULL OR length(specifications::text) <= 10000);

ALTER TABLE equipment_submissions
  ADD CONSTRAINT equipment_submissions_specifications_length
  CHECK (specifications IS NULL OR length(specifications::text) <= 10000);

-- Player edit payload: edit_reason inside this JSON is validator-capped
-- at 2000 chars, plus a handful of short fields — 10000 is generous.
ALTER TABLE player_edits
  ADD CONSTRAINT player_edits_edit_data_length
  CHECK (length(edit_data::text) <= 10000);

-- source_url (live + submission tables): validator caps at 2048 chars.
ALTER TABLE player_equipment_setups
  ADD CONSTRAINT player_equipment_setups_source_url_length
  CHECK (source_url IS NULL OR length(source_url) <= 2048);

ALTER TABLE player_equipment_setup_submissions
  ADD CONSTRAINT pes_submissions_source_url_length
  CHECK (source_url IS NULL OR length(source_url) <= 2048);

-- Video submissions payload — `videos` is a JSONB array of {title, url,
-- platform}. Validator caps the formData text at 20000 chars; the stored
-- JSON after parsing is smaller, so 30000 covers both.
ALTER TABLE video_submissions
  ADD CONSTRAINT video_submissions_videos_length
  CHECK (length(videos::text) <= 30000);

-- player_footage.url — not user-submittable directly, but it's the
-- rendered column. Tighten the cap to match the validator's URL limit.
ALTER TABLE player_footage
  ADD CONSTRAINT player_footage_url_length
  CHECK (length(url) <= 2048);

-- moderator_notes / rejection_reason are admin-only, but also cap them
-- so a runaway paste can't bloat a row indefinitely.
ALTER TABLE equipment_submissions
  ADD CONSTRAINT equipment_submissions_moderator_notes_length
  CHECK (moderator_notes IS NULL OR length(moderator_notes) <= 2000);

ALTER TABLE player_submissions
  ADD CONSTRAINT player_submissions_moderator_notes_length
  CHECK (moderator_notes IS NULL OR length(moderator_notes) <= 2000);

ALTER TABLE player_edits
  ADD CONSTRAINT player_edits_moderator_notes_length
  CHECK (moderator_notes IS NULL OR length(moderator_notes) <= 2000);

ALTER TABLE video_submissions
  ADD CONSTRAINT video_submissions_moderator_notes_length
  CHECK (moderator_notes IS NULL OR length(moderator_notes) <= 2000);

ALTER TABLE player_equipment_setup_submissions
  ADD CONSTRAINT pes_submissions_moderator_notes_length
  CHECK (moderator_notes IS NULL OR length(moderator_notes) <= 2000);
