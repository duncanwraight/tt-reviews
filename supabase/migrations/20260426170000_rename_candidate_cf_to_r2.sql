-- TT-48 architecture pivot: equipment photo candidates were originally
-- staged in Cloudflare Images, then we switched to R2 + Cloudflare
-- Image Resizing. Rename the column so the schema reflects what's
-- actually stored. The previous migration shipped on the same day; no
-- prod data is at risk.

ALTER TABLE equipment_photo_candidates
  RENAME COLUMN cf_image_id TO r2_key;

COMMENT ON COLUMN equipment_photo_candidates.r2_key IS 'R2 object key for the candidate image, e.g. equipment/<slug>/cand/<uuid>.<ext>.';
