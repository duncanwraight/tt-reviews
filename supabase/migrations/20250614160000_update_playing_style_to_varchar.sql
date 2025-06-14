-- Update playing_style column to use varchar instead of enum
-- This allows us to use the configurable categories system

-- First, drop the old playing_style column
ALTER TABLE players DROP COLUMN IF EXISTS playing_style;

-- Add new playing_style column as varchar
ALTER TABLE players ADD COLUMN playing_style VARCHAR(255);

-- Add a comment to explain this references the categories table
COMMENT ON COLUMN players.playing_style IS 'References categories table where type=playing_style';

-- Drop the old enum if it exists and is not used elsewhere
DROP TYPE IF EXISTS playing_style;