-- Admin UI approvals are "complete" - they don't need a second approval
-- Discord approvals still require 2 approvals

CREATE OR REPLACE FUNCTION update_submission_status()
RETURNS TRIGGER AS $$
DECLARE
    v_approval_count INTEGER;
    v_rejection_count INTEGER;
    v_admin_ui_approval_count INTEGER;
    v_new_status TEXT;
    v_submission_type TEXT;
    v_submission_id UUID;
BEGIN
    -- Handle DELETE case - use OLD values
    IF TG_OP = 'DELETE' THEN
        v_submission_type := OLD.submission_type;
        v_submission_id := OLD.submission_id;
    ELSE
        v_submission_type := NEW.submission_type;
        v_submission_id := NEW.submission_id;
    END IF;

    -- Count approvals, rejections, and admin UI approvals for this submission
    SELECT
        COUNT(*) FILTER (WHERE action = 'approved'),
        COUNT(*) FILTER (WHERE action = 'rejected'),
        COUNT(*) FILTER (WHERE action = 'approved' AND source = 'admin_ui')
    INTO v_approval_count, v_rejection_count, v_admin_ui_approval_count
    FROM moderator_approvals
    WHERE submission_type = v_submission_type
    AND submission_id = v_submission_id;

    -- Determine new status
    -- Priority: rejection > admin_ui approval > 2 discord approvals > 1 discord approval > pending
    IF v_rejection_count > 0 THEN
        v_new_status := 'rejected';
    ELSIF v_admin_ui_approval_count >= 1 THEN
        -- Admin UI approval is complete - no second approval needed
        v_new_status := 'approved';
    ELSIF v_approval_count >= 2 THEN
        -- Two Discord approvals also results in approval
        v_new_status := 'approved';
    ELSIF v_approval_count = 1 THEN
        v_new_status := 'awaiting_second_approval';
    ELSE
        v_new_status := 'pending';
    END IF;

    -- Update the appropriate submission table
    IF v_submission_type = 'equipment' THEN
        UPDATE equipment_submissions
        SET status = v_new_status::review_status, approval_count = v_approval_count
        WHERE id = v_submission_id;
    ELSIF v_submission_type = 'player' THEN
        UPDATE player_submissions
        SET status = v_new_status::review_status, approval_count = v_approval_count
        WHERE id = v_submission_id;
    ELSIF v_submission_type = 'player_edit' THEN
        UPDATE player_edits
        SET status = v_new_status::review_status, approval_count = v_approval_count
        WHERE id = v_submission_id;
    ELSIF v_submission_type = 'review' THEN
        UPDATE equipment_reviews
        SET status = v_new_status::review_status, approval_count = v_approval_count
        WHERE id = v_submission_id;
    ELSIF v_submission_type = 'video' THEN
        UPDATE video_submissions
        SET status = v_new_status::review_status, approval_count = v_approval_count
        WHERE id = v_submission_id;
    ELSIF v_submission_type = 'player_equipment_setup' THEN
        UPDATE player_equipment_setup_submissions
        SET status = v_new_status::review_status, approval_count = v_approval_count
        WHERE id = v_submission_id;
    END IF;

    -- Return appropriate row based on operation
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
