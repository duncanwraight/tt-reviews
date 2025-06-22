-- Add missing submission types to moderator_approvals table constraint
-- This allows the Discord moderation service to handle equipment reviews and videos

alter table "public"."moderator_approvals" drop constraint "moderator_approvals_submission_type_check";

alter table "public"."moderator_approvals" add constraint "moderator_approvals_submission_type_check" 
CHECK ((submission_type = ANY (ARRAY['equipment'::text, 'player'::text, 'player_edit'::text, 'equipment_review'::text, 'video'::text]))) not valid;

alter table "public"."moderator_approvals" validate constraint "moderator_approvals_submission_type_check";