alter table "public"."moderator_approvals" drop constraint "moderator_approvals_submission_type_check";

alter table "public"."moderator_approvals" add constraint "moderator_approvals_submission_type_check" CHECK ((submission_type = ANY (ARRAY['equipment'::text, 'player'::text, 'player_edit'::text]))) not valid;

alter table "public"."moderator_approvals" validate constraint "moderator_approvals_submission_type_check";


