-- TT-204: player importer queue diagnostic run log.
--
-- Adds a JSONB column to player_proposals so the queue consumer can
-- record every per-message decision (roster dedupe outcome, ITTF
-- fetch, photo download, R2 upload, merge verdict, terminal outcome
-- or transient retry). Surfaces on the proposal detail page
-- (/admin/import-players/:id) as the diagnostic to explain why a
-- proposal landed in pending_review vs auto_applied.
--
-- Same shape rationale as equipment_spec_proposals.run_log
-- (20260504080000_add_spec_proposal_run_log.sql): append-only, replaced
-- on re-enqueue, no history. The producer seeds the array with a single
-- `roster_match` entry at enqueue time so the admin "Pending in queue"
-- tile can count proposals whose last log entry is still roster_match
-- (i.e. the consumer hasn't picked them up yet).

ALTER TABLE player_proposals
  ADD COLUMN run_log JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN player_proposals.run_log IS
  'Append-only array of structured importer-pipeline decisions for the run that produced this proposal (TT-204). Replaced on re-enqueue.';
