-- Sitemap lastmod RPCs (TT-155).
--
-- Sitemap entries currently use parent.updated_at for detail pages and now()
-- for everything else. The now() default trains Google to ignore lastmod
-- entirely (its trust system is binary — once flagged inaccurate, all
-- lastmod from this site is discarded). The parent-only path also misses
-- the actual freshness signal: a new approved review for an equipment row
-- is the moment its detail page changed, even though the row itself didn't.
--
-- Building per-row "latest child" maps the naive way (one PostgREST query
-- per equipment id) would blow the Cloudflare Workers Free 50-subrequest
-- cap on prod (no enforcement locally — TT-145). These two RPCs collapse
-- the fan-out to one round-trip each.
--
-- Both SECURITY DEFINER, EXECUTE granted only to service_role, mirroring
-- the get_admin_dashboard_* pattern in 20260502140620.

----------------------------------------------------------------------------
-- get_equipment_review_lastmods: equipment_id → MAX(updated_at) over the
-- approved-review set, as a JSONB object {uuid_text: iso_timestamp}.
-- Equipment rows with no approved reviews are absent from the map; callers
-- fall back to equipment.updated_at for those.
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_equipment_review_lastmods()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(
    jsonb_object_agg(equipment_id::text, max_at),
    '{}'::jsonb
  )
  FROM (
    SELECT equipment_id, MAX(updated_at) AS max_at
      FROM public.equipment_reviews
     WHERE status = 'approved'
     GROUP BY equipment_id
  ) t;
$$;

REVOKE ALL ON FUNCTION public.get_equipment_review_lastmods() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_equipment_review_lastmods() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_equipment_review_lastmods() TO service_role;

----------------------------------------------------------------------------
-- get_player_activity_lastmods: player_id → MAX(updated_at) across the
-- two child tables that are surfaced on /players/:slug:
--   * player_equipment_setups (canonical, no status column)
--   * player_footage WHERE active = true (inactive videos are hidden)
-- Returned as JSONB {uuid_text: iso_timestamp}; players with neither
-- setups nor active footage are absent from the map.
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_player_activity_lastmods()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(
    jsonb_object_agg(player_id::text, max_at),
    '{}'::jsonb
  )
  FROM (
    SELECT player_id, MAX(updated_at) AS max_at
      FROM (
        SELECT player_id, updated_at FROM public.player_equipment_setups
        UNION ALL
        SELECT player_id, updated_at FROM public.player_footage WHERE active = TRUE
      ) all_activity
     GROUP BY player_id
  ) t;
$$;

REVOKE ALL ON FUNCTION public.get_player_activity_lastmods() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_player_activity_lastmods() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_player_activity_lastmods() TO service_role;
