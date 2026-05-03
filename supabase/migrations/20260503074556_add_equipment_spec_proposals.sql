-- Manufacturer-spec sourcing pipeline (TT-146 / parent TT-145).
--
-- Schema-only migration. Adds the proposals staging table and two
-- equipment-side cooldown columns. No code consumes any of this yet —
-- TT-147..TT-151 wire the cron, queue, extractor, and admin review UI.
--
-- Design context lives on the parent ticket (TT-145). The high-level
-- shape: every catalog row gets one proposal row (UNIQUE on
-- equipment_id), replaced on re-scan. `merged` holds the per-field
-- winner across tier-1/2/3 sources with a per-field URL map; `candidates`
-- holds the raw per-source extractions for the admin diff. Admin
-- approves -> apply step writes back into equipment.* columns directly
-- (mirrors photo-sourcing), and the equipment.specs_sourced_at /
-- specs_source_status pair drives the cron's cooldown logic
-- (6 months on success, 14 days on no_results).

CREATE TABLE equipment_spec_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL UNIQUE REFERENCES equipment(id) ON DELETE CASCADE,
  merged JSONB NOT NULL,
  candidates JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'applied', 'rejected', 'no_results')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE equipment_spec_proposals IS
  'Per-equipment spec/description proposals from the sourcing pipeline (TT-145). One row per equipment, replaced on re-scan.';
COMMENT ON COLUMN equipment_spec_proposals.merged IS
  'Worker-merged result: { specs: {...}, description: text|null, per_field_source: { field_name: url } }.';
COMMENT ON COLUMN equipment_spec_proposals.candidates IS
  'Raw per-source extractions: { "<source_url>": { specs, description, confidence, raw_html_excerpt, fetched_at } }.';
COMMENT ON COLUMN equipment_spec_proposals.status IS
  'pending_review | applied | rejected | no_results.';
COMMENT ON COLUMN equipment_spec_proposals.reviewed_by IS
  'auth.users.id of the admin who applied or rejected. SET NULL on user delete to preserve the proposal row.';

-- Admin queue ordering: oldest pending first.
CREATE INDEX idx_equipment_spec_proposals_status_created_at
  ON equipment_spec_proposals (status, created_at);

-- RLS: deny everything to anon/authenticated. The cron worker, queue
-- consumer, and admin loaders all use the service-role key (which
-- bypasses RLS). Same posture as equipment_similar — no policies for
-- non-service roles is the strictest possible while still allowing the
-- service-role caller to do its job.
ALTER TABLE equipment_spec_proposals ENABLE ROW LEVEL SECURITY;

-- Equipment-side cooldown columns. Cron picks rows ORDER BY
-- specs_sourced_at ASC NULLS FIRST so never-sourced rows lead, then
-- oldest. Application code applies the 6-month / 14-day cooldown on top
-- via specs_source_status.
ALTER TABLE equipment
  ADD COLUMN specs_sourced_at TIMESTAMPTZ,
  ADD COLUMN specs_source_status TEXT
    CHECK (specs_source_status IN ('fresh', 'no_results', 'pending_review') OR specs_source_status IS NULL);

COMMENT ON COLUMN equipment.specs_sourced_at IS
  'Last time the spec sourcing pipeline (TT-145) finished a run for this row. Drives cron cooldown.';
COMMENT ON COLUMN equipment.specs_source_status IS
  'Outcome of the most recent sourcing run: fresh (applied), no_results (all tiers exhausted), pending_review. NULL = never sourced.';

-- Cron enqueue: oldest-first, NULLs (never sourced) lead.
CREATE INDEX idx_equipment_specs_sourced_at_nulls_first
  ON equipment (specs_sourced_at NULLS FIRST);
