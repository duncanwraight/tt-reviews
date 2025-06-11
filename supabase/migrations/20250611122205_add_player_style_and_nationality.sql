-- Add playing style and nationality fields to players table

-- Create playing style enum
CREATE TYPE playing_style AS ENUM ('attacker', 'all_rounder', 'defender', 'counter_attacker', 'chopper', 'unknown');

-- Add new columns to players table
ALTER TABLE players 
ADD COLUMN playing_style playing_style,
ADD COLUMN nationality VARCHAR(3); -- Using ISO 3166-1 alpha-3 country codes (e.g., CHN, GER, JPN)

-- Add comment for nationality field
COMMENT ON COLUMN players.nationality IS 'ISO 3166-1 alpha-3 country code (e.g., CHN, GER, JPN)';