-- Automatic Takeoff run history (Phase A)
CREATE TABLE public.takeoff_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  working_file_id uuid,
  working_page_number integer,
  working_page_type text,
  classification_confidence text,
  classification_reason text,
  scale_text text,
  calibration_id uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX takeoff_runs_job_id_idx ON public.takeoff_runs(job_id);
CREATE INDEX takeoff_runs_started_at_idx ON public.takeoff_runs(started_at DESC);

ALTER TABLE public.takeoff_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read takeoff runs"
  ON public.takeoff_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = takeoff_runs.job_id
      AND (j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (public.has_role(auth.uid(), 'viewer'::app_role)
            AND j.status = ANY (ARRAY['approved'::job_status, 'exported'::job_status])))
  ));

CREATE POLICY "Insert takeoff runs (writers)"
  ON public.takeoff_runs FOR INSERT
  WITH CHECK (
    auth.uid() = started_by
    AND public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = takeoff_runs.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

CREATE POLICY "Update takeoff runs (writers)"
  ON public.takeoff_runs FOR UPDATE
  USING (
    public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = takeoff_runs.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

CREATE POLICY "Delete takeoff runs admin"
  ON public.takeoff_runs FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER takeoff_runs_updated_at
  BEFORE UPDATE ON public.takeoff_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();