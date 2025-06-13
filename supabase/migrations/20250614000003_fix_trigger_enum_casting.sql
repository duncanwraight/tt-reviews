-- Fix enum casting in the trigger function

CREATE OR REPLACE FUNCTION update_submission_status()
RETURNS TRIGGER AS $$
DECLARE
    approval_count_var INTEGER;
    rejection_count_var INTEGER;
    new_status review_status;
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
    ELSIF NEW.submission_type = 'player_edit' THEN
        UPDATE player_edits 
        SET status = new_status, approval_count = approval_count_var 
        WHERE id = NEW.submission_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;