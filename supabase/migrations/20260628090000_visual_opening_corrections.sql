CREATE TABLE IF NOT EXISTS public.visual_opening_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  takeoff_run_id uuid REFERENCES public.takeoff_runs(id) ON DELETE SET NULL,
  opening_id text NOT NULL,
  marker_label text NOT NULL,
  correction_type text NOT NULL CHECK (
    correction_type IN (
      'confirm_opening',
      'not_opening',
      'component_of_opening',
      'box_too_small',
      'box_too_large',
      'wrong_type'
    )
  ),
  corrected_type text,
  reason text,
  marker_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visual_opening_corrections_job_created_idx
  ON public.visual_opening_corrections(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS visual_opening_corrections_job_marker_idx
  ON public.visual_opening_corrections(job_id, marker_label, created_at DESC);

ALTER TABLE public.visual_opening_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read visual opening corrections" ON public.visual_opening_corrections;
CREATE POLICY "Read visual opening corrections" ON public.visual_opening_corrections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = visual_opening_corrections.job_id
      AND (
        j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (
          public.has_role(auth.uid(), 'viewer'::public.app_role)
          AND j.status IN ('approved'::public.job_status, 'exported'::public.job_status)
        )
      )
  ));

DROP POLICY IF EXISTS "Insert visual opening corrections" ON public.visual_opening_corrections;
CREATE POLICY "Insert visual opening corrections" ON public.visual_opening_corrections FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = visual_opening_corrections.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Delete visual opening corrections admin" ON public.visual_opening_corrections;
CREATE POLICY "Delete visual opening corrections admin" ON public.visual_opening_corrections FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));
