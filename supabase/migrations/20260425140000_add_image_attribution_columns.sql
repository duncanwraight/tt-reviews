-- Image attribution columns for the photo-sourcing pipeline (TT-36).
-- Wikimedia Commons CC BY-SA images legally require attribution. We
-- store structured pieces (creator name, creator link, license name,
-- license URL, source URL) rather than rendered HTML so the view layer
-- can render them safely without dangerouslySetInnerHTML.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS image_credit_text TEXT,
  ADD COLUMN IF NOT EXISTS image_credit_link TEXT,
  ADD COLUMN IF NOT EXISTS image_license_short TEXT,
  ADD COLUMN IF NOT EXISTS image_license_url TEXT,
  ADD COLUMN IF NOT EXISTS image_source_url TEXT,
  ADD COLUMN IF NOT EXISTS image_etag TEXT;

COMMENT ON COLUMN players.image_credit_text IS 'Plain-text creator name (no HTML), e.g. "Peter Porai-Koshits".';
COMMENT ON COLUMN players.image_credit_link IS 'Creator profile URL. NULL when only a name is known.';
COMMENT ON COLUMN players.image_license_short IS 'Short license name, e.g. "CC BY-SA 4.0".';
COMMENT ON COLUMN players.image_license_url IS 'Canonical license URL.';
COMMENT ON COLUMN players.image_source_url IS 'Source page (Commons file page) for verification / takedown.';
COMMENT ON COLUMN players.image_etag IS 'Short content hash. Appended to the rendered image URL as ?v= so re-applies bust browser caches even when image_key is unchanged.';

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS image_credit_text TEXT,
  ADD COLUMN IF NOT EXISTS image_credit_link TEXT,
  ADD COLUMN IF NOT EXISTS image_license_short TEXT,
  ADD COLUMN IF NOT EXISTS image_license_url TEXT,
  ADD COLUMN IF NOT EXISTS image_source_url TEXT,
  ADD COLUMN IF NOT EXISTS image_etag TEXT;

COMMENT ON COLUMN equipment.image_credit_text IS 'Plain-text creator/source label.';
COMMENT ON COLUMN equipment.image_credit_link IS 'Creator profile URL.';
COMMENT ON COLUMN equipment.image_license_short IS 'Short license name. NULL for unlicensed manufacturer/retailer images (TT-36 follow-up).';
COMMENT ON COLUMN equipment.image_license_url IS 'Canonical license URL.';
COMMENT ON COLUMN equipment.image_source_url IS 'Source page for verification / takedown.';
COMMENT ON COLUMN equipment.image_etag IS 'Short content hash for cache-busting. See players.image_etag.';
