create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists vector;

-- contacts
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  primary_phone text unique,
  alt_phones text[] default '{}',
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- agents
create table if not exists agents (
  id uuid primary key default uuid_generate_v4(),
  ext_ref text unique,
  name text,
  team text,
  active boolean default true
);

-- calls
create table if not exists calls (
  id uuid primary key default uuid_generate_v4(),
  idem_key text unique,
  source text not null,
  source_ref text,
  contact_id uuid references contacts(id),
  agent_id uuid references agents(id),
  campaign text,
  direction text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec int,
  recording_url text,
  disposition text,
  sale_time timestamptz
);
create index if not exists idx_calls_started on calls (started_at desc);
create index if not exists idx_calls_contact on calls (contact_id, started_at desc);

-- transcripts
create table if not exists transcripts (
  call_id uuid primary key references calls(id) on delete cascade,
  engine text,
  text text,
  redacted text,
  diarized jsonb,
  words jsonb
);

-- analyses
create table if not exists analyses (
  call_id uuid primary key references calls(id) on delete cascade,
  reason_primary text,
  reason_secondary text,
  confidence float,
  qa_score int,
  script_adherence int,
  sentiment_agent float,
  sentiment_customer float,
  risk_flags text[],
  actions text[],
  key_quotes jsonb,
  summary text,
  prompt_ver int default 1,
  model text,
  token_input int,
  token_output int
);
create index if not exists idx_analyses_reason on analyses(reason_primary);

-- events
create table if not exists call_events (
  id bigserial primary key,
  call_id uuid references calls(id),
  type text,
  payload jsonb,
  at timestamptz default now()
);
create index if not exists idx_events_call on call_events(call_id, at desc);

-- embeddings for semantic search
create table if not exists transcript_embeddings (
  call_id uuid primary key references calls(id) on delete cascade,
  embedding vector(1536)
);
create index if not exists idx_te_embedding on transcript_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- stub policy table for revenue-weighted report
create table if not exists policies_stub (
  contact_id uuid references contacts(id),
  premium numeric,
  status text,
  updated_at timestamptz default now()
);

-- materialized view for last 30 days value (uses stub)
create materialized view if not exists mv_cancel_value_30d as
select a.reason_primary,
       count(*) as calls,
       sum(coalesce(p.premium, 0)) as lost_value
from analyses a
join calls c on c.id=a.call_id
left join policies_stub p on p.contact_id=c.contact_id and p.status in ('cancelled','refunded','chargeback')
where c.started_at > now() - interval '30 days'
group by 1
order by lost_value desc;
