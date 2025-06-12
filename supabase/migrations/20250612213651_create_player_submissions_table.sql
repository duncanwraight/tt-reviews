-- Create player_submissions table
CREATE TABLE player_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    highest_rating TEXT,
    active_years TEXT,
    playing_style TEXT,
    birth_country VARCHAR(3), -- 3-letter country code
    represents VARCHAR(3), -- 3-letter country code
    equipment_setup JSONB DEFAULT '{}'::jsonb,
    status review_status DEFAULT 'pending',
    moderator_id UUID REFERENCES auth.users(id),
    moderator_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX idx_player_submissions_user_id ON player_submissions(user_id);
CREATE INDEX idx_player_submissions_status ON player_submissions(status);
CREATE INDEX idx_player_submissions_created_at ON player_submissions(created_at DESC);

-- Create updated_at trigger
CREATE TRIGGER update_player_submissions_updated_at
    BEFORE UPDATE ON player_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE player_submissions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can submit players" ON player_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own player submissions" ON player_submissions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can moderate player submissions" ON player_submissions
    FOR UPDATE USING (auth.uid() IS NOT NULL);