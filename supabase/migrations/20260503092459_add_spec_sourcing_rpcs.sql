-- RPCs for the spec-sourcing pipeline (TT-149). Two SECURITY DEFINER
-- functions, both granted EXECUTE only to service_role because every
-- caller is the admin / cron client path that already runs as
-- service_role.
--
-- These exist because the cron's enqueue path (workers/app.ts ->
-- scheduled() -> enqueueSpecSourceBatch) and the admin dashboard's
-- spec-sourcing widget both fan out to ~6 PostgREST queries each.
-- That hits the 50-subrequest Cloudflare Workers Free cap fast — see
-- CLAUDE.md "Cloudflare Workers — 50-subrequest cap on Free plan" for
-- the canonical incident (TT-145). Collapsing both call sites to one
-- RPC keeps the cron + dashboard well under budget.

----------------------------------------------------------------------------
-- pick_spec_source_batch: equipment rows due for spec sourcing.
--
-- Selection rule mirrors the parent ticket (TT-145):
--   * specs_source_status IS NULL                                       -- never sourced
--   * specs_source_status = 'fresh'      AND specs_sourced_at < 6 mo    -- recheck after 6 months
--   * specs_source_status = 'no_results' AND specs_sourced_at < 14 days -- retry after 14 days
--
-- Ordered by specs_sourced_at NULLS FIRST so never-sourced rows lead
-- and oldest-touched comes next — matches the partial index on
-- equipment(specs_sourced_at NULLS FIRST) created in TT-146.
--
-- Returns a JSONB array of:
--   { equipment_id, slug, brand, name, category, subcategory }
-- The cron handler iterates and enqueues one queue message per row.
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pick_spec_source_batch(p_limit INT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'equipment_id', e.id,
        'slug',         e.slug,
        'brand',        e.manufacturer,
        'name',         e.name,
        'category',     e.category,
        'subcategory',  e.subcategory
      )
      ORDER BY e.specs_sourced_at NULLS FIRST, e.id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT id, slug, manufacturer, name, category, subcategory, specs_sourced_at
      FROM public.equipment
     WHERE specs_source_status IS NULL
        OR (specs_source_status = 'fresh'
            AND specs_sourced_at < (NOW() - INTERVAL '6 months'))
        OR (specs_source_status = 'no_results'
            AND specs_sourced_at < (NOW() - INTERVAL '14 days'))
     ORDER BY specs_sourced_at NULLS FIRST, id
     LIMIT GREATEST(p_limit, 0)
  ) e;
$$;

REVOKE ALL ON FUNCTION public.pick_spec_source_batch(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pick_spec_source_batch(INT) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.pick_spec_source_batch(INT) TO service_role;

COMMENT ON FUNCTION public.pick_spec_source_batch(INT) IS
  'Pick the next batch of equipment rows due for spec sourcing (TT-145). One PostgREST call instead of probing equipment per cooldown bucket.';

----------------------------------------------------------------------------
-- get_spec_sourcing_status: dashboard signals for the admin widget.
--
-- Returns:
--   {
--     last_activity_at:   timestamptz | null,  -- MAX(equipment.specs_sourced_at)
--     pending_review:     int,                 -- equipment_spec_proposals.status='pending_review'
--     never_sourced:      int,                 -- equipment.specs_source_status IS NULL
--     in_cooldown:        int,                 -- specs_source_status='no_results' AND <14d ago
--     applied_total:      int                  -- equipment_spec_proposals.status='applied'
--   }
--
-- last_activity_at is the closest signal we have to "when did the cron
-- last finish work" without a dedicated cron-runs table — every
-- successful per-equipment run stamps specs_sourced_at, so MAX over
-- the equipment table is a strict lower bound on cron health. Empty
-- runs (everything in cooldown, nothing to do) don't bump this; an
-- actual cron failure fires a Discord alert via the standard
-- Logger.error path so missing-bumps doesn't equal silent failure.
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_spec_sourcing_status()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT jsonb_build_object(
    'last_activity_at', (SELECT MAX(specs_sourced_at) FROM public.equipment),
    'pending_review',   (SELECT COUNT(*)::INT FROM public.equipment_spec_proposals WHERE status = 'pending_review'),
    'never_sourced',    (SELECT COUNT(*)::INT FROM public.equipment WHERE specs_source_status IS NULL),
    'in_cooldown',      (SELECT COUNT(*)::INT FROM public.equipment
                          WHERE specs_source_status = 'no_results'
                            AND specs_sourced_at >= (NOW() - INTERVAL '14 days')),
    'applied_total',    (SELECT COUNT(*)::INT FROM public.equipment_spec_proposals WHERE status = 'applied')
  );
$$;

REVOKE ALL ON FUNCTION public.get_spec_sourcing_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_spec_sourcing_status() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_spec_sourcing_status() TO service_role;

COMMENT ON FUNCTION public.get_spec_sourcing_status() IS
  'Spec-sourcing dashboard signals: last cron activity, pending-review queue depth, never-sourced count, in-cooldown count, applied total. Single round-trip for the admin widget.';
