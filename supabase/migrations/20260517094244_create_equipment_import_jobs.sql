-- TT-238: split admin equipment-import work across queue invocations so a
-- single Worker call doesn't blow past Cloudflare's 50-subrequest cap.
-- The two tables here are the persistence layer the new
-- EQUIPMENT_IMPORT_QUEUE consumer writes to and the admin UI polls.
--
--   equipment_import_jobs       one row per "Import N items" click; carries
--                               the totals + finished_at sentinel.
--   equipment_import_job_items  one row per processed product; UNIQUE
--                               (job_id, slug) makes the consumer idempotent
--                               against Cloudflare's queue retries.
--
-- A row in job_items is written by the queue consumer when it terminates
-- one product (success or failure). The trigger keeps the job-level
-- success_count / failed_count counters in lockstep and stamps
-- finished_at when success_count + failed_count = total, so the polling
-- loader's "are we done" check is a single column read.

CREATE TABLE equipment_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    total INT NOT NULL,
    success_count INT NOT NULL DEFAULT 0,
    failed_count INT NOT NULL DEFAULT 0,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_equipment_import_jobs_created_by_created_at
    ON equipment_import_jobs(created_by, created_at DESC);

CREATE TABLE equipment_import_job_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES equipment_import_jobs(id) ON DELETE CASCADE,
    slug VARCHAR(255) NOT NULL,
    product_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (job_id, slug)
);

CREATE INDEX idx_equipment_import_job_items_job_status
    ON equipment_import_job_items(job_id, status);

-- Counter-maintenance trigger. Fires AFTER INSERT only — items are
-- write-once (a queue retry hits the UNIQUE(job_id, slug) constraint
-- and silently does nothing). When the last item lands, stamp
-- finished_at so the UI can flip the spinner off in one read.
CREATE OR REPLACE FUNCTION bump_equipment_import_job_counters()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'success' THEN
        UPDATE equipment_import_jobs
        SET success_count = success_count + 1,
            finished_at = CASE
                WHEN success_count + 1 + failed_count >= total THEN NOW()
                ELSE finished_at
            END
        WHERE id = NEW.job_id;
    ELSE
        UPDATE equipment_import_jobs
        SET failed_count = failed_count + 1,
            finished_at = CASE
                WHEN success_count + failed_count + 1 >= total THEN NOW()
                ELSE finished_at
            END
        WHERE id = NEW.job_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_equipment_import_job_counters
    AFTER INSERT ON equipment_import_job_items
    FOR EACH ROW
    EXECUTE FUNCTION bump_equipment_import_job_counters();

-- RLS — admin-only via the categorical "admin can do anything" pattern
-- the rest of the project uses. The queue consumer talks via
-- service_role and bypasses RLS, so the policies only have to cover
-- the UI's reads.
ALTER TABLE equipment_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_import_job_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all equipment import jobs"
    ON equipment_import_jobs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY "Admins can view all equipment import job items"
    ON equipment_import_job_items
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );
