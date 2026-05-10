-- TT-185: race-safe get_or_create_discord_moderator.
--
-- The original migration (20250618140000_add_discord_user_mapping.sql)
-- used a SELECT-then-INSERT-or-UPDATE pattern. Two concurrent calls for
-- the same p_discord_user_id whose row didn't yet exist could both pass
-- the SELECT, then collide on the INSERT against the unique index on
-- discord_moderators.discord_user_id. The losing call returned NULL,
-- which dispatch surfaces as "Failed to create Discord moderator
-- record".
--
-- Replaces the body with a single race-safe statement. The unique
-- constraint that makes ON CONFLICT work is already present on
-- discord_moderators.discord_user_id (created in the original
-- migration's CREATE TABLE: discord_user_id TEXT NOT NULL UNIQUE).
--
-- Signature, SECURITY DEFINER, and grants are preserved — CREATE OR
-- REPLACE FUNCTION keeps existing privileges when the identity (name +
-- argument types) is unchanged, so no re-GRANT is needed.

CREATE OR REPLACE FUNCTION get_or_create_discord_moderator(
    p_discord_user_id TEXT,
    p_discord_username TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    moderator_uuid UUID;
BEGIN
    INSERT INTO discord_moderators (discord_user_id, discord_username)
    VALUES (p_discord_user_id, p_discord_username)
    ON CONFLICT (discord_user_id) DO UPDATE SET
        last_active = NOW(),
        discord_username = COALESCE(EXCLUDED.discord_username, discord_moderators.discord_username),
        updated_at = NOW()
    RETURNING id INTO moderator_uuid;

    RETURN moderator_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
