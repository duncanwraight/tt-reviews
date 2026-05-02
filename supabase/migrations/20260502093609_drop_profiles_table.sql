-- Drop the now-unused public.profiles table (TT-128).
--
-- TT-127 switched the admin Recent Activity widget off `profiles.email`
-- and onto `auth.users` via the `get_user_emails_by_ids` RPC. After
-- that change nothing in app/ or workers/ reads `profiles`. The
-- table's `role` column has been vestigial since the RBAC migration
-- (20250612221534_implement_proper_rbac_with_auth_hooks.sql) moved
-- roles to `user_roles` + a JWT auth hook.
--
-- Steps:
--   1. Drop the on-signup trigger + handle_new_user() function so
--      auth.users INSERT no longer tries to populate profiles.
--   2. Repoint equipment_photo_candidates.picked_by at auth.users(id)
--      so the audit trail survives the profiles drop. profiles.id was
--      itself a FK to auth.users(id), so any extant picked_by value
--      already exists in auth.users.
--   3. Drop profiles' updated_at trigger, RLS policies, and the table.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

ALTER TABLE public.equipment_photo_candidates
  DROP CONSTRAINT IF EXISTS equipment_photo_candidates_picked_by_fkey;

ALTER TABLE public.equipment_photo_candidates
  ADD CONSTRAINT equipment_photo_candidates_picked_by_fkey
  FOREIGN KEY (picked_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.equipment_photo_candidates.picked_by
  IS 'Admin auth.users.id who picked this candidate.';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;

DROP TABLE IF EXISTS public.profiles;
