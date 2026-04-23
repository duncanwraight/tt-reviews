-- DISCORD-HARDENING Sub-problem A: belt-and-braces guard against orphan
-- moderator_approvals INSERTs. The polymorphic (submission_type,
-- submission_id) pair can't use a real FK, so we enforce existence via
-- a BEFORE INSERT trigger that maps submission_type to its typed table.
--
-- Triggered historical bug: dev-Discord button clicks landed on the prod
-- Interactions Endpoint URL and inserted audit rows referencing review
-- IDs that only existed in local Supabase. Handler path now rejects this
-- at the service layer (moderation.server.ts); the trigger below is the
-- second line of defense — any caller that bypasses the service still
-- cannot pollute the audit log.

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

DROP TRIGGER IF EXISTS moderator_approvals_validate_submission
  ON moderator_approvals;

CREATE TRIGGER moderator_approvals_validate_submission
  BEFORE INSERT ON moderator_approvals
  FOR EACH ROW
  EXECUTE FUNCTION check_moderator_approval_submission_exists();
