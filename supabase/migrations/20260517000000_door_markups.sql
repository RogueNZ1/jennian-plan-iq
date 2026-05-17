create table if not exists door_markups (
  id           uuid        primary key default gen_random_uuid(),
  job_id       uuid        not null references jobs(id) on delete cascade,
  door_type    text        not null,
  x_percent    numeric(7,5) not null,
  y_percent    numeric(7,5) not null,
  label_number integer     not null default 1,
  created_at   timestamptz not null default now(),
  constraint door_type_check check (
    door_type in ('hinged', 'double_cavity', 'cavity_slider', 'wardrobe')
  )
);

create index door_markups_job_id_idx on door_markups(job_id);

alter table door_markups enable row level security;

create policy "Authenticated users can manage door markups"
  on door_markups for all
  to authenticated
  using (true)
  with check (true);
