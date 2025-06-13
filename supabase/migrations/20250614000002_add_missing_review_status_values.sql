-- Add missing review_status enum values that were referenced in the trigger but not actually added

-- Check if values already exist before adding them
DO $$
BEGIN
    -- Add 'under_review' if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'under_review' AND enumtypid = 'review_status'::regtype) THEN
        ALTER TYPE review_status ADD VALUE 'under_review';
    END IF;
    
    -- Add 'awaiting_second_approval' if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'awaiting_second_approval' AND enumtypid = 'review_status'::regtype) THEN
        ALTER TYPE review_status ADD VALUE 'awaiting_second_approval';
    END IF;
END
$$;