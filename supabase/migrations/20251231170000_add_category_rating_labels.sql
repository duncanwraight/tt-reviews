-- Add min_label and max_label columns to categories table
-- These are used for review_rating_category types to show custom labels on sliders
-- e.g., "Slow" to "Fast" for Speed, "Low spin" to "High spin" for Spin

ALTER TABLE categories ADD COLUMN min_label VARCHAR(100);
ALTER TABLE categories ADD COLUMN max_label VARCHAR(100);

-- Add comment for documentation
COMMENT ON COLUMN categories.min_label IS 'Label shown at the minimum end of rating sliders (e.g., "Slow", "Low spin")';
COMMENT ON COLUMN categories.max_label IS 'Label shown at the maximum end of rating sliders (e.g., "Fast", "High spin")';
