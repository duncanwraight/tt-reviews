-- Spec-sourcing diagnostic run log (TT-162). Adds a JSONB column to
-- equipment_spec_proposals capturing every decision the queue
-- consumer made for the run that produced this proposal: which sources
-- were considered, which were skipped for brand mismatch, search
-- counts, prefilter survivors, LLM match verdicts, fetch outcomes,
-- extract results, merge summary, terminal outcome.
--
-- Surfaces on the admin Review page (/admin/manufacturer-specs/:id)
-- so a moderator can tell why a proposal landed in pending_review or
-- no_results without diving into wrangler tail. The cron has been
-- producing only revspin/tt11 contributions and the persisted log is
-- the diagnostic to find out why.
--
-- Replaced on every re-scan along with the rest of the row (existing
-- upsert on equipment_id). No history; no separate table; no orphans.
-- Transient halts (rate_limited / out_of_budget) re-queue without
-- persisting — next attempt logs fresh.

ALTER TABLE equipment_spec_proposals
  ADD COLUMN run_log JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN equipment_spec_proposals.run_log IS
  'Append-only array of structured pipeline decisions for the run that produced this proposal (TT-162). Replaced on re-scan.';
