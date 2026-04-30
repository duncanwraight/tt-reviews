-- TT-127: lookup helper for the admin Recent Activity widget.
-- The widget needs the email for each app moderator that approved/rejected
-- a submission via the admin UI. Reading from `public.profiles.email` is
-- unreliable on prod — the `handle_new_user` trigger only fires on auth
-- user INSERT, so any user created before that migration, or any email
-- change after signup, leaves `profiles.email` stale or null. The widget
-- ends up rendering "Admin" (the literal fallback) instead of the user's
-- actual email.
--
-- `auth.users` is the source of truth, but the `auth` schema isn't exposed
-- via PostgREST and we don't want to expose it broadly. A SECURITY DEFINER
-- RPC granted only to `service_role` is the minimal surface that solves
-- this — the activity loader already uses the service-role admin client.
--
-- The RPC takes the exact UUIDs the caller wants resolved, so it can't be
-- abused to enumerate users.

CREATE OR REPLACE FUNCTION public.get_user_emails_by_ids(p_ids UUID[])
RETURNS TABLE (id UUID, email TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id, u.email::TEXT
  FROM auth.users u
  WHERE u.id = ANY(p_ids);
$$;

REVOKE ALL ON FUNCTION public.get_user_emails_by_ids(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_emails_by_ids(UUID[]) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_emails_by_ids(UUID[]) TO service_role;
