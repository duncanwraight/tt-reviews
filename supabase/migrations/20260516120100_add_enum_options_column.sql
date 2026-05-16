-- TT-212: enum_options column for `equipment_spec_field` rows with
-- field_type = 'enum'.
--
-- Stored as JSONB so each option can carry both a slug and a label,
-- e.g. Balance options:
--   [
--     {"value": "very_head_heavy",   "label": "Very head-heavy"},
--     {"value": "head_heavy",        "label": "Head-heavy"},
--     {"value": "central",           "label": "Central"},
--     {"value": "handle_heavy",      "label": "Handle-heavy"},
--     {"value": "very_handle_heavy", "label": "Very handle-heavy"}
--   ]
--
-- Slug is what gets stored in equipment.specifications JSONB; label is
-- what the SpecsTable and submission-form dropdown render to the user.
-- Hyphens / capitalisation can't be reconstructed from the slug alone,
-- hence the separate label.

ALTER TABLE categories
  ADD COLUMN enum_options JSONB;

-- Format guard. Only checks the array-ness and non-emptiness; we trust
-- the seed for the {value, label} shape inside each element.
ALTER TABLE categories
  ADD CONSTRAINT categories_enum_options_format
  CHECK (
    enum_options IS NULL
    OR (
      jsonb_typeof(enum_options) = 'array'
      AND jsonb_array_length(enum_options) > 0
    )
  );

-- Required-when-enum constraint. Mirrors the existing
-- categories_spec_field_type_required pattern: enum spec fields must
-- carry options; non-enum spec fields and non-spec rows must not.
ALTER TABLE categories
  ADD CONSTRAINT categories_enum_options_required
  CHECK (
    (field_type = 'enum'::spec_field_type AND enum_options IS NOT NULL)
    OR (field_type IS DISTINCT FROM 'enum'::spec_field_type AND enum_options IS NULL)
  );
