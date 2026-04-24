-- Add equipment_spec_field to the category_type enum
-- Powers the DB-driven spec field taxonomy used by the equipment comparison page (TT-25).
-- Spec field rows are parented by equipment_category (e.g. blade) or equipment_subcategory
-- (e.g. inverted, long_pips), mirroring how review_rating_category rows are parented.

ALTER TYPE category_type ADD VALUE 'equipment_spec_field';
