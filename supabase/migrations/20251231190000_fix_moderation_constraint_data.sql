-- Repair migration: Fix data and constraint for moderator_approvals
-- Previous migration failed because existing 'equipment_review' rows violated new constraint

-- First, update existing rows that use 'equipment_review' to use 'review'
UPDATE "public"."moderator_approvals"
SET submission_type = 'review'
WHERE submission_type = 'equipment_review';

-- Drop the constraint (may be in invalid state from failed migration)
ALTER TABLE "public"."moderator_approvals" DROP CONSTRAINT IF EXISTS "moderator_approvals_submission_type_check";

-- Recreate with all valid submission types
ALTER TABLE "public"."moderator_approvals" ADD CONSTRAINT "moderator_approvals_submission_type_check"
CHECK ((submission_type = ANY (ARRAY['equipment'::text, 'player'::text, 'player_edit'::text, 'review'::text, 'video'::text, 'player_equipment_setup'::text]))) NOT VALID;

ALTER TABLE "public"."moderator_approvals" VALIDATE CONSTRAINT "moderator_approvals_submission_type_check";
