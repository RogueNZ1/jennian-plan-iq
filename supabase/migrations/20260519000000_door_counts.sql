-- Replace door_markups (dot-placement canvas) with door_counts (counter panel).
-- One row per job, stores confirmed breakdown + the AI-estimated total.

drop table if exists door_markups cascade;

create table if not exists door_counts (
  id                  uuid        primary key default gen_random_uuid(),
  job_id              uuid        not null unique references jobs(id) on delete cascade,
  standard            integer     not null default 0,
  cavity_sliders      integer     not null default 0,
  double_doors        integer     not null default 0,
  barn_sliders        integer     not null default 0,
  ai_total_estimate   integer,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index door_counts_job_id_idx on door_counts(job_id);

alter table door_counts enable row level security;

create policy "Authenticated users can manage door counts"
  on door_counts for all
  to authenticated
  using (true)
  with check (true);
