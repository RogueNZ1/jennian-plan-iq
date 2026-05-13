-- Concept Mode + SMW Optional
-- Adds plan_type, smw_enabled, confidence_score to jobs.
-- Adds value_source to module_items.

-- ── jobs ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS plan_type text NOT NULL DEFAULT 'concept'
    CHECK (plan_type IN ('concept', 'detailed'));

COMMENT ON COLUMN public.jobs.plan_type IS
  'concept = early-stage drawing with limited detail; detailed = full working drawing set';

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS smw_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.jobs.smw_enabled IS
  'Whether the SMW (Selections / Materials / Works) document export is active for this job';

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS confidence_score integer
    CHECK (confidence_score >= 0 AND confidence_score <= 100);

COMMENT ON COLUMN public.jobs.confidence_score IS
  'Overall data confidence 0-100: ratio of extracted to (extracted + assumed) values';

-- ── module_items ──────────────────────────────────────────────────────────────

ALTER TABLE public.module_items
  ADD COLUMN IF NOT EXISTS value_source text NOT NULL DEFAULT 'extracted'
    CHECK (value_source IN ('extracted', 'assumed', 'confirmed'));

COMMENT ON COLUMN public.module_items.value_source IS
  'extracted = came from plan/spec text; assumed = Jennian standard allowance; confirmed = user reviewed and accepted';
