-- TT-101 follow-up: add discord_message_id to equipment_edits.
--
-- All other "tracked-message" submission tables carry this column —
-- equipment_submissions / player_submissions / player_edits got it
-- in 20250618141000_add_discord_message_tracking.sql, and
-- video_submissions / player_equipment_setup_submissions ship it
-- in their create migrations. The equipment_edit handler in
-- MODERATION_HANDLERS sets hasTrackedMessage: true (clone of
-- player_edit), so every Discord approval / rejection of an
-- equipment_edit calls updateDiscordMessageAfterModeration →
-- getDiscordMessageId, which runs
--   SELECT id, discord_message_id FROM equipment_edits WHERE id = ?
-- Without this column the select 500s; the moderation flow swallows
-- it (the early-out treats null as "no tracked message") so the
-- approval still succeeds for the user, but Logger.error fires twice
-- per approval and spams the alerts channel.
--
-- The column stays NULL today — no code path persists the messageId
-- after the initial Discord post. getDiscordMessageId already handles
-- null by no-op'ing the message update, matching every other table's
-- behaviour. This migration just removes the schema gap so the
-- production select stops 500'ing.

ALTER TABLE equipment_edits ADD COLUMN discord_message_id TEXT;

CREATE INDEX idx_equipment_edits_discord_message
  ON equipment_edits(discord_message_id);

COMMENT ON COLUMN equipment_edits.discord_message_id IS
  'Discord message ID for editing notification messages with updated button states';
