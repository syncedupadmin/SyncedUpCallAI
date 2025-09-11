-- v1.1: Insights & Ops - Rollups and Heartbeat tables
-- Idempotent migration for revenue rollups and cron monitoring

-- Revenue rollups table for dashboard metrics
create table if not exists revenue_rollups (
  date date primary key,
  total_calls int not null default 0,
  analyzed_calls int not null default 0,
  success_calls int not null default 0,
  revenue_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Cron heartbeat table for monitoring
create table if not exists cron_heartbeats (
  name text primary key,
  last_ok timestamptz not null default now(),
  last_message text
);

-- Performance index for date-based queries
create index if not exists idx_revenue_rollups_date on revenue_rollups(date desc);

-- Insert default heartbeats for existing cron jobs
insert into cron_heartbeats (name, last_ok, last_message) 
values 
  ('rollups', now(), 'Initial setup'),
  ('retention', now(), 'Initial setup')
on conflict (name) do nothing;