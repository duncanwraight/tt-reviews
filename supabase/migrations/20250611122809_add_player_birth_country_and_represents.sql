-- Add birth country and represents country fields to players table
-- This handles the common scenario where players are born in one country but represent another

-- Rename nationality to birth_country for clarity
ALTER TABLE players RENAME COLUMN nationality TO birth_country;

-- Add represents column for the country they compete for
ALTER TABLE players ADD COLUMN represents VARCHAR(3);

-- Update comments for clarity
COMMENT ON COLUMN players.birth_country IS 'ISO 3166-1 alpha-3 country code for birth country (e.g., CHN, GER, JPN)';
COMMENT ON COLUMN players.represents IS 'ISO 3166-1 alpha-3 country code for country they represent in competition (e.g., SVK, AUT). Defaults to birth_country if not specified.';