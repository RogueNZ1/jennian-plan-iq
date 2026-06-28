CREATE TABLE IF NOT EXISTS public.extracted_quantity_rows (
  id text NOT NULL,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.takeoff_runs(id) ON DELETE CASCADE,
  category text NOT NULL,
  label text,
  count numeric,
  width_mm numeric,
  height_mm numeric,
  length_mm numeric,
  area_m2 numeric,
  status text NOT NULL CHECK (
    status IN ('extracted', 'needs_review', 'missing_evidence', 'conflict', 'ignored')
  ),
  confidence integer NOT NULL,
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  PRIMARY KEY (job_id, run_id, id)
);

CREATE INDEX IF NOT EXISTS extracted_quantity_rows_job_active_idx
  ON public.extracted_quantity_rows(job_id, run_id)
  WHERE superseded_at IS NULL;

CREATE INDEX IF NOT EXISTS extracted_quantity_rows_job_history_idx
  ON public.extracted_quantity_rows(job_id, created_at DESC);

ALTER TABLE public.extracted_quantity_rows ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS extracted_quantity_rows_updated_at ON public.extracted_quantity_rows;
CREATE TRIGGER extracted_quantity_rows_updated_at BEFORE UPDATE ON public.extracted_quantity_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Read extracted quantity rows" ON public.extracted_quantity_rows;
CREATE POLICY "Read extracted quantity rows" ON public.extracted_quantity_rows FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = extracted_quantity_rows.job_id
      AND (
        j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (
          public.has_role(auth.uid(), 'viewer'::public.app_role)
          AND j.status IN ('approved'::public.job_status, 'exported'::public.job_status)
        )
      )
  ));

DROP POLICY IF EXISTS "Insert extracted quantity rows" ON public.extracted_quantity_rows;
CREATE POLICY "Insert extracted quantity rows" ON public.extracted_quantity_rows FOR INSERT
  WITH CHECK (
    public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = extracted_quantity_rows.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Update extracted quantity rows" ON public.extracted_quantity_rows;
CREATE POLICY "Update extracted quantity rows" ON public.extracted_quantity_rows FOR UPDATE
  USING (
    public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = extracted_quantity_rows.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Delete extracted quantity rows admin" ON public.extracted_quantity_rows;
CREATE POLICY "Delete extracted quantity rows admin" ON public.extracted_quantity_rows FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));
