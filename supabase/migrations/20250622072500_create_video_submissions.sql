-- Create video submissions table for moderation workflow
CREATE TABLE video_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    videos JSONB NOT NULL DEFAULT '[]'::jsonb,
    status review_status DEFAULT 'pending'::review_status,
    moderator_id UUID REFERENCES auth.users(id),
    moderator_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    rejection_category rejection_category,
    rejection_reason TEXT,
    approval_count INTEGER DEFAULT 0,
    discord_message_id TEXT
);

-- Create indexes for performance
CREATE INDEX idx_video_submissions_user_id ON video_submissions(user_id);
CREATE INDEX idx_video_submissions_player_id ON video_submissions(player_id);
CREATE INDEX idx_video_submissions_status ON video_submissions(status);
CREATE INDEX idx_video_submissions_created_at ON video_submissions(created_at DESC);
CREATE INDEX idx_video_submissions_discord_message ON video_submissions(discord_message_id);

-- Add RLS policies
ALTER TABLE video_submissions ENABLE ROW LEVEL SECURITY;

-- Users can submit video submissions
CREATE POLICY "Authenticated users can submit videos" ON video_submissions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can view their own video submissions
CREATE POLICY "Users can view own video submissions" ON video_submissions
    FOR SELECT
    USING (auth.uid() = user_id);

-- Authenticated users can moderate video submissions
CREATE POLICY "Authenticated users can moderate video submissions" ON video_submissions
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_video_submissions_updated_at
    BEFORE UPDATE ON video_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update the submission status trigger to handle video submissions
CREATE OR REPLACE FUNCTION update_submission_status()
RETURNS TRIGGER AS $$
DECLARE
    approval_count_var INTEGER;
    rejection_count_var INTEGER;
    new_status review_status;
    player_slug TEXT;
    submission_data RECORD;
BEGIN
    -- Count approvals and rejections for this submission
    SELECT 
        COUNT(*) FILTER (WHERE action = 'approved'),
        COUNT(*) FILTER (WHERE action = 'rejected')
    INTO approval_count_var, rejection_count_var
    FROM moderator_approvals 
    WHERE submission_type = NEW.submission_type 
    AND submission_id = NEW.submission_id;

    -- Determine new status
    IF rejection_count_var > 0 THEN
        new_status := 'rejected'::review_status;
    ELSIF approval_count_var >= 2 THEN
        new_status := 'approved'::review_status;
    ELSIF approval_count_var = 1 THEN
        new_status := 'awaiting_second_approval'::review_status;
    ELSE
        new_status := 'pending'::review_status;
    END IF;

    -- Update the appropriate submission table
    IF NEW.submission_type = 'equipment' THEN
        UPDATE equipment_submissions 
        SET status = new_status, approval_count = approval_count_var 
        WHERE id = NEW.submission_id;
        
    ELSIF NEW.submission_type = 'video' THEN
        UPDATE video_submissions 
        SET status = new_status, approval_count = approval_count_var 
        WHERE id = NEW.submission_id;
        
        -- Create videos when approved
        IF new_status = 'approved'::review_status THEN
            -- Get submission data
            SELECT * INTO submission_data FROM video_submissions WHERE id = NEW.submission_id;
            
            -- Create videos if provided
            IF submission_data.videos IS NOT NULL AND jsonb_typeof(submission_data.videos) = 'array' THEN
                INSERT INTO player_footage (player_id, url, title, platform, active)
                SELECT 
                    submission_data.player_id,
                    video->>'url',
                    video->>'title',
                    CASE video->>'platform'
                        WHEN 'youtube' THEN 'youtube'::footage_platform
                        WHEN 'other' THEN 'other'::footage_platform
                        ELSE 'other'::footage_platform
                    END,
                    true
                FROM jsonb_array_elements(submission_data.videos) AS video
                WHERE video->>'url' IS NOT NULL AND video->>'title' IS NOT NULL;
            END IF;
        END IF;
        
    ELSIF NEW.submission_type = 'player' THEN
        UPDATE player_submissions 
        SET status = new_status, approval_count = approval_count_var 
        WHERE id = NEW.submission_id;
        
        -- Create player record when approved
        IF new_status = 'approved'::review_status THEN
            -- Get submission data
            SELECT * INTO submission_data FROM player_submissions WHERE id = NEW.submission_id;
            
            -- Generate slug from name
            player_slug := lower(regexp_replace(submission_data.name, '[^a-zA-Z0-9\\s]', '', 'g'));
            player_slug := regexp_replace(player_slug, '\\s+', '-', 'g');
            player_slug := trim(both '-' from player_slug);
            
            -- Ensure unique slug
            WHILE EXISTS (SELECT 1 FROM players WHERE slug = player_slug) LOOP
                player_slug := player_slug || '-' || floor(random() * 1000)::text;
            END LOOP;
            
            -- Create the player record
            INSERT INTO players (
                name, 
                slug, 
                highest_rating, 
                active_years, 
                playing_style, 
                birth_country, 
                represents,
                active
            ) VALUES (
                submission_data.name,
                player_slug,
                submission_data.highest_rating,
                submission_data.active_years,
                submission_data.playing_style,
                submission_data.birth_country,
                submission_data.represents,
                true
            );
            
            -- Create equipment setup if provided
            IF submission_data.equipment_setup IS NOT NULL AND jsonb_typeof(submission_data.equipment_setup) = 'object' THEN
                INSERT INTO player_equipment_setups (
                    player_id,
                    year,
                    blade_name,
                    forehand_rubber_name,
                    forehand_thickness,
                    forehand_color,
                    backhand_rubber_name,
                    backhand_thickness,
                    backhand_color,
                    source_type,
                    source_url
                ) VALUES (
                    (SELECT id FROM players WHERE slug = player_slug),
                    COALESCE((submission_data.equipment_setup->>'year')::integer, extract(year from now())::integer),
                    submission_data.equipment_setup->>'blade_name',
                    submission_data.equipment_setup->>'forehand_rubber_name',
                    submission_data.equipment_setup->>'forehand_thickness',
                    CASE submission_data.equipment_setup->>'forehand_color' 
                        WHEN 'red' THEN 'red'::equipment_color 
                        WHEN 'black' THEN 'black'::equipment_color 
                        ELSE NULL 
                    END,
                    submission_data.equipment_setup->>'backhand_rubber_name',
                    submission_data.equipment_setup->>'backhand_thickness',
                    CASE submission_data.equipment_setup->>'backhand_color' 
                        WHEN 'red' THEN 'red'::equipment_color 
                        WHEN 'black' THEN 'black'::equipment_color 
                        ELSE NULL 
                    END,
                    CASE submission_data.equipment_setup->>'source_type'
                        WHEN 'interview' THEN 'interview'::equipment_source_type
                        WHEN 'video' THEN 'video'::equipment_source_type
                        WHEN 'tournament_footage' THEN 'tournament_footage'::equipment_source_type
                        WHEN 'official_website' THEN 'official_website'::equipment_source_type
                        ELSE NULL
                    END,
                    submission_data.equipment_setup->>'source_url'
                );
            END IF;
            
            -- Create videos if provided
            IF submission_data.videos IS NOT NULL AND jsonb_typeof(submission_data.videos) = 'array' THEN
                INSERT INTO player_footage (player_id, url, title, platform, active)
                SELECT 
                    (SELECT id FROM players WHERE slug = player_slug),
                    video->>'url',
                    video->>'title',
                    CASE video->>'platform'
                        WHEN 'youtube' THEN 'youtube'::footage_platform
                        WHEN 'other' THEN 'other'::footage_platform
                        ELSE 'other'::footage_platform
                    END,
                    true
                FROM jsonb_array_elements(submission_data.videos) AS video
                WHERE video->>'url' IS NOT NULL AND video->>'title' IS NOT NULL;
            END IF;
        END IF;
        
    ELSIF NEW.submission_type = 'player_edit' THEN
        UPDATE player_edits 
        SET status = new_status, approval_count = approval_count_var 
        WHERE id = NEW.submission_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;