-- TT-88: equipment.image_trim_kind controls render-time edge-trim via
-- Cloudflare Image Transformations. When set, buildEquipmentImageUrl
-- injects `,trim=border` into the variant URL, which auto-detects the
-- dominant border colour and trims it.
--
-- Values:
--   'auto'   — system-set on pick when corner-pixel decode found
--              transparent edges (PNG/WebP with alpha=0 corners). Safe
--              because transparent borders never represent legitimate
--              content.
--   'border' — admin manually toggled trim on. Includes the white-edge
--              case where the user has eyeballed it and confirmed the
--              packaging isn't itself white.
--   NULL     — no trim applied. Default for new rows and JPEG picks.
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS image_trim_kind TEXT
    CHECK (image_trim_kind IN ('auto', 'border'));

COMMENT ON COLUMN equipment.image_trim_kind IS 'Render-time edge-trim mode (TT-88). NULL=no trim, auto=system-set after detecting transparent corners on pick, border=admin manual toggle.';
