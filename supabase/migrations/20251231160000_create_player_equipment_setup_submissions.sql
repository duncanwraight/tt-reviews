-- Create player_equipment_setup_submissions table for user submissions
-- Following the established pattern from equipment_submissions, player_submissions, video_submissions

CREATE TABLE player_equipment_setup_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    -- Store equipment names as text (will be linked to equipment IDs on approval)
    blade_name TEXT,
    forehand_rubber_name TEXT,
    forehand_thickness VARCHAR(20),
    forehand_side VARCHAR(20), -- 'forehand' or 'backhand' (which side of rubber faces which direction)
    backhand_rubber_name TEXT,
    backhand_thickness VARCHAR(20),
    backhand_side VARCHAR(20),
    source_url TEXT,
    source_type source_type,
    -- Standard moderation fields
    status review_status DEFAULT 'pending'::review_status,
    moderator_id UUID REFERENCES auth.users(id),
    moderator_notes TEXT,
    rejection_category rejection_category,
    rejection_reason TEXT,
    discord_message_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_player_equipment_setup_submissions_user_id ON player_equipment_setup_submissions(user_id);
CREATE INDEX idx_player_equipment_setup_submissions_player_id ON player_equipment_setup_submissions(player_id);
CREATE INDEX idx_player_equipment_setup_submissions_status ON player_equipment_setup_submissions(status);
CREATE INDEX idx_player_equipment_setup_submissions_created_at ON player_equipment_setup_submissions(created_at DESC);
CREATE INDEX idx_player_equipment_setup_submissions_discord_message ON player_equipment_setup_submissions(discord_message_id);

-- Enable RLS
ALTER TABLE player_equipment_setup_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies (using JWT claims for role checks)
-- Users can view their own submissions
CREATE POLICY "Users can view own equipment setup submissions"
    ON player_equipment_setup_submissions
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can insert their own submissions
CREATE POLICY "Users can insert own equipment setup submissions"
    ON player_equipment_setup_submissions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Admins can view all submissions
CREATE POLICY "Admins can view all equipment setup submissions"
    ON player_equipment_setup_submissions
    FOR SELECT
    TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'admin');

-- Admins can update submissions (for moderation)
CREATE POLICY "Admins can update equipment setup submissions"
    ON player_equipment_setup_submissions
    FOR UPDATE
    TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'admin')
    WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

-- Admins can delete submissions
CREATE POLICY "Admins can delete equipment setup submissions"
    ON player_equipment_setup_submissions
    FOR DELETE
    TO authenticated
    USING ((auth.jwt() ->> 'user_role') = 'admin');

-- Create updated_at trigger
CREATE TRIGGER update_player_equipment_setup_submissions_updated_at
    BEFORE UPDATE ON player_equipment_setup_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
