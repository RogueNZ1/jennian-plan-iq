-- job_documents: track multiple PDFs per job with their classified sheet type
create table job_documents (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  sheet_type text not null default 'unknown',
  page_count integer,
  classified_at timestamptz,
  created_at timestamptz default now()
);

alter table job_documents enable row level security;

create policy "Users can manage their own job documents"
  on job_documents for all
  using (job_id in (select id from jobs where created_by = auth.uid()));

-- Elevation and site-plan extraction results stored on the job row
alter table jobs add column if not exists elevation_data jsonb;
alter table jobs add column if not exists site_plan_data jsonb;
alter table jobs add column if not exists cross_reference_data jsonb;
