-- TT-163: drop the manufacturer prefix from equipment.name.
--
-- equipment.manufacturer already carries the brand, so storing
-- "Butterfly Sriver FX" in equipment.name is redundant and trips
-- consumers that build display strings (double-printed brand) or
-- spec-sourcing queries (brand-poisoned matches on manufacturer
-- sites whose own product titles never include their own brand).
--
-- Steps:
--   1. Define helper strip_manufacturer_prefix(name, manufacturer)
--      that returns name with a leading "<manufacturer> " removed
--      when present (case-insensitive prefix match), else returns
--      name unchanged. Uses left()/substr() rather than ILIKE so
--      manufacturers containing % or _ don't act as wildcards.
--   2. Backfill equipment.name.
--   3. Backfill equipment_submissions.name — pending submissions
--      snapshot the prefixed shape and would otherwise reintroduce
--      it on approval.
--   4. Backfill equipment_edits.edit_data->'name'. Manufacturer is
--      not editable via the edit flow (see equipment-edit-applier
--      lines 74-84), so the equipment row's manufacturer is the
--      canonical strip reference.
--   5. Drop the helper. There are no runtime callers; future writes
--      are gated by application-level form validation.

CREATE OR REPLACE FUNCTION strip_manufacturer_prefix(
  name text,
  manufacturer text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN name IS NULL OR manufacturer IS NULL THEN name
    WHEN length(manufacturer) = 0 THEN name
    WHEN lower(left(name, length(manufacturer) + 1))
         = lower(manufacturer || ' ')
      THEN substr(name, length(manufacturer) + 2)
    ELSE name
  END;
$$;

UPDATE equipment
SET name = strip_manufacturer_prefix(name, manufacturer)
WHERE manufacturer IS NOT NULL;

UPDATE equipment_submissions
SET name = strip_manufacturer_prefix(name, manufacturer)
WHERE manufacturer IS NOT NULL;

UPDATE equipment_edits ee
SET edit_data = jsonb_set(
  ee.edit_data,
  '{name}',
  to_jsonb(strip_manufacturer_prefix(ee.edit_data->>'name', e.manufacturer))
)
FROM equipment e
WHERE e.id = ee.equipment_id
  AND ee.edit_data ? 'name'
  AND ee.edit_data->>'name' IS NOT NULL;

DROP FUNCTION strip_manufacturer_prefix(text, text);
