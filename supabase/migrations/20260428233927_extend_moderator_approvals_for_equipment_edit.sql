-- TT-102: extend moderator_approvals.submission_type CHECK to include
-- equipment_edit (TT-74's submission flow).
--
-- Bundled with the SUBMISSION_TYPE_VALUES + registry entry update so
-- registry.test.ts (which pins the tuple against the latest CHECK)
-- stays green.

ALTER TABLE moderator_approvals
  DROP CONSTRAINT moderator_approvals_submission_type_check;

ALTER TABLE moderator_approvals
  ADD CONSTRAINT moderator_approvals_submission_type_check
  CHECK ((submission_type = ANY (ARRAY[
    'equipment'::text,
    'player'::text,
    'player_edit'::text,
    'review'::text,
    'video'::text,
    'player_equipment_setup'::text,
    'equipment_edit'::text
  ])));
