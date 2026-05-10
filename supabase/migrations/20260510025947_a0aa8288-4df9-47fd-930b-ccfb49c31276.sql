
-- Module persistence: runs, items, audit logs
-- Mirrors RLS pattern from extracted_quantities.

CREATE TABLE public.module_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  module_name text NOT NULL,
  status text NOT NULL DEFAULT 'not_started',
  review_status text NOT NULL DEFAULT 'review_required',
  required boolean NOT NULL DEFAULT true,
  confidence_avg numeric,
  item_count integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, module_id)
);

CREATE TABLE public.module_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.module_runs(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  module_id text NOT NULL,
  label text NOT NULL,
  description text,
  unit text,
  extracted_value text,
  approved_value text,
  confidence text,
  review_status text NOT NULL DEFAULT 'review_required',
  notes text,
  basis text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.module_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.module_runs(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.module_items(id) ON DELETE SET NULL,
  module_id text,
  user_id uuid,
  action text NOT NULL,
  previous_value text,
  new_value text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE INDEX module_runs_job_idx ON public.module_runs(job_id);
CREATE INDEX module_items_run_idx ON public.module_items(run_id);
CREATE INDEX module_items_job_module_idx ON public.module_items(job_id, module_id);
CREATE INDEX module_audit_job_idx ON public.module_audit_logs(job_id, created_at DESC);

-- updated_at triggers
CREATE TRIGGER module_runs_set_updated_at
  BEFORE UPDATE ON public.module_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER module_items_set_updated_at
  BEFORE UPDATE ON public.module_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.module_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_audit_logs ENABLE ROW LEVEL SECURITY;

-- module_runs policies
CREATE POLICY "Read module runs"
  ON public.module_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_runs.job_id
      AND (j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (public.has_role(auth.uid(), 'viewer'::app_role)
            AND j.status IN ('approved','exported')))
  ));

CREATE POLICY "Insert module runs (writers)"
  ON public.module_runs FOR INSERT
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_runs.job_id
      AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));

CREATE POLICY "Update module runs (writers)"
  ON public.module_runs FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_runs.job_id
      AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));

CREATE POLICY "Delete module runs admin"
  ON public.module_runs FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- module_items policies
CREATE POLICY "Read module items"
  ON public.module_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_items.job_id
      AND (j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (public.has_role(auth.uid(), 'viewer'::app_role)
            AND j.status IN ('approved','exported')))
  ));

CREATE POLICY "Insert module items (writers)"
  ON public.module_items FOR INSERT
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_items.job_id
      AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));

CREATE POLICY "Update module items (writers)"
  ON public.module_items FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_items.job_id
      AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));

CREATE POLICY "Delete module items admin"
  ON public.module_items FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- module_audit_logs policies (append-only, read by job participants)
CREATE POLICY "Read module audit"
  ON public.module_audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_audit_logs.job_id
      AND (j.created_by = auth.uid()
        OR public.is_admin_or_owner(auth.uid())
        OR (public.has_role(auth.uid(), 'viewer'::app_role)
            AND j.status IN ('approved','exported')))
  ));

CREATE POLICY "Insert module audit (writers)"
  ON public.module_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()) AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = module_audit_logs.job_id
      AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))
  ));

-- Extend export_logs with module_id (nullable; null = IQ Core/legacy)
ALTER TABLE public.export_logs ADD COLUMN module_id text;
ALTER TABLE public.export_logs ADD COLUMN module_name text;
