-- TT-184: surface user-signup volume on the /admin dashboard.
--
-- Extends get_admin_dashboard_counts to return three additional totals:
--   usersTotal       — every row in auth.users
--   usersLast7Days   — created_at >= now() - interval '7 days'
--   usersLast30Days  — created_at >= now() - interval '30 days'
--
-- auth.users is the source of truth — public.profiles was dropped in TT-128
-- (see app/lib/admin/activity.server.ts and the get_user_emails_by_ids RPC
-- for the established pattern of reaching into auth.users from a SECURITY
-- DEFINER function with SET search_path = '').
--
-- The three counts collapse into the single existing RPC trip rather than
-- adding new PostgREST queries, so the /admin loader's subrequest budget is
-- unchanged (CLAUDE.md '50-subrequest cap on Free plan').

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_counts()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  WITH
    statuses AS (
      SELECT unnest(ARRAY[
        'pending',
        'awaiting_second_approval',
        'approved',
        'rejected'
      ]) AS status
    ),
    by_status AS (
      SELECT 'equipmentSubmissions' AS table_key, s.status, COALESCE(c.count, 0) AS count
        FROM statuses s
   LEFT JOIN (SELECT status::TEXT AS status, COUNT(*) AS count FROM public.equipment_submissions GROUP BY status) c
          ON c.status = s.status
      UNION ALL
      SELECT 'equipmentEdits', s.status, COALESCE(c.count, 0)
        FROM statuses s
   LEFT JOIN (SELECT status::TEXT AS status, COUNT(*) AS count FROM public.equipment_edits GROUP BY status) c
          ON c.status = s.status
      UNION ALL
      SELECT 'playerSubmissions', s.status, COALESCE(c.count, 0)
        FROM statuses s
   LEFT JOIN (SELECT status::TEXT AS status, COUNT(*) AS count FROM public.player_submissions GROUP BY status) c
          ON c.status = s.status
      UNION ALL
      SELECT 'playerEdits', s.status, COALESCE(c.count, 0)
        FROM statuses s
   LEFT JOIN (SELECT status::TEXT AS status, COUNT(*) AS count FROM public.player_edits GROUP BY status) c
          ON c.status = s.status
      UNION ALL
      SELECT 'equipmentReviews', s.status, COALESCE(c.count, 0)
        FROM statuses s
   LEFT JOIN (SELECT status::TEXT AS status, COUNT(*) AS count FROM public.equipment_reviews GROUP BY status) c
          ON c.status = s.status
      UNION ALL
      SELECT 'videoSubmissions', s.status, COALESCE(c.count, 0)
        FROM statuses s
   LEFT JOIN (SELECT status::TEXT AS status, COUNT(*) AS count FROM public.video_submissions GROUP BY status) c
          ON c.status = s.status
      UNION ALL
      SELECT 'playerEquipmentSetups', s.status, COALESCE(c.count, 0)
        FROM statuses s
   LEFT JOIN (SELECT status::TEXT AS status, COUNT(*) AS count FROM public.player_equipment_setup_submissions GROUP BY status) c
          ON c.status = s.status
    ),
    by_status_grouped AS (
      SELECT table_key, jsonb_object_agg(status, count) AS status_counts
        FROM by_status
       GROUP BY table_key
    )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'equipmentSubmissions',  (SELECT COUNT(*) FROM public.equipment_submissions),
      'equipmentEdits',        (SELECT COUNT(*) FROM public.equipment_edits),
      'playerSubmissions',     (SELECT COUNT(*) FROM public.player_submissions),
      'playerEdits',           (SELECT COUNT(*) FROM public.player_edits),
      'equipmentReviews',      (SELECT COUNT(*) FROM public.equipment_reviews),
      'videoSubmissions',      (SELECT COUNT(*) FROM public.video_submissions),
      'playerEquipmentSetups', (SELECT COUNT(*) FROM public.player_equipment_setup_submissions),
      'equipment',             (SELECT COUNT(*) FROM public.equipment),
      'players',               (SELECT COUNT(*) FROM public.players),
      'usersTotal',            (SELECT COUNT(*) FROM auth.users),
      'usersLast7Days',        (SELECT COUNT(*) FROM auth.users WHERE created_at >= now() - interval '7 days'),
      'usersLast30Days',       (SELECT COUNT(*) FROM auth.users WHERE created_at >= now() - interval '30 days')
    ),
    'byStatus', (SELECT jsonb_object_agg(table_key, status_counts) FROM by_status_grouped)
  );
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_counts() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_counts() TO service_role;
