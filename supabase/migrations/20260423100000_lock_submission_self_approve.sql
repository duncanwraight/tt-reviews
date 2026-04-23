-- SECURITY.md Phase 3, part 1: close self-approval on submission tables.
--
-- The four submission tables below shipped with
--   FOR UPDATE USING (auth.uid() IS NOT NULL)
-- which lets any authenticated user update anyone's submission, including
-- setting status='approved'. Replace with admin-only USING + WITH CHECK,
-- mirroring the shape already used on player_equipment_setup_submissions
-- (migration 20251231160000). Admin SELECT and DELETE policies are added
-- for consistency with that reference table.
--
-- The moderation admin routes use the service-role client and bypass RLS,
-- so tightening these policies does not affect the moderation flow.

-- ---------------------------------------------------------------------
-- equipment_submissions
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can moderate equipment submissions"
  ON equipment_submissions;

CREATE POLICY "Admins can view all equipment submissions"
  ON equipment_submissions
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can update equipment submissions"
  ON equipment_submissions
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can delete equipment submissions"
  ON equipment_submissions
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

-- ---------------------------------------------------------------------
-- player_edits
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can moderate player edits"
  ON player_edits;

CREATE POLICY "Admins can view all player edits"
  ON player_edits
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can update player edits"
  ON player_edits
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can delete player edits"
  ON player_edits
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

-- ---------------------------------------------------------------------
-- player_submissions
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can moderate player submissions"
  ON player_submissions;

CREATE POLICY "Admins can view all player submissions"
  ON player_submissions
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can update player submissions"
  ON player_submissions
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can delete player submissions"
  ON player_submissions
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

-- ---------------------------------------------------------------------
-- video_submissions
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can moderate video submissions"
  ON video_submissions;

CREATE POLICY "Admins can view all video submissions"
  ON video_submissions
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can update video submissions"
  ON video_submissions
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');

CREATE POLICY "Admins can delete video submissions"
  ON video_submissions
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin');
