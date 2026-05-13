-- TT-203: collapse per-row ittfid backfills into a single RPC call so
-- the importer stays under Cloudflare Workers Free plan's 50-subrequest
-- per-invocation cap. TT-202's first prod run hit the cap because 50
-- seeded players each got their own UPDATE round-trip during dedupe.
--
-- Caller passes [{ player_id, ittfid }, ...]; the RPC backfills only
-- rows where the existing ittfid is NULL (so a partial run can be
-- retried safely without overwriting linked rows). Returns the count
-- actually updated.
--
-- SECURITY DEFINER + EXECUTE granted to service_role only — same
-- posture as the spec-proposal review RPCs (TT-150).

CREATE OR REPLACE FUNCTION public.backfill_player_ittfids(
  p_pairs JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  IF p_pairs IS NULL OR jsonb_typeof(p_pairs) <> 'array' THEN
    RETURN 0;
  END IF;

  WITH input AS (
    SELECT
      (elem->>'player_id')::UUID    AS player_id,
      (elem->>'ittfid')::INTEGER    AS ittfid
    FROM jsonb_array_elements(p_pairs) AS elem
    WHERE elem ? 'player_id' AND elem ? 'ittfid'
  ),
  updated AS (
    UPDATE public.players AS p
       SET ittfid = i.ittfid
      FROM input i
     WHERE p.id = i.player_id
       AND p.ittfid IS NULL
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_player_ittfids(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_player_ittfids(JSONB) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_player_ittfids(JSONB) TO service_role;

COMMENT ON FUNCTION public.backfill_player_ittfids(JSONB) IS
  'Bulk link existing players.ittfid for the TT-201 importer dedupe pass. One subrequest replaces N per-row UPDATEs (TT-203).';
