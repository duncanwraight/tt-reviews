-- Force update playing_style column to varchar, handling all dependencies
-- This ensures the configurable categories system works properly

-- First, drop any views or functions that might depend on the enum
-- (Add specific dependencies here if they exist)

-- Drop the playing_style column completely
ALTER TABLE players DROP COLUMN IF EXISTS playing_style CASCADE;

-- Drop the enum type forcefully
DROP TYPE IF EXISTS playing_style CASCADE;

-- Add new playing_style column as varchar
ALTER TABLE players ADD COLUMN playing_style VARCHAR(255);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_players_playing_style ON players (playing_style);

-- Add a comment to explain this references the categories table
COMMENT ON COLUMN players.playing_style IS 'References categories table where type=playing_style';