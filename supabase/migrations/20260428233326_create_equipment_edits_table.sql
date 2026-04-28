-- TT-101: equipment_edits table + RLS + status trigger.
--
-- Mirrors player_edits (20250610223013) and the lock-down RLS shape
-- from 20260423100000_lock_submission_self_approve.sql. Extending
-- moderator_approvals.submission_type CHECK + the registry/types
-- coupling is deferred to TT-102 so they can land atomically with the
-- application-side SUBMISSION_TYPE_VALUES change (registry.test.ts
-- pins the two together). The trigger here references
-- equipment_edits but only fires for v_submission_type='equipment_edit',
-- which can't currently be inserted into moderator_approvals (CHECK
-- rejects it) — so this is dormant until TT-102 lights it up.

-- ============================================================================
-- 1. equipment_edits table.
-- ============================================================================

CREATE TABLE equipment_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  edit_data JSONB NOT NULL,
  status review_status DEFAULT 'pending',
  approval_count INTEGER NOT NULL DEFAULT 0,
  moderator_id UUID REFERENCES auth.users(id),
  moderator_notes TEXT,
  rejection_category TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_equipment_edits_equipment_id ON equipment_edits(equipment_id);
CREATE INDEX idx_equipment_edits_status       ON equipment_edits(status);
CREATE INDEX idx_equipment_edits_user_id      ON equipment_edits(user_id);
CREATE INDEX idx_equipment_edits_created_at   ON equipment_edits(created_at DESC);

CREATE TRIGGER update_equipment_edits_updated_at
  BEFORE UPDATE ON equipment_edits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. RLS — same shape as player_edits post lock-down (20260423100000).
--
--    Users can read/insert their own; admin can read/update/delete all.
--    moderation admin routes use the service-role client and bypass RLS,
--    so admin policies are belt-and-braces for the anon/authenticated key.
-- ============================================================================

ALTER TABLE equipment_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own equipment edits" ON equipment_edits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can submit equipment edits" ON equipment_edits
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all equipment edits" ON equipment_edits
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can update equipment edits" ON equipment_edits
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can delete equipment edits" ON equipment_edits
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

-- ============================================================================
-- 3. Extend update_submission_status trigger to know about equipment_edit.
--    Body identical to 20260101120000_admin_ui_single_approval.sql with one
--    extra branch in the IF/ELSIF ladder. The function is idempotent under
--    CREATE OR REPLACE.
-- ============================================================================

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
    IF TG_OP = 'DELETE' THEN
        v_submission_type := OLD.submission_type;
        v_submission_id := OLD.submission_id;
    ELSE
        v_submission_type := NEW.submission_type;
        v_submission_id := NEW.submission_id;
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE action = 'approved'),
        COUNT(*) FILTER (WHERE action = 'rejected'),
        COUNT(*) FILTER (WHERE action = 'approved' AND source = 'admin_ui')
    INTO v_approval_count, v_rejection_count, v_admin_ui_approval_count
    FROM moderator_approvals
    WHERE submission_type = v_submission_type
    AND submission_id = v_submission_id;

    IF v_rejection_count > 0 THEN
        v_new_status := 'rejected';
    ELSIF v_admin_ui_approval_count >= 1 THEN
        v_new_status := 'approved';
    ELSIF v_approval_count >= 2 THEN
        v_new_status := 'approved';
    ELSIF v_approval_count = 1 THEN
        v_new_status := 'awaiting_second_approval';
    ELSE
        v_new_status := 'pending';
    END IF;

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
    ELSIF v_submission_type = 'equipment_edit' THEN
        UPDATE equipment_edits
        SET status = v_new_status::review_status, approval_count = v_approval_count
        WHERE id = v_submission_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
