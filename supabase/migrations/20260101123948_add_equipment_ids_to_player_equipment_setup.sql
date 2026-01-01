-- Add equipment ID columns to player_equipment_setup_submissions
-- These link to actual equipment records instead of storing names as text

ALTER TABLE player_equipment_setup_submissions
  ADD COLUMN blade_id UUID REFERENCES equipment(id),
  ADD COLUMN forehand_rubber_id UUID REFERENCES equipment(id),
  ADD COLUMN backhand_rubber_id UUID REFERENCES equipment(id);

-- Create indexes for the new FK columns
CREATE INDEX idx_player_equipment_setup_submissions_blade_id
  ON player_equipment_setup_submissions(blade_id);
CREATE INDEX idx_player_equipment_setup_submissions_forehand_rubber_id
  ON player_equipment_setup_submissions(forehand_rubber_id);
CREATE INDEX idx_player_equipment_setup_submissions_backhand_rubber_id
  ON player_equipment_setup_submissions(backhand_rubber_id);

-- Add comment explaining the transition
COMMENT ON COLUMN player_equipment_setup_submissions.blade_name IS
  'Deprecated: Use blade_id instead. Kept for backwards compatibility with existing submissions.';
COMMENT ON COLUMN player_equipment_setup_submissions.forehand_rubber_name IS
  'Deprecated: Use forehand_rubber_id instead. Kept for backwards compatibility with existing submissions.';
COMMENT ON COLUMN player_equipment_setup_submissions.backhand_rubber_name IS
  'Deprecated: Use backhand_rubber_id instead. Kept for backwards compatibility with existing submissions.';
