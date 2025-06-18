-- Add Discord message tracking to submission tables
-- This enables message editing for progressive button states

-- Add Discord message ID columns to all submission tables
ALTER TABLE equipment_submissions ADD COLUMN discord_message_id TEXT;
ALTER TABLE player_submissions ADD COLUMN discord_message_id TEXT;
ALTER TABLE player_edits ADD COLUMN discord_message_id TEXT;

-- Add indexes for Discord message lookups
CREATE INDEX idx_equipment_submissions_discord_message ON equipment_submissions(discord_message_id);
CREATE INDEX idx_player_submissions_discord_message ON player_submissions(discord_message_id);
CREATE INDEX idx_player_edits_discord_message ON player_edits(discord_message_id);

-- Add comments to document purpose
COMMENT ON COLUMN equipment_submissions.discord_message_id IS 'Discord message ID for editing notification messages with updated button states';
COMMENT ON COLUMN player_submissions.discord_message_id IS 'Discord message ID for editing notification messages with updated button states';
COMMENT ON COLUMN player_edits.discord_message_id IS 'Discord message ID for editing notification messages with updated button states';