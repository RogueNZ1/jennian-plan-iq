-- Index to speed up Assumptions tab and writeIQDataSheetFull queries
-- that filter module_items by job_id + value_source on every page load.
CREATE INDEX IF NOT EXISTS module_items_job_value_source_idx
  ON public.module_items (job_id, value_source);
