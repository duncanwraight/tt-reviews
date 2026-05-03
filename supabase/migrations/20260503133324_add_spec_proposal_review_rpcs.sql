-- RPCs for the admin spec-proposal review flow (TT-150). Three
-- SECURITY DEFINER functions, each granted EXECUTE only to
-- service_role:
--
--   1. list_pending_spec_proposals(p_limit)  — admin queue loader.
--      Joins proposal + equipment for the table view in one round-trip.
--   2. apply_spec_proposal(p_id, p_specifications, p_description,
--                          p_reviewer)
--      Atomic update: writes the validated values back to
--      equipment.specifications + equipment.description + cooldown
--      stamps, then marks the proposal `applied` with reviewer audit.
--   3. reject_spec_proposal(p_id, p_reviewer)
--      Marks the proposal `rejected`. Stamps equipment.specs_source_
--      status='no_results' so the cron's 14-day cooldown applies — a
--      reject is "no usable result this round" from the operator's
--      view, even though the underlying source data isn't exhausted.
--
-- Both apply and reject are no-ops on already-reviewed rows (status
-- check) so a double-click can't double-stamp the audit columns.

----------------------------------------------------------------------------
-- list_pending_spec_proposals
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_pending_spec_proposals(
  p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  WITH rows AS (
    SELECT
      p.id,
      p.equipment_id,
      p.created_at,
      p.merged,
      e.name           AS equipment_name,
      e.slug           AS equipment_slug,
      e.manufacturer   AS equipment_brand,
      e.category       AS equipment_category,
      e.subcategory    AS equipment_subcategory
      FROM public.equipment_spec_proposals p
      JOIN public.equipment e ON e.id = p.equipment_id
     WHERE p.status = 'pending_review'
     ORDER BY p.created_at ASC, p.id
     LIMIT GREATEST(p_limit, 0)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',                    id,
        'equipment_id',          equipment_id,
        'created_at',            created_at,
        'equipment_name',        equipment_name,
        'equipment_slug',        equipment_slug,
        'equipment_brand',       equipment_brand,
        'equipment_category',    equipment_category,
        'equipment_subcategory', equipment_subcategory,
        'merged_field_count',
          (SELECT COUNT(*) FROM jsonb_object_keys(COALESCE(merged->'specs', '{}'::jsonb)))
          + CASE WHEN merged->>'description' IS NOT NULL AND merged->>'description' <> '' THEN 1 ELSE 0 END
      )
      ORDER BY created_at ASC, id
    ),
    '[]'::jsonb
  )
  FROM rows;
$$;

REVOKE ALL ON FUNCTION public.list_pending_spec_proposals(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_pending_spec_proposals(INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_spec_proposals(INT) TO service_role;

COMMENT ON FUNCTION public.list_pending_spec_proposals(INT) IS
  'Admin queue loader for /admin/spec-proposals (TT-150). Joins proposal + equipment in one round-trip.';

----------------------------------------------------------------------------
-- apply_spec_proposal
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_spec_proposal(
  p_id              UUID,
  p_specifications  JSONB,
  p_description     TEXT,
  p_reviewer        UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_equipment_id UUID;
  v_status       TEXT;
BEGIN
  SELECT equipment_id, status INTO v_equipment_id, v_status
    FROM public.equipment_spec_proposals
   WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal not found');
  END IF;

  IF v_status <> 'pending_review' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('proposal already %s', v_status)
    );
  END IF;

  UPDATE public.equipment
     SET specifications      = COALESCE(p_specifications, '{}'::jsonb),
         description         = NULLIF(p_description, ''),
         specs_sourced_at    = NOW(),
         specs_source_status = 'fresh'
   WHERE id = v_equipment_id;

  UPDATE public.equipment_spec_proposals
     SET status      = 'applied',
         reviewed_at = NOW(),
         reviewed_by = p_reviewer
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'equipment_id', v_equipment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_spec_proposal(UUID, JSONB, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_spec_proposal(UUID, JSONB, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_spec_proposal(UUID, JSONB, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.apply_spec_proposal(UUID, JSONB, TEXT, UUID) IS
  'Apply an admin-reviewed spec proposal: writes equipment.specifications + description, stamps cooldown to fresh, marks proposal applied. Atomic.';

----------------------------------------------------------------------------
-- reject_spec_proposal
----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_spec_proposal(
  p_id        UUID,
  p_reviewer  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_equipment_id UUID;
  v_status       TEXT;
BEGIN
  SELECT equipment_id, status INTO v_equipment_id, v_status
    FROM public.equipment_spec_proposals
   WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proposal not found');
  END IF;

  IF v_status <> 'pending_review' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('proposal already %s', v_status)
    );
  END IF;

  UPDATE public.equipment
     SET specs_sourced_at    = NOW(),
         specs_source_status = 'no_results'
   WHERE id = v_equipment_id;

  UPDATE public.equipment_spec_proposals
     SET status      = 'rejected',
         reviewed_at = NOW(),
         reviewed_by = p_reviewer
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'equipment_id', v_equipment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_spec_proposal(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_spec_proposal(UUID, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_spec_proposal(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.reject_spec_proposal(UUID, UUID) IS
  'Reject an admin-reviewed spec proposal: stamps equipment cooldown to no_results (14d), marks proposal rejected. Equipment specs untouched.';
