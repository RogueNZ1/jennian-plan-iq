
ALTER TABLE public.extracted_quantities
  ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'Demo Value',
  ADD COLUMN IF NOT EXISTS source_evidence text,
  ADD COLUMN IF NOT EXISTS plan_page_number integer,
  ADD COLUMN IF NOT EXISTS confidence_label text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'review_required';

UPDATE public.extracted_quantities
  SET data_source = 'Demo Value'
  WHERE data_source IS NULL OR data_source = '';

ALTER TABLE public.plan_measurements
  ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.plan_calibrations
  ADD COLUMN IF NOT EXISTS calibration_method text NOT NULL DEFAULT 'manual';
