-- Run this in Supabase SQL Editor to create the last missing table:
-- https://supabase.com/dashboard/project/ukegudqobnmiesudtjen/sql

create table if not exists daily_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null unique,
  html_content text,
  text_content text,
  summary text,
  alert_count integer not null default 0,
  new_listing_count integer not null default 0,
  price_change_count integer not null default 0,
  generated_at timestamptz not null default now()
);
