-- Equipment photo-pipeline activity log (TT-174).
--
-- Append-only event table replacing the `/admin/equipment-photos`
-- "Recent activity" feed, which used to be derived from
-- `equipment.image_sourcing_attempted_at` + a per-row un-picked-
-- candidate lookup. That derivation only reflected what the providers
-- did, not what the admin did — picking, skipping, rejecting, and
-- manual re-queue all left the equipment columns unchanged so the row
-- never bubbled to the top of the feed. See TT-173 notes for the
-- specific oddities that motivated the swap.
--
-- One row per pipeline transition. `actor_id` is NULL for system
-- events (cron, queue consumer); `metadata.triggered_by` carries the
-- system-actor label ('cron' / 'admin-requeue' / 'queue-retry').
-- Admin events ('picked', 'skipped', 'candidate_rejected', 'resourced',
-- 'requeued') always carry an actor_id.
--
-- Read access is locked to admins / service-role; the loader runs
-- service-role on the server, so no anon reads are needed.

CREATE TABLE IF NOT EXISTS equipment_photo_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (
    event_kind IN (
      'sourcing_attempted',
      'candidates_found',
      'no_candidates',
      'provider_transient',
      'auto_picked',
      'routed_to_review',
      'requeued',
      'picked',
      'skipped',
      'candidate_rejected',
      'resourced'
    )
  ),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE equipment_photo_events IS 'Append-only photo-pipeline activity log. See TT-174.';
COMMENT ON COLUMN equipment_photo_events.event_kind IS 'Pipeline transition: sourcing_attempted, candidates_found, no_candidates, provider_transient, auto_picked, routed_to_review, requeued, picked, skipped, candidate_rejected, resourced.';
COMMENT ON COLUMN equipment_photo_events.actor_id IS 'auth.users id of the admin who took the action; NULL for system events (cron, queue consumer).';
COMMENT ON COLUMN equipment_photo_events.metadata IS 'Per-event-kind context: triggered_by, candidate_id, r2_key, tier, provider, reason, attempts, candidate_count, etc.';

CREATE INDEX IF NOT EXISTS equipment_photo_events_recent
  ON equipment_photo_events (created_at DESC);

CREATE INDEX IF NOT EXISTS equipment_photo_events_eq
  ON equipment_photo_events (equipment_id, created_at DESC);

ALTER TABLE equipment_photo_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access on equipment_photo_events"
  ON equipment_photo_events;

CREATE POLICY "Admins full access on equipment_photo_events"
  ON equipment_photo_events
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'admin');
