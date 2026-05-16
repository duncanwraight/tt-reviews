-- TT-212: review-rating categories curation
--
-- Adds two new enum values to support the curated review-rating model:
--
-- 1. `review_rating_scope` (category_type): pseudo-parent rows that let
--    review_rating_category rows be "shared" across multiple equipment
--    types instead of being parented by a single equipment_category /
--    equipment_subcategory. Three scope rows are seeded:
--      - paddle         (blade + all rubber subcategories)
--      - all_rubbers    (all rubber subcategories)
--      - all_pips_anti  (long_pips / short_pips / medium_pips / anti)
--
-- 2. `enum` (spec_field_type): a new manufacturer-spec field type whose
--    value is one of a fixed set of strings — e.g. blade Balance
--    (very_head_heavy / head_heavy / central / handle_heavy /
--    very_handle_heavy) and inverted/anti rubber Type.
--
-- The actual rows are seeded in supabase/seed.sql. The enum_options
-- column and CHECK constraint are added in the next migration so this
-- migration can commit the new spec_field_type value before anything
-- references it as a literal.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'review_rating_scope'
      AND enumtypid = 'category_type'::regtype
  ) THEN
    ALTER TYPE category_type ADD VALUE 'review_rating_scope';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'enum'
      AND enumtypid = 'spec_field_type'::regtype
  ) THEN
    ALTER TYPE spec_field_type ADD VALUE 'enum';
  END IF;
END
$$;
