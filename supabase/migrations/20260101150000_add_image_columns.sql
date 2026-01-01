-- Add image_key columns to store R2 object keys for uploaded images

-- Equipment submissions table (for submitted images pending review)
ALTER TABLE equipment_submissions
  ADD COLUMN image_key TEXT;

COMMENT ON COLUMN equipment_submissions.image_key IS 'R2 object key for the uploaded product image';

-- Player submissions table (for submitted images pending review)
ALTER TABLE player_submissions
  ADD COLUMN image_key TEXT;

COMMENT ON COLUMN player_submissions.image_key IS 'R2 object key for the uploaded player photo';

-- Equipment table (for approved/final images)
ALTER TABLE equipment
  ADD COLUMN image_key TEXT;

COMMENT ON COLUMN equipment.image_key IS 'R2 object key for the product image';

-- Players table (for approved/final images)
ALTER TABLE players
  ADD COLUMN image_key TEXT;

COMMENT ON COLUMN players.image_key IS 'R2 object key for the player photo';
