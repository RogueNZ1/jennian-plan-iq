-- ============================================================================
-- Catch-up: missing takeoff schema for ukegudqobnmiesudtjen
-- Faithful to source migrations; fully idempotent; single transaction.
-- Creates the 9 takeoff tables + folded cols + takeoff_runs.takeoff_json, plus
-- guarded belt-and-braces ADD COLUMNs on live export_logs / jobs / extracted_quantities.
-- ============================================================================
BEGIN;

-- ───────────────────────── module_runs ─────────────────────────
CREATE TABLE IF NOT EXISTS public.module_runs (
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
CREATE INDEX IF NOT EXISTS module_runs_job_idx ON public.module_runs(job_id);
ALTER TABLE public.module_runs ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS module_runs_set_updated_at ON public.module_runs;
CREATE TRIGGER module_runs_set_updated_at BEFORE UPDATE ON public.module_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP POLICY IF EXISTS "Read module runs" ON public.module_runs;
CREATE POLICY "Read module runs" ON public.module_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = module_runs.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid())
      OR (public.has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved','exported')))));
DROP POLICY IF EXISTS "Insert module runs (writers)" ON public.module_runs;
CREATE POLICY "Insert module runs (writers)" ON public.module_runs FOR INSERT
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = module_runs.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Update module runs (writers)" ON public.module_runs;
CREATE POLICY "Update module runs (writers)" ON public.module_runs FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = module_runs.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Delete module runs admin" ON public.module_runs;
CREATE POLICY "Delete module runs admin" ON public.module_runs FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- ───────────────────────── module_items (base + folded cols) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.module_items (
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
  data_source text,
  source_evidence text,
  measurement_id uuid,
  opening_id uuid,
  plan_page_number integer,
  file_id uuid,
  source text CHECK (source IN ('calibrated_geometry','ai_annotation','ai_inferred','manual_override')),
  value_source text NOT NULL DEFAULT 'extracted'
    CHECK (value_source IN ('extracted','assumed','confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS data_source text,
  ADD COLUMN IF NOT EXISTS source_evidence text,
  ADD COLUMN IF NOT EXISTS measurement_id uuid,
  ADD COLUMN IF NOT EXISTS opening_id uuid,
  ADD COLUMN IF NOT EXISTS plan_page_number integer,
  ADD COLUMN IF NOT EXISTS file_id uuid,
  ADD COLUMN IF NOT EXISTS source text
    CHECK (source IN ('calibrated_geometry','ai_annotation','ai_inferred','manual_override')),
  ADD COLUMN IF NOT EXISTS value_source text NOT NULL DEFAULT 'extracted'
    CHECK (value_source IN ('extracted','assumed','confirmed'));
CREATE INDEX IF NOT EXISTS module_items_run_idx ON public.module_items(run_id);
CREATE INDEX IF NOT EXISTS module_items_job_module_idx ON public.module_items(job_id, module_id);
CREATE INDEX IF NOT EXISTS module_items_job_value_source_idx ON public.module_items(job_id, value_source);
ALTER TABLE public.module_items ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS module_items_set_updated_at ON public.module_items;
CREATE TRIGGER module_items_set_updated_at BEFORE UPDATE ON public.module_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP POLICY IF EXISTS "Read module items" ON public.module_items;
CREATE POLICY "Read module items" ON public.module_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = module_items.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid())
      OR (public.has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved','exported')))));
DROP POLICY IF EXISTS "Insert module items (writers)" ON public.module_items;
CREATE POLICY "Insert module items (writers)" ON public.module_items FOR INSERT
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = module_items.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Update module items (writers)" ON public.module_items;
CREATE POLICY "Update module items (writers)" ON public.module_items FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = module_items.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Delete module items admin" ON public.module_items;
CREATE POLICY "Delete module items admin" ON public.module_items FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- ───────────────────────── module_audit_logs ─────────────────────────
CREATE TABLE IF NOT EXISTS public.module_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.module_runs(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.module_items(id) ON DELETE SET NULL,
  module_id text, user_id uuid, action text NOT NULL,
  previous_value text, new_value text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS module_audit_job_idx ON public.module_audit_logs(job_id, created_at DESC);
ALTER TABLE public.module_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read module audit" ON public.module_audit_logs;
CREATE POLICY "Read module audit" ON public.module_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = module_audit_logs.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid())
      OR (public.has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved','exported')))));
DROP POLICY IF EXISTS "Insert module audit (writers)" ON public.module_audit_logs;
CREATE POLICY "Insert module audit (writers)" ON public.module_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = module_audit_logs.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));

-- ───────────────────────── plan_calibrations (base + calibration_method) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL, file_id uuid,
  plan_page_number integer NOT NULL DEFAULT 1,
  calibration_line_pixels numeric NOT NULL,
  calibration_real_mm numeric NOT NULL,
  pixels_per_mm numeric NOT NULL,
  scale_text text,
  calibration_source text NOT NULL DEFAULT 'user_two_point',
  calibration_method text NOT NULL DEFAULT 'manual',
  confidence text NOT NULL DEFAULT 'mid',
  calibrated_by uuid NOT NULL,
  calibrated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_calibrations ADD COLUMN IF NOT EXISTS calibration_method text NOT NULL DEFAULT 'manual';
CREATE INDEX IF NOT EXISTS idx_plan_calibrations_job ON public.plan_calibrations(job_id);
ALTER TABLE public.plan_calibrations ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS plan_calibrations_updated_at ON public.plan_calibrations;
CREATE TRIGGER plan_calibrations_updated_at BEFORE UPDATE ON public.plan_calibrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP POLICY IF EXISTS "Read plan calibrations" ON public.plan_calibrations;
CREATE POLICY "Read plan calibrations" ON public.plan_calibrations FOR SELECT
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = plan_calibrations.job_id
    AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid())
      OR (has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved'::job_status,'exported'::job_status)))));
DROP POLICY IF EXISTS "Insert plan calibrations (writers)" ON public.plan_calibrations;
CREATE POLICY "Insert plan calibrations (writers)" ON public.plan_calibrations FOR INSERT
  WITH CHECK (auth.uid() = calibrated_by AND can_write(auth.uid()) AND EXISTS (SELECT 1 FROM jobs j
    WHERE j.id = plan_calibrations.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Update plan calibrations (writers)" ON public.plan_calibrations;
CREATE POLICY "Update plan calibrations (writers)" ON public.plan_calibrations FOR UPDATE
  USING (can_write(auth.uid()) AND EXISTS (SELECT 1 FROM jobs j
    WHERE j.id = plan_calibrations.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Delete plan calibrations admin" ON public.plan_calibrations;
CREATE POLICY "Delete plan calibrations admin" ON public.plan_calibrations FOR DELETE
  USING (is_admin_or_owner(auth.uid()));

-- ───────────────────────── plan_measurements (base + category) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL, file_id uuid,
  plan_page_number integer NOT NULL DEFAULT 1,
  measurement_type text NOT NULL, label text, module_id text, category text,
  points_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_length_mm numeric, calculated_length_m numeric, calculated_area_m2 numeric,
  count_value integer,
  source text NOT NULL DEFAULT 'Measured From Plan',
  confidence text NOT NULL DEFAULT 'mid',
  review_status text NOT NULL DEFAULT 'review_required',
  notes text, created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_measurements ADD COLUMN IF NOT EXISTS category text;
CREATE INDEX IF NOT EXISTS idx_plan_measurements_job ON public.plan_measurements(job_id);
CREATE INDEX IF NOT EXISTS idx_plan_measurements_type ON public.plan_measurements(measurement_type);
ALTER TABLE public.plan_measurements ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS plan_measurements_updated_at ON public.plan_measurements;
CREATE TRIGGER plan_measurements_updated_at BEFORE UPDATE ON public.plan_measurements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP POLICY IF EXISTS "Read plan measurements" ON public.plan_measurements;
CREATE POLICY "Read plan measurements" ON public.plan_measurements FOR SELECT
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = plan_measurements.job_id
    AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid())
      OR (has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved'::job_status,'exported'::job_status)))));
DROP POLICY IF EXISTS "Insert plan measurements (writers)" ON public.plan_measurements;
CREATE POLICY "Insert plan measurements (writers)" ON public.plan_measurements FOR INSERT
  WITH CHECK (auth.uid() = created_by AND can_write(auth.uid()) AND EXISTS (SELECT 1 FROM jobs j
    WHERE j.id = plan_measurements.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Update plan measurements (writers)" ON public.plan_measurements;
CREATE POLICY "Update plan measurements (writers)" ON public.plan_measurements FOR UPDATE
  USING (can_write(auth.uid()) AND EXISTS (SELECT 1 FROM jobs j
    WHERE j.id = plan_measurements.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Delete plan measurements admin" ON public.plan_measurements;
CREATE POLICY "Delete plan measurements admin" ON public.plan_measurements FOR DELETE
  USING (is_admin_or_owner(auth.uid()));

-- ───────────────────────── opening_schedule (base + file_id) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.opening_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL, file_id uuid,
  plan_page_number integer NOT NULL DEFAULT 1,
  opening_type text NOT NULL DEFAULT 'unknown_opening',
  width_mm numeric NOT NULL, height_mm numeric, room_name text,
  quantity integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'Uploaded Plan Text',
  source_evidence text,
  confidence text NOT NULL DEFAULT 'mid',
  review_status text NOT NULL DEFAULT 'review_required',
  notes text, created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.opening_schedule ADD COLUMN IF NOT EXISTS file_id uuid;
CREATE INDEX IF NOT EXISTS idx_opening_schedule_job ON public.opening_schedule(job_id);
ALTER TABLE public.opening_schedule ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS opening_schedule_updated_at ON public.opening_schedule;
CREATE TRIGGER opening_schedule_updated_at BEFORE UPDATE ON public.opening_schedule
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP POLICY IF EXISTS "Read opening schedule" ON public.opening_schedule;
CREATE POLICY "Read opening schedule" ON public.opening_schedule FOR SELECT
  USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = opening_schedule.job_id
    AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid())
      OR (has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved'::job_status,'exported'::job_status)))));
DROP POLICY IF EXISTS "Insert opening schedule (writers)" ON public.opening_schedule;
CREATE POLICY "Insert opening schedule (writers)" ON public.opening_schedule FOR INSERT
  WITH CHECK (auth.uid() = created_by AND can_write(auth.uid()) AND EXISTS (SELECT 1 FROM jobs j
    WHERE j.id = opening_schedule.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Update opening schedule (writers)" ON public.opening_schedule;
CREATE POLICY "Update opening schedule (writers)" ON public.opening_schedule FOR UPDATE
  USING (can_write(auth.uid()) AND EXISTS (SELECT 1 FROM jobs j
    WHERE j.id = opening_schedule.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Delete opening schedule admin" ON public.opening_schedule;
CREATE POLICY "Delete opening schedule admin" ON public.opening_schedule FOR DELETE
  USING (is_admin_or_owner(auth.uid()));

-- ───────────────────────── plan_measurement_audit_logs ─────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_measurement_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL, measurement_id uuid, opening_id uuid, calibration_id uuid,
  user_id uuid, action text NOT NULL, previous_value text, new_value text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_measurement_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pmal_job  ON public.plan_measurement_audit_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_pmal_meas ON public.plan_measurement_audit_logs(measurement_id);
DROP POLICY IF EXISTS "Read plan measurement audit" ON public.plan_measurement_audit_logs;
CREATE POLICY "Read plan measurement audit" ON public.plan_measurement_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = plan_measurement_audit_logs.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid())
      OR (public.has_role(auth.uid(),'viewer'::public.app_role)
          AND j.status IN ('approved'::public.job_status,'exported'::public.job_status)))));
DROP POLICY IF EXISTS "Insert plan measurement audit" ON public.plan_measurement_audit_logs;
CREATE POLICY "Insert plan measurement audit" ON public.plan_measurement_audit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = plan_measurement_audit_logs.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));

-- ───────────────────────── vision_takeoff_pages ─────────────────────────
CREATE TABLE IF NOT EXISTS public.vision_takeoff_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.uploaded_files(id) ON DELETE CASCADE,
  page_number integer NOT NULL, page_type text,
  render_resolution integer NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'plan_pdfs',
  storage_path text NOT NULL, created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, file_id, page_number)
);
CREATE INDEX IF NOT EXISTS idx_vision_takeoff_pages_job ON public.vision_takeoff_pages(job_id);
ALTER TABLE public.vision_takeoff_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read vision pages" ON public.vision_takeoff_pages;
CREATE POLICY "Read vision pages" ON public.vision_takeoff_pages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = vision_takeoff_pages.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid())
      OR (public.has_role(auth.uid(),'viewer'::app_role)
          AND j.status = ANY (ARRAY['approved'::job_status,'exported'::job_status])))));
DROP POLICY IF EXISTS "Insert vision pages (writers)" ON public.vision_takeoff_pages;
CREATE POLICY "Insert vision pages (writers)" ON public.vision_takeoff_pages FOR INSERT
  WITH CHECK (auth.uid() = created_by AND public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = vision_takeoff_pages.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Update vision pages (writers)" ON public.vision_takeoff_pages;
CREATE POLICY "Update vision pages (writers)" ON public.vision_takeoff_pages FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = vision_takeoff_pages.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Delete vision pages admin" ON public.vision_takeoff_pages;
CREATE POLICY "Delete vision pages admin" ON public.vision_takeoff_pages FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- ───────────────────────── takeoff_runs (base) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.takeoff_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL, started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  working_file_id uuid, working_page_number integer, working_page_type text,
  classification_confidence text, classification_reason text,
  scale_text text, calibration_id uuid,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS takeoff_runs_job_id_idx ON public.takeoff_runs(job_id);
CREATE INDEX IF NOT EXISTS takeoff_runs_started_at_idx ON public.takeoff_runs(started_at DESC);
ALTER TABLE public.takeoff_runs ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS takeoff_runs_updated_at ON public.takeoff_runs;
CREATE TRIGGER takeoff_runs_updated_at BEFORE UPDATE ON public.takeoff_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP POLICY IF EXISTS "Read takeoff runs" ON public.takeoff_runs;
CREATE POLICY "Read takeoff runs" ON public.takeoff_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = takeoff_runs.job_id
    AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid())
      OR (public.has_role(auth.uid(),'viewer'::app_role)
          AND j.status = ANY (ARRAY['approved'::job_status,'exported'::job_status])))));
DROP POLICY IF EXISTS "Insert takeoff runs (writers)" ON public.takeoff_runs;
CREATE POLICY "Insert takeoff runs (writers)" ON public.takeoff_runs FOR INSERT
  WITH CHECK (auth.uid() = started_by AND public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = takeoff_runs.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Update takeoff runs (writers)" ON public.takeoff_runs;
CREATE POLICY "Update takeoff runs (writers)" ON public.takeoff_runs FOR UPDATE
  USING (public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.jobs j
    WHERE j.id = takeoff_runs.job_id AND (j.created_by = auth.uid() OR public.is_admin_or_owner(auth.uid()))));
DROP POLICY IF EXISTS "Delete takeoff runs admin" ON public.takeoff_runs;
CREATE POLICY "Delete takeoff runs admin" ON public.takeoff_runs FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

-- ───────────────────────── Slice 4 column (LAST among takeoff DDL) ─────────────────────────
ALTER TABLE public.takeoff_runs ADD COLUMN IF NOT EXISTS takeoff_json jsonb;
COMMENT ON COLUMN public.takeoff_runs.takeoff_json IS
  'Convergence: canonical enriched TakeoffData (per-field value/source/confidence/discrepancy_flags + global notes). Nullable; written by run.ts, read by buildQSExportData. NULL for pre-convergence rows.';

-- ============================================================================
-- LIVE-TABLE belt-and-braces guards (all IF NOT EXISTS; no-op if already present).
-- ============================================================================

-- export_logs <- ...025947
ALTER TABLE public.export_logs ADD COLUMN IF NOT EXISTS module_id text;
ALTER TABLE public.export_logs ADD COLUMN IF NOT EXISTS module_name text;

-- jobs <- ...044118 (working-plan selection; run.ts writes these two together)
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS working_plan_page_number integer;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS working_plan_file_id uuid;

-- extracted_quantities <- ...040757 (5 source-tracking cols; verbatim defaults)
ALTER TABLE public.extracted_quantities
  ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'Demo Value',
  ADD COLUMN IF NOT EXISTS source_evidence text,
  ADD COLUMN IF NOT EXISTS plan_page_number integer,
  ADD COLUMN IF NOT EXISTS confidence_label text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'review_required';

COMMIT;
