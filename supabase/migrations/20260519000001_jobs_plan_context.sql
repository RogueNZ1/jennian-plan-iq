-- Store the detected PlanContext (builder, dimension format, scale, stud height)
-- against a job so it can be surfaced in the UI and used by downstream pipelines.
alter table jobs add column if not exists plan_context jsonb;
