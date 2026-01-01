-- Fix moderator_approvals submission_type constraint
-- - Add player_equipment_setup for equipment setup submissions
-- - Use 'review' instead of 'equipment_review' to match registry submissionType

-- First drop the constraint so we can update data
ALTER TABLE "public"."moderator_approvals" DROP CONSTRAINT "moderator_approvals_submission_type_check";

-- Now update existing rows that use 'equipment_review' to use 'review'
UPDATE "public"."moderator_approvals"
SET submission_type = 'review'
WHERE submission_type = 'equipment_review';

-- Add the new constraint with all valid types
ALTER TABLE "public"."moderator_approvals" ADD CONSTRAINT "moderator_approvals_submission_type_check"
CHECK ((submission_type = ANY (ARRAY['equipment'::text, 'player'::text, 'player_edit'::text, 'review'::text, 'video'::text, 'player_equipment_setup'::text]))) NOT VALID;

ALTER TABLE "public"."moderator_approvals" VALIDATE CONSTRAINT "moderator_approvals_submission_type_check";
