-- Optional indexes to improve performance
-- These are safe to run multiple times

-- Index for customer journey queries by phone
create index if not exists idx_contacts_phone on contacts(primary_phone);

-- Index for faster analysis lookups
create index if not exists idx_analyses_call on analyses(call_id);

-- Index for transcript lookups
create index if not exists idx_transcripts_call on transcripts(call_id);

-- Index for call events by type
create index if not exists idx_events_type on call_events(type, at desc);