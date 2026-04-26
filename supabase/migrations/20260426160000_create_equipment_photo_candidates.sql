-- Equipment photo sourcing (TT-48 / TT-51).
--
-- `equipment_photo_candidates` stages images returned by the Brave
-- Image Search resolver and uploaded to Cloudflare Images, pending
-- admin review. The chosen candidate's CF Image ID becomes
-- `equipment.image_key`; the others get deleted from CF Images and
-- removed from this table. See app/lib/photo-sourcing/brave.server.ts
-- for the resolver and docs/IMAGES.md for the storage backend.
--
-- New equipment columns:
--   image_skipped_at — admin chose "None of these"; keeps the row out
--                      of the review queue without leaving image_key
--                      null forever.
--   image_sourcing_attempted_at — set when a sourcing run completes;
--                                 lets bulk-source (TT-53) skip rows
--                                 that already had a turn.

CREATE TABLE IF NOT EXISTS equipment_photo_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  cf_image_id TEXT NOT NULL,
  source_url TEXT,
  image_source_host TEXT,
  source_label TEXT,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('trailing', 'loose')),
  tier INT NOT NULL,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_at TIMESTAMPTZ,
  picked_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE equipment_photo_candidates IS 'Staged Brave-found image candidates pending admin review. See TT-48 / TT-51.';
COMMENT ON COLUMN equipment_photo_candidates.cf_image_id IS 'Cloudflare Images UUID returned by the upload API.';
COMMENT ON COLUMN equipment_photo_candidates.source_url IS 'Page where Brave found the image (for attribution + verification).';
COMMENT ON COLUMN equipment_photo_candidates.image_source_host IS 'Hostname of the source page, e.g. "revspin.net" — for grouping.';
COMMENT ON COLUMN equipment_photo_candidates.source_label IS 'Tier label: "revspin", "megaspin", "tt-shop", "contra", "other" etc.';
COMMENT ON COLUMN equipment_photo_candidates.match_kind IS '"trailing" = filename ends at product slug (auto-pick eligible). "loose" = product+brand present but with variant/suffix.';
COMMENT ON COLUMN equipment_photo_candidates.tier IS '1=top retailers, 2=mid, 3=tts, 4=other. Lower wins ties.';
COMMENT ON COLUMN equipment_photo_candidates.picked_at IS 'NULL while pending review; set when admin chose this candidate.';
COMMENT ON COLUMN equipment_photo_candidates.picked_by IS 'Admin profile id who picked this candidate.';

-- Review-queue lookup: "rows with at least one pending candidate".
-- Partial index keeps it small as picked candidates accumulate.
CREATE INDEX IF NOT EXISTS idx_equipment_photo_candidates_pending_by_equipment
  ON equipment_photo_candidates (equipment_id)
  WHERE picked_at IS NULL;

-- Equipment-side flags so the queue loader can filter cleanly.
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS image_skipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_sourcing_attempted_at TIMESTAMPTZ;

COMMENT ON COLUMN equipment.image_skipped_at IS 'Admin marked "no usable image found"; keeps row out of review queue.';
COMMENT ON COLUMN equipment.image_sourcing_attempted_at IS 'Last time a sourcing run completed. Lets bulk-source (TT-53) skip already-attempted rows.';

-- RLS: admins only. Service-role writes (admin client) bypass RLS, so
-- this is purely a defence-in-depth lock against the anon key being
-- used to read or modify candidate rows from the browser.
ALTER TABLE equipment_photo_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on equipment_photo_candidates"
  ON equipment_photo_candidates;

CREATE POLICY "Admins full access on equipment_photo_candidates"
  ON equipment_photo_candidates
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');
