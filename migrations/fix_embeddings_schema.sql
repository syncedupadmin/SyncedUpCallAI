-- A. embeddings_meta: add missing columns and constraints (idempotent)
create table if not exists embeddings_meta (
  call_id uuid,
  model   text not null,
  sha256  text,
  created_at timestamptz not null default now()
);

alter table embeddings_meta
  add column if not exists call_id uuid,
  add column if not exists sha256 text,
  add column if not exists model text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='embeddings_meta_call_id_fkey') then
    alter table embeddings_meta
      add constraint embeddings_meta_call_id_fkey
      foreign key (call_id) references calls(id) on delete cascade;
  end if;
end $$;

-- Unique "cache key" for a given call + text hash
create unique index if not exists uq_embeddings_meta_call_hash
  on embeddings_meta(call_id, sha256);

create index if not exists idx_embeddings_meta_call
  on embeddings_meta(call_id);

-- B. Ensure pgvector + transcript_embeddings (idempotent)
create extension if not exists vector;

create table if not exists transcript_embeddings (
  call_id   uuid primary key references calls(id) on delete cascade,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

-- Optional vector index for cosine search (requires pgvector)
do $$ begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname  = 'idx_transcript_embeddings_vector'
  ) then
    execute 'create index idx_transcript_embeddings_vector
             on transcript_embeddings using ivfflat (embedding vector_cosine_ops)';
  end if;
end $$;

-- C. Helpful counts to confirm state
select
  (select count(*) from transcripts)            as transcripts,
  (select count(*) from embeddings_meta)        as embeddings_meta,
  (select count(*) from transcript_embeddings)  as transcript_embeddings,
  (select count(*) from analyses)               as analyses;