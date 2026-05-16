-- TT-191 audit follow-up: add `text_list` to the spec_field_type enum.
--
-- Used for spec fields that hold a list of values rather than a single
-- value — primarily rubber `sponge_thickness`, which is published per
-- equipment as a discrete set (e.g. ["1.7", "1.9", "2.1"] for Tenergy
-- 05, ["OX", "0.5", "1.0", "1.4"] for Nittaku DO Knuckle).
--
-- Storage: JSONB array of strings in equipment.specifications. Display:
-- joined with "/" by SpecsTable. Review form sources the per-equipment
-- array to populate a sponge-thickness dropdown so reviewers pick from
-- the actual available set.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'text_list'
      AND enumtypid = 'spec_field_type'::regtype
  ) THEN
    ALTER TYPE spec_field_type ADD VALUE 'text_list';
  END IF;
END
$$;
