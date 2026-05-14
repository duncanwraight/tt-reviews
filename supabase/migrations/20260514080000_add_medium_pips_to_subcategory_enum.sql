-- TT-100 follow-up: the `medium_pips` subcategory was added to the
-- `categories` lookup table (migration 20260428232927) and to seed.sql,
-- but the actual `equipment_subcategory` PG enum was never extended.
-- That broke `/equipment?subcategory=medium_pips` (linked from the
-- homepage Categories section) — Postgres rejects the filter value at
-- query time, the loader's silent .catch returns [], and the request
-- shows up as `db_get_all_equipment` / `Error fetching equipment with
-- reviews` in the production error feed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'medium_pips'
      AND enumtypid = 'equipment_subcategory'::regtype
  ) THEN
    ALTER TYPE equipment_subcategory ADD VALUE 'medium_pips';
  END IF;
END
$$;
