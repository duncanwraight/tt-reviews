-- Create player_edits table for moderated player information changes
CREATE TABLE player_edits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    edit_data JSONB NOT NULL,
    status review_status DEFAULT 'pending',
    moderator_id UUID REFERENCES auth.users(id),
    moderator_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_player_edits_player_id ON player_edits(player_id);
CREATE INDEX idx_player_edits_status ON player_edits(status);
CREATE INDEX idx_player_edits_user_id ON player_edits(user_id);
CREATE INDEX idx_player_edits_created_at ON player_edits(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE player_edits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own player edit submissions
CREATE POLICY "Users can view own player edits" ON player_edits
    FOR SELECT USING (auth.uid() = user_id);

-- Authenticated users can insert player edits
CREATE POLICY "Authenticated users can submit player edits" ON player_edits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update player edits (for moderation)
CREATE POLICY "Authenticated users can moderate player edits" ON player_edits
    FOR UPDATE USING (auth.uid() IS NOT NULL);