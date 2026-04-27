-- Equipment similarity precomputed table (TT-70 / parent TT-26).
-- Populated by a daily Cloudflare Worker cron tick (workers/app.ts → scheduled)
-- and by an admin manual trigger (app/routes/admin.recompute-similar.tsx).
-- Reads at request time hit the (equipment_id, rank) index — no live aggregation.

CREATE TABLE equipment_similar (
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  similar_equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  score NUMERIC NOT NULL,
  rank SMALLINT NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (equipment_id, similar_equipment_id),
  CHECK (equipment_id <> similar_equipment_id)
);

CREATE INDEX equipment_similar_by_rank ON equipment_similar (equipment_id, rank);

ALTER TABLE equipment_similar ENABLE ROW LEVEL SECURITY;

-- Public can SELECT — the UI shows similar equipment to anonymous visitors.
-- No INSERT/UPDATE/DELETE policies: the recompute job and the admin route both
-- write via the service-role key, which bypasses RLS. Authenticated users have
-- no path to mutate this table.
CREATE POLICY "equipment_similar public select"
  ON equipment_similar
  FOR SELECT
  USING (true);
