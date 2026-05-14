ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS plan_type text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric;

ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS value_source text;