-- Fix the update_submission_status trigger to create actual player records when approved
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
        
    ELSIF NEW.submission_type = 'player' THEN
        UPDATE player_submissions 
        SET status = new_status, approval_count = approval_count_var 
        WHERE id = NEW.submission_id;
        
        -- Create player record when approved
        IF new_status = 'approved'::review_status THEN
            -- Get submission data
            SELECT * INTO submission_data FROM player_submissions WHERE id = NEW.submission_id;
            
            -- Generate slug from name
            player_slug := lower(regexp_replace(submission_data.name, '[^a-zA-Z0-9\s]', '', 'g'));
            player_slug := regexp_replace(player_slug, '\s+', '-', 'g');
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
        END IF;
        
    ELSIF NEW.submission_type = 'player_edit' THEN
        UPDATE player_edits 
        SET status = new_status, approval_count = approval_count_var 
        WHERE id = NEW.submission_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;