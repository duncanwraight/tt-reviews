-- Add Discord user mapping for moderation
-- This allows Discord users to moderate without being full application users

-- Create a table to map Discord user IDs to internal moderator records
CREATE TABLE discord_moderators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL UNIQUE,
    discord_username TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_discord_moderators_discord_id ON discord_moderators(discord_user_id);

-- Enable RLS
ALTER TABLE discord_moderators ENABLE ROW LEVEL SECURITY;

-- Allow admins to read/manage Discord moderators
CREATE POLICY "Admins can manage Discord moderators" ON discord_moderators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

-- Allow everyone to read Discord moderator info (for public moderation transparency)
CREATE POLICY "Public can read Discord moderators" ON discord_moderators
    FOR SELECT USING (true);

-- Modify moderator_approvals to allow Discord moderators
-- Add a new column to track Discord moderator IDs
ALTER TABLE moderator_approvals 
    ADD COLUMN discord_moderator_id UUID REFERENCES discord_moderators(id),
    -- Make moderator_id nullable since we'll use either moderator_id OR discord_moderator_id
    ALTER COLUMN moderator_id DROP NOT NULL;

-- Add constraint to ensure we have either a regular moderator or Discord moderator
ALTER TABLE moderator_approvals 
    ADD CONSTRAINT check_moderator_type 
    CHECK (
        (moderator_id IS NOT NULL AND discord_moderator_id IS NULL) OR 
        (moderator_id IS NULL AND discord_moderator_id IS NOT NULL)
    );

-- Add index for Discord moderator lookups
CREATE INDEX idx_moderator_approvals_discord_moderator ON moderator_approvals(discord_moderator_id);

-- Update RLS policies to handle Discord moderators

-- Update the insert policy to allow Discord moderators
DROP POLICY IF EXISTS "Moderators can insert approvals" ON moderator_approvals;

CREATE POLICY "Moderators can insert approvals" ON moderator_approvals
    FOR INSERT WITH CHECK (
        (
            -- Regular app moderators
            moderator_id = auth.uid() AND
            EXISTS (
                SELECT 1 FROM user_roles 
                WHERE user_id = auth.uid() 
                AND role IN ('admin', 'moderator')
            )
        ) OR (
            -- Discord moderators (no auth check needed as Discord handles this)
            discord_moderator_id IS NOT NULL AND
            moderator_id IS NULL
        )
    );

-- Create a function to get or create Discord moderator
CREATE OR REPLACE FUNCTION get_or_create_discord_moderator(
    p_discord_user_id TEXT,
    p_discord_username TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    moderator_uuid UUID;
BEGIN
    -- Try to find existing Discord moderator
    SELECT id INTO moderator_uuid
    FROM discord_moderators
    WHERE discord_user_id = p_discord_user_id;
    
    -- If not found, create new one
    IF moderator_uuid IS NULL THEN
        INSERT INTO discord_moderators (discord_user_id, discord_username)
        VALUES (p_discord_user_id, p_discord_username)
        RETURNING id INTO moderator_uuid;
    ELSE
        -- Update last active and username if provided
        UPDATE discord_moderators 
        SET 
            last_active = NOW(),
            discord_username = COALESCE(p_discord_username, discord_username),
            updated_at = NOW()
        WHERE id = moderator_uuid;
    END IF;
    
    RETURN moderator_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to all authenticated users (Discord interactions come through service role)
GRANT EXECUTE ON FUNCTION get_or_create_discord_moderator(TEXT, TEXT) TO authenticated, anon;