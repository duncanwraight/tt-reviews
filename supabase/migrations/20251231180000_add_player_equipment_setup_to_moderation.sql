-- Fix moderator_approvals submission_type constraint
-- - Add player_equipment_setup for equipment setup submissions
-- - Use 'review' instead of 'equipment_review' to match registry submissionType

ALTER TABLE "public"."moderator_approvals" DROP CONSTRAINT "moderator_approvals_submission_type_check";

ALTER TABLE "public"."moderator_approvals" ADD CONSTRAINT "moderator_approvals_submission_type_check"
CHECK ((submission_type = ANY (ARRAY['equipment'::text, 'player'::text, 'player_edit'::text, 'review'::text, 'video'::text, 'player_equipment_setup'::text]))) NOT VALID;

ALTER TABLE "public"."moderator_approvals" VALIDATE CONSTRAINT "moderator_approvals_submission_type_check";
