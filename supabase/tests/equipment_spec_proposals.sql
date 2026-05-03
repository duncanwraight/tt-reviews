-- pgTAP tests for the equipment_spec_proposals schema added by
-- 20260503074556_add_equipment_spec_proposals.sql (TT-146).
-- Confirms the status CHECK constraint rejects unknown values and the
-- equipment.specs_source_status CHECK does the same. Belt-and-braces
-- protection in case the worker writes a malformed status string.

BEGIN;

SELECT plan(4);

INSERT INTO equipment (id, name, slug, category, manufacturer)
VALUES ('44444444-4444-4444-4444-444444444444',
        'Spec Proposals Test Blade', 'spec-proposals-test-blade',
        'blade', 'TestCo');

-- Valid status writes through.
INSERT INTO equipment_spec_proposals (equipment_id, merged, candidates, status)
VALUES ('44444444-4444-4444-4444-444444444444',
        '{"specs": {}, "description": null, "per_field_source": {}}'::jsonb,
        '{}'::jsonb,
        'pending_review');

SELECT is(
  (SELECT status FROM equipment_spec_proposals
    WHERE equipment_id = '44444444-4444-4444-4444-444444444444'),
  'pending_review',
  'a valid status writes through'
);

-- Bogus status is rejected by the CHECK.
SELECT throws_ok(
  $$INSERT INTO equipment_spec_proposals (equipment_id, merged, candidates, status)
    VALUES ('44444444-4444-4444-4444-444444444444',
            '{}'::jsonb, '{}'::jsonb, 'bogus')$$,
  '23514',
  NULL,
  'equipment_spec_proposals.status rejects unknown values'
);

-- equipment.specs_source_status CHECK accepts the documented values.
UPDATE equipment SET specs_source_status = 'fresh'
  WHERE id = '44444444-4444-4444-4444-444444444444';

SELECT is(
  (SELECT specs_source_status FROM equipment
    WHERE id = '44444444-4444-4444-4444-444444444444'),
  'fresh',
  'equipment.specs_source_status accepts a valid value'
);

-- equipment.specs_source_status CHECK rejects unknown values.
SELECT throws_ok(
  $$UPDATE equipment SET specs_source_status = 'mystery'
     WHERE id = '44444444-4444-4444-4444-444444444444'$$,
  '23514',
  NULL,
  'equipment.specs_source_status rejects unknown values'
);

SELECT * FROM finish();
ROLLBACK;
