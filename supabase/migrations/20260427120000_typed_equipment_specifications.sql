-- Typed equipment specifications (TT-72 / TT-75)
-- Locked design: archive/EQUIPMENT-SPECS.md
--
-- Adds field_type / unit / scale_min / scale_max metadata to equipment_spec_field
-- rows, then transforms equipment.specifications JSONB from free-form strings
-- into typed values:
--   thickness  "5.7mm"  -> 5.7        (float, unit=mm)
--   weight     "86g"    -> 86         (int, unit=g)
--   plies      5        -> plies_wood: 5, plies_composite: null  (split into two fields)
--   hardness   "40-42"  -> {min: 40, max: 42}      (range)
--   hardness   "47.5"   -> {min: 47.5, max: 47.5}  (single value as range)
--   year       2019     -> "2019"     (text per product call)
--
-- Fails loudly on unexpected formats so we don't silently coerce garbage.

-- =============================================================================
-- 1. DDL
-- =============================================================================

CREATE TYPE spec_field_type AS ENUM ('int', 'float', 'range', 'text');

ALTER TABLE categories
  ADD COLUMN field_type spec_field_type,
  ADD COLUMN unit VARCHAR(16),
  ADD COLUMN scale_min NUMERIC,
  ADD COLUMN scale_max NUMERIC;

-- =============================================================================
-- 2. Validate input data — fail loudly if anything won't parse cleanly.
-- =============================================================================

DO $$
DECLARE
  bad integer;
BEGIN
  -- thickness: number with optional "mm" suffix
  SELECT count(*) INTO bad FROM equipment
  WHERE specifications ? 'thickness'
    AND jsonb_typeof(specifications->'thickness') = 'string'
    AND specifications->>'thickness' !~ '^[0-9]+(\.[0-9]+)?mm?$';
  IF bad > 0 THEN RAISE EXCEPTION 'Unparseable thickness in % equipment rows', bad; END IF;

  -- weight: integer with optional "g" suffix
  SELECT count(*) INTO bad FROM equipment
  WHERE specifications ? 'weight'
    AND jsonb_typeof(specifications->'weight') = 'string'
    AND specifications->>'weight' !~ '^[0-9]+g?$';
  IF bad > 0 THEN RAISE EXCEPTION 'Unparseable weight in % equipment rows', bad; END IF;

  -- plies: must be a JSON number
  SELECT count(*) INTO bad FROM equipment
  WHERE specifications ? 'plies'
    AND jsonb_typeof(specifications->'plies') <> 'number';
  IF bad > 0 THEN RAISE EXCEPTION 'Non-numeric plies in % equipment rows', bad; END IF;

  -- hardness: bare number or "min-max" range, no other separators
  SELECT count(*) INTO bad FROM equipment
  WHERE specifications ? 'hardness'
    AND jsonb_typeof(specifications->'hardness') = 'string'
    AND specifications->>'hardness' !~ '^[0-9]+(\.[0-9]+)?(-[0-9]+(\.[0-9]+)?)?$';
  IF bad > 0 THEN RAISE EXCEPTION 'Unparseable hardness in % equipment rows', bad; END IF;
END $$;

-- =============================================================================
-- 3. Transform equipment.specifications
-- =============================================================================

-- thickness: "5.7mm" -> 5.7
UPDATE equipment
SET specifications = jsonb_set(
  specifications,
  '{thickness}',
  to_jsonb(regexp_replace(specifications->>'thickness', 'mm$', '')::numeric)
)
WHERE specifications ? 'thickness'
  AND jsonb_typeof(specifications->'thickness') = 'string';

-- weight: "86g" -> 86
UPDATE equipment
SET specifications = jsonb_set(
  specifications,
  '{weight}',
  to_jsonb(regexp_replace(specifications->>'weight', 'g$', '')::integer)
)
WHERE specifications ? 'weight'
  AND jsonb_typeof(specifications->'weight') = 'string';

-- plies -> plies_wood + plies_composite (null for existing pure-wood data)
UPDATE equipment
SET specifications = (specifications - 'plies')
  || jsonb_build_object(
    'plies_wood', specifications->'plies',
    'plies_composite', 'null'::jsonb
  )
WHERE specifications ? 'plies';

-- hardness: "40" -> {min:40,max:40}; "40-42" -> {min:40,max:42}
UPDATE equipment
SET specifications = (specifications - 'hardness')
  || jsonb_build_object(
    'hardness',
    CASE
      WHEN position('-' in specifications->>'hardness') > 0 THEN
        jsonb_build_object(
          'min', split_part(specifications->>'hardness', '-', 1)::numeric,
          'max', split_part(specifications->>'hardness', '-', 2)::numeric
        )
      ELSE
        jsonb_build_object(
          'min', (specifications->>'hardness')::numeric,
          'max', (specifications->>'hardness')::numeric
        )
    END
  )
WHERE specifications ? 'hardness'
  AND jsonb_typeof(specifications->'hardness') = 'string';

-- year: 2019 (number) -> "2019" (text)
UPDATE equipment
SET specifications = jsonb_set(
  specifications,
  '{year}',
  to_jsonb(specifications->>'year')
)
WHERE specifications ? 'year'
  AND jsonb_typeof(specifications->'year') = 'number';

-- =============================================================================
-- 4. Same transforms on equipment_submissions.specifications
-- (Public form only writes {notes:...}, but be defensive in case any structured
-- fields exist in pending submissions.)
-- =============================================================================

DO $$
DECLARE
  bad integer;
BEGIN
  SELECT count(*) INTO bad FROM equipment_submissions
  WHERE specifications ? 'thickness'
    AND jsonb_typeof(specifications->'thickness') = 'string'
    AND specifications->>'thickness' !~ '^[0-9]+(\.[0-9]+)?mm?$';
  IF bad > 0 THEN RAISE EXCEPTION 'Unparseable thickness in % equipment_submissions rows', bad; END IF;

  SELECT count(*) INTO bad FROM equipment_submissions
  WHERE specifications ? 'weight'
    AND jsonb_typeof(specifications->'weight') = 'string'
    AND specifications->>'weight' !~ '^[0-9]+g?$';
  IF bad > 0 THEN RAISE EXCEPTION 'Unparseable weight in % equipment_submissions rows', bad; END IF;

  SELECT count(*) INTO bad FROM equipment_submissions
  WHERE specifications ? 'hardness'
    AND jsonb_typeof(specifications->'hardness') = 'string'
    AND specifications->>'hardness' !~ '^[0-9]+(\.[0-9]+)?(-[0-9]+(\.[0-9]+)?)?$';
  IF bad > 0 THEN RAISE EXCEPTION 'Unparseable hardness in % equipment_submissions rows', bad; END IF;
END $$;

UPDATE equipment_submissions
SET specifications = jsonb_set(specifications, '{thickness}',
  to_jsonb(regexp_replace(specifications->>'thickness', 'mm$', '')::numeric))
WHERE specifications ? 'thickness'
  AND jsonb_typeof(specifications->'thickness') = 'string';

UPDATE equipment_submissions
SET specifications = jsonb_set(specifications, '{weight}',
  to_jsonb(regexp_replace(specifications->>'weight', 'g$', '')::integer))
WHERE specifications ? 'weight'
  AND jsonb_typeof(specifications->'weight') = 'string';

UPDATE equipment_submissions
SET specifications = (specifications - 'plies')
  || jsonb_build_object(
    'plies_wood', specifications->'plies',
    'plies_composite', 'null'::jsonb
  )
WHERE specifications ? 'plies';

UPDATE equipment_submissions
SET specifications = (specifications - 'hardness')
  || jsonb_build_object(
    'hardness',
    CASE
      WHEN position('-' in specifications->>'hardness') > 0 THEN
        jsonb_build_object(
          'min', split_part(specifications->>'hardness', '-', 1)::numeric,
          'max', split_part(specifications->>'hardness', '-', 2)::numeric
        )
      ELSE
        jsonb_build_object(
          'min', (specifications->>'hardness')::numeric,
          'max', (specifications->>'hardness')::numeric
        )
    END
  )
WHERE specifications ? 'hardness'
  AND jsonb_typeof(specifications->'hardness') = 'string';

UPDATE equipment_submissions
SET specifications = jsonb_set(specifications, '{year}',
  to_jsonb(specifications->>'year'))
WHERE specifications ? 'year'
  AND jsonb_typeof(specifications->'year') = 'number';

-- =============================================================================
-- 5. Reseed equipment_spec_field metadata
-- =============================================================================

-- Simple non-blade fields first.
UPDATE categories SET field_type = 'float', unit = 'mm'
WHERE type = 'equipment_spec_field' AND value = 'thickness';

UPDATE categories SET field_type = 'int', unit = 'g'
WHERE type = 'equipment_spec_field' AND value = 'weight';

UPDATE categories SET field_type = 'text'
WHERE type = 'equipment_spec_field' AND value = 'material';

UPDATE categories SET field_type = 'float', scale_min = 0, scale_max = 10
WHERE type = 'equipment_spec_field' AND value IN ('speed', 'spin', 'control');

UPDATE categories SET field_type = 'text'
WHERE type = 'equipment_spec_field' AND value IN ('sponge', 'topsheet');

UPDATE categories SET field_type = 'range'
WHERE type = 'equipment_spec_field' AND value = 'hardness';

UPDATE categories SET field_type = 'text'
WHERE type = 'equipment_spec_field' AND value = 'year';

-- Plies split: rename existing 'plies' → 'plies_wood', insert new 'plies_composite'.
-- No-op on a fresh `supabase db reset` (categories table empty before seed runs);
-- seed.sql inserts the new-shape rows directly in that case.
DO $$
DECLARE
  blade_uuid UUID;
BEGIN
  SELECT id INTO blade_uuid
  FROM categories
  WHERE type = 'equipment_category' AND value = 'blade';

  IF blade_uuid IS NOT NULL THEN
    -- Rename existing plies row → plies_wood (keep display_order=2).
    UPDATE categories
    SET name = 'Plies (wood)',
        value = 'plies_wood',
        description = 'Number of wood plies',
        field_type = 'int'
    WHERE type = 'equipment_spec_field'
      AND value = 'plies'
      AND parent_id = blade_uuid;

    -- Bump existing blade fields below the new composite slot.
    UPDATE categories SET display_order = 4
      WHERE type = 'equipment_spec_field' AND value = 'weight'   AND parent_id = blade_uuid;
    UPDATE categories SET display_order = 5
      WHERE type = 'equipment_spec_field' AND value = 'material' AND parent_id = blade_uuid;
    UPDATE categories SET display_order = 6
      WHERE type = 'equipment_spec_field' AND value = 'speed'    AND parent_id = blade_uuid;
    UPDATE categories SET display_order = 7
      WHERE type = 'equipment_spec_field' AND value = 'control'  AND parent_id = blade_uuid;

    -- Insert plies_composite at display_order=3 (only if the blade plies_wood row
    -- now exists — i.e., we just renamed it from 'plies').
    IF EXISTS (
      SELECT 1 FROM categories
      WHERE type = 'equipment_spec_field' AND value = 'plies_wood' AND parent_id = blade_uuid
    ) THEN
      INSERT INTO categories
        (type, name, value, description, display_order, parent_id, is_active, field_type)
      VALUES
        ('equipment_spec_field', 'Plies (composite)', 'plies_composite',
         'Number of composite plies (carbon, ALC, etc.). NULL for pure-wood blades.',
         3, blade_uuid, true, 'int');
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 6. Enforce field_type-required constraint now that data is populated.
-- =============================================================================

ALTER TABLE categories
  ADD CONSTRAINT categories_spec_field_type_required
  CHECK (
    (type = 'equipment_spec_field' AND field_type IS NOT NULL)
    OR (type <> 'equipment_spec_field' AND field_type IS NULL)
  );
