-- Enhanced moderation system with two-approval workflow

-- Create enum for approval sources
CREATE TYPE approval_source AS ENUM ('admin_ui', 'discord');

-- Create enum for rejection categories
CREATE TYPE rejection_category AS ENUM (
    'duplicate', 
    'insufficient_info', 
    'poor_image_quality', 
    'inappropriate_content', 
    'invalid_data', 
    'spam',
    'other'
);

-- Create moderator_approvals table to track individual approvals
CREATE TABLE moderator_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_type TEXT NOT NULL CHECK (submission_type IN ('equipment', 'player', 'player_edit')),
    submission_id UUID NOT NULL,
    moderator_id UUID NOT NULL REFERENCES auth.users(id),
    source approval_source NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('approved', 'rejected')),
    notes TEXT,
    rejection_category rejection_category,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX idx_moderator_approvals_submission ON moderator_approvals(submission_type, submission_id);
CREATE INDEX idx_moderator_approvals_moderator ON moderator_approvals(moderator_id);
CREATE INDEX idx_moderator_approvals_created_at ON moderator_approvals(created_at);

-- Add new status values to existing review_status enum
ALTER TYPE review_status ADD VALUE 'under_review';
ALTER TYPE review_status ADD VALUE 'awaiting_second_approval';

-- Add rejection fields to equipment_submissions
ALTER TABLE equipment_submissions 
    ADD COLUMN rejection_category rejection_category,
    ADD COLUMN rejection_reason TEXT,
    ADD COLUMN approval_count INTEGER DEFAULT 0;

-- Add rejection fields to player_submissions
ALTER TABLE player_submissions 
    ADD COLUMN rejection_category rejection_category,
    ADD COLUMN rejection_reason TEXT,
    ADD COLUMN approval_count INTEGER DEFAULT 0;

-- Add rejection fields to player_edits
ALTER TABLE player_edits 
    ADD COLUMN rejection_category rejection_category,
    ADD COLUMN rejection_reason TEXT,
    ADD COLUMN approval_count INTEGER DEFAULT 0;

-- Function to update submission status based on approvals
CREATE OR REPLACE FUNCTION update_submission_status()
RETURNS TRIGGER AS $$
DECLARE
    approval_count INTEGER;
    rejection_count INTEGER;
    new_status TEXT;
BEGIN
    -- Count approvals and rejections for this submission
    SELECT 
        COUNT(*) FILTER (WHERE action = 'approved'),
        COUNT(*) FILTER (WHERE action = 'rejected')
    INTO approval_count, rejection_count
    FROM moderator_approvals 
    WHERE submission_type = NEW.submission_type 
    AND submission_id = NEW.submission_id;

    -- Determine new status
    IF rejection_count > 0 THEN
        new_status := 'rejected';
    ELSIF approval_count >= 2 THEN
        new_status := 'approved';
    ELSIF approval_count = 1 THEN
        new_status := 'awaiting_second_approval';
    ELSE
        new_status := 'pending';
    END IF;

    -- Update the appropriate submission table
    IF NEW.submission_type = 'equipment' THEN
        UPDATE equipment_submissions 
        SET status = new_status, approval_count = approval_count 
        WHERE id = NEW.submission_id;
    ELSIF NEW.submission_type = 'player' THEN
        UPDATE player_submissions 
        SET status = new_status, approval_count = approval_count 
        WHERE id = NEW.submission_id;
    ELSIF NEW.submission_type = 'player_edit' THEN
        UPDATE player_edits 
        SET status = new_status, approval_count = approval_count 
        WHERE id = NEW.submission_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update submission status
CREATE TRIGGER update_submission_status_trigger
    AFTER INSERT OR UPDATE OR DELETE ON moderator_approvals
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_status();

-- RLS policies for moderator_approvals
ALTER TABLE moderator_approvals ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own approval history
CREATE POLICY "Users can read moderator approvals for their submissions" ON moderator_approvals
    FOR SELECT USING (
        submission_id IN (
            SELECT id FROM equipment_submissions WHERE user_id = auth.uid()
            UNION
            SELECT id FROM player_submissions WHERE user_id = auth.uid()
            UNION 
            SELECT id FROM player_edits WHERE user_id = auth.uid()
        )
    );

-- Allow moderators to read all approvals
CREATE POLICY "Moderators can read all approvals" ON moderator_approvals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
    );

-- Allow moderators to insert approvals
CREATE POLICY "Moderators can insert approvals" ON moderator_approvals
    FOR INSERT WITH CHECK (
        moderator_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'moderator')
        )
    );

-- Update existing submissions to have default status
UPDATE equipment_submissions SET status = 'pending' WHERE status IS NULL;
UPDATE player_submissions SET status = 'pending' WHERE status IS NULL;
UPDATE player_edits SET status = 'pending' WHERE status IS NULL;