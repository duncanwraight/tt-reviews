-- Create equipment_submissions table for moderated equipment additions
CREATE TABLE equipment_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    manufacturer VARCHAR(255) NOT NULL,
    category equipment_category NOT NULL,
    subcategory equipment_subcategory,
    specifications JSONB DEFAULT '{}',
    status review_status DEFAULT 'pending',
    moderator_id UUID REFERENCES auth.users(id),
    moderator_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_equipment_submissions_user_id ON equipment_submissions(user_id);
CREATE INDEX idx_equipment_submissions_status ON equipment_submissions(status);
CREATE INDEX idx_equipment_submissions_category ON equipment_submissions(category);
CREATE INDEX idx_equipment_submissions_created_at ON equipment_submissions(created_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE equipment_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own equipment submissions
CREATE POLICY "Users can view own equipment submissions" ON equipment_submissions
    FOR SELECT USING (auth.uid() = user_id);

-- Authenticated users can submit equipment
CREATE POLICY "Authenticated users can submit equipment" ON equipment_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Allow authenticated users to update equipment submissions (for moderation)
CREATE POLICY "Authenticated users can moderate equipment submissions" ON equipment_submissions
    FOR UPDATE USING (auth.uid() IS NOT NULL);

-- Add updated_at trigger
CREATE TRIGGER update_equipment_submissions_updated_at
    BEFORE UPDATE ON equipment_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();