-- Add gender column to players table
-- Gender should be M or F based on ITTF world rankings

ALTER TABLE players ADD COLUMN gender CHAR(1) CHECK (gender IN ('M', 'F'));

-- Add index for performance
CREATE INDEX idx_players_gender ON players (gender);