import { Client } from "pg";
const req = ["DATABASE_URL","JOBS_SECRET"];
const missing = req.filter(k => !process.env[k]);
if(missing.length){ console.error("Missing env:", missing.join(", ")); process.exit(1); }

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Ensure required tables/columns exist
const ddl = `
  create extension if not exists pgcrypto;
  create table if not exists calls (
    id uuid primary key default gen_random_uuid(),
    recording_url text,
    duration_sec integer,
    office_id integer,
    agent_name text,
    source text,
    is_test boolean default false,
    created_at timestamptz default now()
  );
  create table if not exists transcripts (
    id uuid primary key default gen_random_uuid(),
    call_id uuid references calls(id) on delete cascade,
    provider text,
    language text,
    transcript text,
    words jsonb,
    created_at timestamptz default now()
  );
  create table if not exists ai_test_cases (
    id uuid primary key default gen_random_uuid(),
    suite_id uuid not null,
    audio_url text not null,
    audio_duration_sec integer,
    expected_transcript text
  );
  create table if not exists ai_suite_runs (
    id uuid primary key default gen_random_uuid(),
    suite_id uuid not null,
    status text not null,
    started_at timestamptz,
    completed_at timestamptz
  );
  create table if not exists ai_test_runs (
    id uuid primary key default gen_random_uuid(),
    test_case_id uuid references ai_test_cases(id) on delete cascade,
    suite_run_id uuid references ai_suite_runs(id) on delete cascade,
    call_id uuid,
    status text,
    actual_transcript text,
    transcript_wer numeric,
    error_message text,
    created_at timestamptz default now()
  );
  alter table calls add column if not exists office_id integer;
  alter table calls add column if not exists agent_name text;
  alter table calls add column if not exists source text;
  alter table calls add column if not exists is_test boolean default false;
`;
await client.query(ddl);
console.log("ENV OK and schema ensured.");
await client.end();