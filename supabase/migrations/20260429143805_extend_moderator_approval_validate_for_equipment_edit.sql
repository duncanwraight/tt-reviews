-- TT-105 follow-up: extend check_moderator_approval_submission_exists
-- to recognise equipment_edit. TT-101 added the typed table + the
-- update_submission_status trigger branch but missed this validator,
-- so any INSERT into moderator_approvals with
-- submission_type='equipment_edit' fell through to the ELSE branch
-- and raised "unknown submission_type" — surfacing as a 500 on
-- /admin/equipment-edits Approve / Reject.

CREATE OR REPLACE FUNCTION check_moderator_approval_submission_exists()
RETURNS TRIGGER AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  CASE NEW.submission_type
    WHEN 'review' THEN
      SELECT EXISTS(SELECT 1 FROM equipment_reviews WHERE id = NEW.submission_id)
        INTO v_exists;
    WHEN 'equipment' THEN
      SELECT EXISTS(SELECT 1 FROM equipment_submissions WHERE id = NEW.submission_id)
        INTO v_exists;
    WHEN 'player' THEN
      SELECT EXISTS(SELECT 1 FROM player_submissions WHERE id = NEW.submission_id)
        INTO v_exists;
    WHEN 'player_edit' THEN
      SELECT EXISTS(SELECT 1 FROM player_edits WHERE id = NEW.submission_id)
        INTO v_exists;
    WHEN 'video' THEN
      SELECT EXISTS(SELECT 1 FROM video_submissions WHERE id = NEW.submission_id)
        INTO v_exists;
    WHEN 'player_equipment_setup' THEN
      SELECT EXISTS(
        SELECT 1 FROM player_equipment_setup_submissions
        WHERE id = NEW.submission_id
      ) INTO v_exists;
    WHEN 'equipment_edit' THEN
      SELECT EXISTS(SELECT 1 FROM equipment_edits WHERE id = NEW.submission_id)
        INTO v_exists;
    ELSE
      RAISE EXCEPTION 'moderator_approvals: unknown submission_type %', NEW.submission_type
        USING ERRCODE = 'check_violation';
  END CASE;

  IF NOT v_exists THEN
    RAISE EXCEPTION
      'moderator_approvals: submission % of type % does not exist',
      NEW.submission_id, NEW.submission_type
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
