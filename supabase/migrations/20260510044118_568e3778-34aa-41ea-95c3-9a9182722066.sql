
-- 1) Working plan file selection on jobs
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS working_plan_file_id uuid,
  ADD COLUMN IF NOT EXISTS working_plan_page_number integer;

-- 2) Source-tracking columns on module_items
ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS source_evidence text,
  ADD COLUMN IF NOT EXISTS measurement_id uuid,
  ADD COLUMN IF NOT EXISTS opening_id uuid,
  ADD COLUMN IF NOT EXISTS plan_page_number integer,
  ADD COLUMN IF NOT EXISTS file_id uuid;

-- 3) Opening schedule: ensure file_id present (plan_page_number already exists)
ALTER TABLE public.opening_schedule
  ADD COLUMN IF NOT EXISTS file_id uuid;

-- 4) Plan measurement audit log table
CREATE TABLE IF NOT EXISTS public.plan_measurement_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  measurement_id uuid,
  opening_id uuid,
  calibration_id uuid,
  user_id uuid,
  action text NOT NULL,
  previous_value text,
  new_value text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_measurement_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read plan measurement audit"  ON public.plan_measurement_audit_logs;
DROP POLICY IF EXISTS "Insert plan measurement audit" ON public.plan_measurement_audit_logs;

CREATE POLICY "Read plan measurement audit"
  ON public.plan_measurement_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = plan_measurement_audit_logs.job_id
        AND ( j.created_by = auth.uid()
              OR public.is_admin_or_owner(auth.uid())
              OR ( public.has_role(auth.uid(), 'viewer'::public.app_role)
                   AND j.status IN ('approved'::public.job_status, 'exported'::public.job_status)))
    )
  );

CREATE POLICY "Insert plan measurement audit"
  ON public.plan_measurement_audit_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = plan_measurement_audit_logs.job_id
        AND ( j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()) )
    )
  );

CREATE INDEX IF NOT EXISTS idx_pmal_job ON public.plan_measurement_audit_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_pmal_meas ON public.plan_measurement_audit_logs(measurement_id);

-- 5) Downgrade legacy dummy rows in module_items.
-- A row is treated as legacy dummy when data_source is null AND
-- approved_value equals extracted_value AND source_evidence is null AND
-- the run is for a non-iq-core module.
UPDATE public.module_items
SET
  data_source     = 'Demo Value',
  confidence      = 'low',
  review_status   = 'review_required',
  approved_value  = NULL,
  notes           = COALESCE(notes, '') ||
                    CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END ||
                    'Legacy placeholder value — requires review.'
WHERE data_source IS NULL
  AND source_evidence IS NULL
  AND approved_value IS NOT NULL
  AND approved_value = extracted_value
  AND module_id <> 'iq-core';
