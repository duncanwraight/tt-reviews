-- TT-100: add medium_pips subcategory + spec fields.
--
-- Recategorisation between short / medium / long pips is one driver of
-- the equipment_edit submission flow (TT-74), but `medium_pips` doesn't
-- exist today — only inverted, long_pips, anti, short_pips. This adds
-- the missing subcategory and mirrors short_pips' spec-field set
-- (sponge, topsheet, speed, spin, control).
--
-- Also reorders the rubber subcategories into a more logical sequence:
--   1. inverted   (smooth rubber, most common)
--   2. short_pips (was 4)
--   3. medium_pips (new)
--   4. long_pips  (was 2)
--   5. anti       (was 3)
--
-- No data backfill: existing equipment rows that should become
-- medium_pips will be reclassified by admins via the new edit flow
-- once it ships.

-- 1. Insert medium_pips subcategory at display_order 3.
INSERT INTO categories (type, name, value, display_order, parent_id, is_active)
SELECT 'equipment_subcategory', 'Medium Pips', 'medium_pips', 3, NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM categories
  WHERE type = 'equipment_subcategory' AND value = 'medium_pips'
);

-- 2. Re-number existing pip / anti subcategories so the dropdown reads
--    short → medium → long → anti.
UPDATE categories SET display_order = 2
  WHERE type = 'equipment_subcategory' AND value = 'short_pips';
UPDATE categories SET display_order = 4
  WHERE type = 'equipment_subcategory' AND value = 'long_pips';
UPDATE categories SET display_order = 5
  WHERE type = 'equipment_subcategory' AND value = 'anti';

-- 3. Insert spec fields under medium_pips. Mirrors short_pips' set.
DO $$
DECLARE
  medium_pips_id UUID;
BEGIN
  SELECT id INTO medium_pips_id
  FROM categories
  WHERE type = 'equipment_subcategory' AND value = 'medium_pips';

  IF medium_pips_id IS NULL THEN
    RAISE EXCEPTION 'medium_pips subcategory row missing after insert';
  END IF;

  -- Idempotence guard: if the spec rows already exist (re-run after
  -- failed migration), skip.
  IF NOT EXISTS (
    SELECT 1 FROM categories
    WHERE type = 'equipment_spec_field' AND parent_id = medium_pips_id
  ) THEN
    INSERT INTO categories
      (type, name, value, description, display_order, parent_id, is_active, field_type, scale_min, scale_max)
    VALUES
      ('equipment_spec_field', 'Sponge', 'sponge', 'Sponge material or description', 1, medium_pips_id, true, 'text', NULL, NULL),
      ('equipment_spec_field', 'Topsheet', 'topsheet', 'Topsheet material or type', 2, medium_pips_id, true, 'text', NULL, NULL),
      ('equipment_spec_field', 'Speed', 'speed', 'Manufacturer speed rating', 3, medium_pips_id, true, 'float', 0, 10),
      ('equipment_spec_field', 'Spin', 'spin', 'Manufacturer spin rating', 4, medium_pips_id, true, 'float', 0, 10),
      ('equipment_spec_field', 'Control', 'control', 'Manufacturer control rating', 5, medium_pips_id, true, 'float', 0, 10);
  END IF;
END $$;
