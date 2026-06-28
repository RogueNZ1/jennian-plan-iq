CREATE TABLE IF NOT EXISTS public.extracted_quantity_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.takeoff_runs(id) ON DELETE CASCADE,
  extracted_quantity_id text NOT NULL,
  visual_anchor_id text,
  action text NOT NULL CHECK (
    action IN (
      'set_dimension',
      'set_count',
      'set_status',
      'set_label',
      'ignore_row',
      'keep_needs_review',
      'add_note'
    )
  ),
  field text,
  before_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  evidence_refs_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_correction_id uuid REFERENCES public.extracted_quantity_corrections(id)
    ON DELETE SET NULL,
  reverted_at timestamptz,
  reverted_by uuid,
  revert_reason text,
  CONSTRAINT extracted_quantity_corrections_target_row_fk
    FOREIGN KEY (job_id, run_id, extracted_quantity_id)
    REFERENCES public.extracted_quantity_rows(job_id, run_id, id)
    ON DELETE CASCADE,
  CONSTRAINT extracted_quantity_corrections_evidence_refs_array
    CHECK (jsonb_typeof(evidence_refs_json) = 'array'),
  CONSTRAINT extracted_quantity_corrections_action_field
    CHECK (
      (action = 'set_dimension' AND field IN ('widthMm', 'heightMm', 'lengthMm', 'areaM2'))
      OR (action = 'set_count' AND (field IS NULL OR field = 'count'))
      OR (action = 'set_status' AND (field IS NULL OR field = 'status'))
      OR (action = 'set_label' AND (field IS NULL OR field = 'label'))
      OR (action = 'ignore_row' AND (field IS NULL OR field IN ('status', 'ignoreReason')))
      OR (action = 'keep_needs_review' AND (field IS NULL OR field IN ('status', 'reviewNote')))
      OR (action = 'add_note' AND (field IS NULL OR field = 'reviewNote'))
    )
);

COMMENT ON TABLE public.extracted_quantity_corrections IS
  'Append-only human correction events for active-run extracted quantity rows.';

CREATE INDEX IF NOT EXISTS extracted_quantity_corrections_target_idx
  ON public.extracted_quantity_corrections(job_id, run_id, extracted_quantity_id);

CREATE INDEX IF NOT EXISTS extracted_quantity_corrections_run_idx
  ON public.extracted_quantity_corrections(job_id, run_id);

CREATE INDEX IF NOT EXISTS extracted_quantity_corrections_reverted_idx
  ON public.extracted_quantity_corrections(reverted_at);

ALTER TABLE public.extracted_quantity_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read extracted quantity corrections"
  ON public.extracted_quantity_corrections;
CREATE POLICY "Read extracted quantity corrections"
  ON public.extracted_quantity_corrections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = extracted_quantity_corrections.job_id
      AND (
        j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (
          public.has_role(auth.uid(), 'viewer'::public.app_role)
          AND j.status IN ('approved'::public.job_status, 'exported'::public.job_status)
        )
      )
  ));

DROP POLICY IF EXISTS "Insert extracted quantity corrections"
  ON public.extracted_quantity_corrections;
CREATE POLICY "Insert extracted quantity corrections"
  ON public.extracted_quantity_corrections FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND public.can_write(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = extracted_quantity_corrections.job_id
        AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Delete extracted quantity corrections admin"
  ON public.extracted_quantity_corrections;
CREATE POLICY "Delete extracted quantity corrections admin"
  ON public.extracted_quantity_corrections FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));
