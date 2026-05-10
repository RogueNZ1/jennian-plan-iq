-- Plan calibrations: pixel-to-mm mapping per plan page
CREATE TABLE public.plan_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  file_id uuid,
  plan_page_number integer NOT NULL DEFAULT 1,
  calibration_line_pixels numeric NOT NULL,
  calibration_real_mm numeric NOT NULL,
  pixels_per_mm numeric NOT NULL,
  scale_text text,
  calibration_source text NOT NULL DEFAULT 'user_two_point',
  confidence text NOT NULL DEFAULT 'mid',
  calibrated_by uuid NOT NULL,
  calibrated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_calibrations_job ON public.plan_calibrations(job_id);
ALTER TABLE public.plan_calibrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read plan calibrations" ON public.plan_calibrations FOR SELECT
USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = plan_calibrations.job_id AND (
  j.created_by = auth.uid() OR is_admin_or_owner(auth.uid())
  OR (has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved'::job_status,'exported'::job_status))
)));
CREATE POLICY "Insert plan calibrations (writers)" ON public.plan_calibrations FOR INSERT
WITH CHECK (auth.uid() = calibrated_by AND can_write(auth.uid()) AND EXISTS (
  SELECT 1 FROM jobs j WHERE j.id = plan_calibrations.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))
));
CREATE POLICY "Update plan calibrations (writers)" ON public.plan_calibrations FOR UPDATE
USING (can_write(auth.uid()) AND EXISTS (
  SELECT 1 FROM jobs j WHERE j.id = plan_calibrations.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))
));
CREATE POLICY "Delete plan calibrations admin" ON public.plan_calibrations FOR DELETE
USING (is_admin_or_owner(auth.uid()));

CREATE TRIGGER plan_calibrations_updated_at BEFORE UPDATE ON public.plan_calibrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Plan measurements: lines, polylines, areas, counts, walls, perimeters
CREATE TABLE public.plan_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  file_id uuid,
  plan_page_number integer NOT NULL DEFAULT 1,
  measurement_type text NOT NULL,
  label text,
  module_id text,
  points_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  calculated_length_mm numeric,
  calculated_length_m numeric,
  calculated_area_m2 numeric,
  count_value integer,
  source text NOT NULL DEFAULT 'Measured From Plan',
  confidence text NOT NULL DEFAULT 'mid',
  review_status text NOT NULL DEFAULT 'review_required',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_plan_measurements_job ON public.plan_measurements(job_id);
CREATE INDEX idx_plan_measurements_type ON public.plan_measurements(measurement_type);
ALTER TABLE public.plan_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read plan measurements" ON public.plan_measurements FOR SELECT
USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = plan_measurements.job_id AND (
  j.created_by = auth.uid() OR is_admin_or_owner(auth.uid())
  OR (has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved'::job_status,'exported'::job_status))
)));
CREATE POLICY "Insert plan measurements (writers)" ON public.plan_measurements FOR INSERT
WITH CHECK (auth.uid() = created_by AND can_write(auth.uid()) AND EXISTS (
  SELECT 1 FROM jobs j WHERE j.id = plan_measurements.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))
));
CREATE POLICY "Update plan measurements (writers)" ON public.plan_measurements FOR UPDATE
USING (can_write(auth.uid()) AND EXISTS (
  SELECT 1 FROM jobs j WHERE j.id = plan_measurements.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))
));
CREATE POLICY "Delete plan measurements admin" ON public.plan_measurements FOR DELETE
USING (is_admin_or_owner(auth.uid()));

CREATE TRIGGER plan_measurements_updated_at BEFORE UPDATE ON public.plan_measurements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Opening schedule: windows / doors / openings
CREATE TABLE public.opening_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  plan_page_number integer NOT NULL DEFAULT 1,
  opening_type text NOT NULL DEFAULT 'unknown_opening',
  width_mm numeric NOT NULL,
  height_mm numeric,
  room_name text,
  quantity integer NOT NULL DEFAULT 1,
  source text NOT NULL DEFAULT 'Uploaded Plan Text',
  source_evidence text,
  confidence text NOT NULL DEFAULT 'mid',
  review_status text NOT NULL DEFAULT 'review_required',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_opening_schedule_job ON public.opening_schedule(job_id);
ALTER TABLE public.opening_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read opening schedule" ON public.opening_schedule FOR SELECT
USING (EXISTS (SELECT 1 FROM jobs j WHERE j.id = opening_schedule.job_id AND (
  j.created_by = auth.uid() OR is_admin_or_owner(auth.uid())
  OR (has_role(auth.uid(),'viewer'::app_role) AND j.status IN ('approved'::job_status,'exported'::job_status))
)));
CREATE POLICY "Insert opening schedule (writers)" ON public.opening_schedule FOR INSERT
WITH CHECK (auth.uid() = created_by AND can_write(auth.uid()) AND EXISTS (
  SELECT 1 FROM jobs j WHERE j.id = opening_schedule.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))
));
CREATE POLICY "Update opening schedule (writers)" ON public.opening_schedule FOR UPDATE
USING (can_write(auth.uid()) AND EXISTS (
  SELECT 1 FROM jobs j WHERE j.id = opening_schedule.job_id AND (j.created_by = auth.uid() OR is_admin_or_owner(auth.uid()))
));
CREATE POLICY "Delete opening schedule admin" ON public.opening_schedule FOR DELETE
USING (is_admin_or_owner(auth.uid()));

CREATE TRIGGER opening_schedule_updated_at BEFORE UPDATE ON public.opening_schedule
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();