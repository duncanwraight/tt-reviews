-- Admin dashboard RPCs to collapse the /admin loader's subrequest fan-out.
--
-- The dashboard previously made one PostgREST count query per (queue × status)
-- plus per-table totals plus a "find oldest pending" probe per queue plus a
-- separate fan-out for equipment-photo coverage. That tipped the Worker over
-- the Cloudflare Workers Free 50-subrequests-per-invocation cap, so the
-- loader's later parallel calls (similar-equipment status, activity-widget
-- name lookups) silently failed with "Too many subrequests" and the
-- dashboard rendered fallback values.
--
-- These three RPCs replace ~49 PostgREST trips with 3.
--
-- All three are SECURITY DEFINER so the function can read tables the caller
-- might not own; granted EXECUTE only to service_role because every call site
-- is the admin-client path that already gates on user role in the loader.

----------------------------------------------------------------------------
-- get_admin_dashboard_counts: totals + byStatus for every moderation queue.
-- Returns a JSONB blob shaped exactly like AdminDashboardCounts in TS.
-- Status values are padded with zero defaults so callers don't need to
-- merge against an empty template.
----------------------------------------------------------------------------
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
    -- (table_key, status) → count, padded so every status appears even when 0.
    -- Status columns are the public.review_status enum; we compare on TEXT to
    -- avoid pulling the enum type into search_path.
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
      'players',               (SELECT COUNT(*) FROM public.players)
    ),
    'byStatus', (SELECT jsonb_object_agg(table_key, status_counts) FROM by_status_grouped)
  );
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_counts() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_counts() TO service_role;

----------------------------------------------------------------------------
-- get_admin_oldest_pending: globally oldest pending/awaiting_second_approval
-- row across every moderation queue. Returns 0 or 1 row.
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_oldest_pending()
RETURNS TABLE (table_name TEXT, waiting_since TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT t.table_name, t.created_at AS waiting_since
    FROM (
      SELECT 'equipment_submissions' AS table_name, created_at
        FROM public.equipment_submissions
       WHERE status IN ('pending', 'awaiting_second_approval')
      UNION ALL
      SELECT 'equipment_edits', created_at
        FROM public.equipment_edits
       WHERE status IN ('pending', 'awaiting_second_approval')
      UNION ALL
      SELECT 'player_submissions', created_at
        FROM public.player_submissions
       WHERE status IN ('pending', 'awaiting_second_approval')
      UNION ALL
      SELECT 'player_edits', created_at
        FROM public.player_edits
       WHERE status IN ('pending', 'awaiting_second_approval')
      UNION ALL
      SELECT 'equipment_reviews', created_at
        FROM public.equipment_reviews
       WHERE status IN ('pending', 'awaiting_second_approval')
      UNION ALL
      SELECT 'video_submissions', created_at
        FROM public.video_submissions
       WHERE status IN ('pending', 'awaiting_second_approval')
      UNION ALL
      SELECT 'player_equipment_setup_submissions', created_at
        FROM public.player_equipment_setup_submissions
       WHERE status IN ('pending', 'awaiting_second_approval')
    ) t
   ORDER BY t.created_at ASC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_admin_oldest_pending() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_oldest_pending() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_oldest_pending() TO service_role;

----------------------------------------------------------------------------
-- get_admin_photo_coverage: equipment photo coverage buckets in one trip.
-- Mirrors the five head-counts loadCoverageCounts() makes today.
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_photo_coverage()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT jsonb_build_object(
    'picked',           COUNT(*) FILTER (WHERE image_key IS NOT NULL),
    'unsourced',        COUNT(*) FILTER (
                          WHERE image_key IS NULL
                            AND image_skipped_at IS NULL
                            AND image_sourcing_attempted_at IS NULL),
    'attemptedNoImage', COUNT(*) FILTER (
                          WHERE image_key IS NULL
                            AND image_skipped_at IS NULL
                            AND image_sourcing_attempted_at IS NOT NULL),
    'skipped',          COUNT(*) FILTER (WHERE image_skipped_at IS NOT NULL),
    'total',            COUNT(*)
  )
  FROM public.equipment;
$$;

REVOKE ALL ON FUNCTION public.get_admin_photo_coverage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_photo_coverage() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_photo_coverage() TO service_role;
