-- Add language and translated text columns to transcripts
alter table transcripts add column if not exists lang text;
alter table transcripts add column if not exists translated_text text;
alter table transcripts add column if not exists created_at timestamptz default now();

-- Add embeddings created timestamp
alter table transcript_embeddings add column if not exists created_at timestamptz default now();

-- Performance index for phone+time queries (customer journey)
create index if not exists idx_calls_phone_started on calls(customer_phone, started_at desc) where customer_phone is not null;

-- Index for backfill queries
create index if not exists idx_calls_recording on calls(recording_url, started_at desc) where recording_url is not null and duration_sec >= 10;