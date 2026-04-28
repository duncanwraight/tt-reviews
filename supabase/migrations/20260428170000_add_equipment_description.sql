-- TT-80: free-text manufacturer description on equipment.
--
-- A top-level column rather than a key in `specifications` JSONB. The typed
-- specifications migration (20260427120000) deliberately moved that JSONB
-- away from free text into typed numerics/ranges so spec values are
-- comparable; description is marketing prose, not a comparable spec, and
-- doesn't belong there. Column-level CHECK also gives clean length
-- enforcement without an awkward jsonb-expression constraint.
--
-- 2000-char cap matches the validator boundary used elsewhere
-- (player_edits.edit_reason, moderator_notes); the submissions length-cap
-- migration (20260423120000) is the precedent for belt-and-braces DB
-- enforcement on user-writable text.

ALTER TABLE equipment
  ADD COLUMN description TEXT,
  ADD CONSTRAINT equipment_description_length
    CHECK (description IS NULL OR length(description) <= 2000);

ALTER TABLE equipment_submissions
  ADD COLUMN description TEXT,
  ADD CONSTRAINT equipment_submissions_description_length
    CHECK (description IS NULL OR length(description) <= 2000);
