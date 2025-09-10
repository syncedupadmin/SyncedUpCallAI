-- Add retention and PII masking fields

-- Add retention fields to calls table
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS anonymized boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anonymized_at timestamp,
  ADD COLUMN IF NOT EXISTS audio_url_cleared boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS audio_url_cleared_at timestamp;

-- Add PII masking fields to transcripts table
ALTER TABLE transcripts
  ADD COLUMN IF NOT EXISTS pii_masked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pii_masked_at timestamp,
  ADD COLUMN IF NOT EXISTS original_text_hash text; -- Store hash of original for verification

-- Create indexes for retention queries
CREATE INDEX IF NOT EXISTS idx_calls_retention ON calls(started_at, anonymized, audio_url_cleared);
CREATE INDEX IF NOT EXISTS idx_transcripts_pii ON transcripts(pii_masked, call_id);

-- Retention policy table
CREATE TABLE IF NOT EXISTS retention_policies (
  id SERIAL PRIMARY KEY,
  name text NOT NULL,
  transcript_days int DEFAULT 90,
  analysis_days int DEFAULT 180,
  event_days int DEFAULT 30,
  audio_url_days int DEFAULT 7,
  pii_masking_enabled boolean DEFAULT true,
  pii_masking_after_days int DEFAULT 30,
  active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Insert default policy
INSERT INTO retention_policies (
  name,
  transcript_days,
  analysis_days,
  event_days,
  audio_url_days,
  pii_masking_enabled,
  pii_masking_after_days
) VALUES (
  'Default Policy',
  90,
  180,
  30,
  7,
  true,
  30
) ON CONFLICT DO NOTHING;

-- Retention runs log
CREATE TABLE IF NOT EXISTS retention_runs (
  id SERIAL PRIMARY KEY,
  policy_id int REFERENCES retention_policies(id),
  started_at timestamp DEFAULT now(),
  completed_at timestamp,
  transcripts_masked int DEFAULT 0,
  transcripts_deleted int DEFAULT 0,
  analyses_deleted int DEFAULT 0,
  events_deleted int DEFAULT 0,
  audio_urls_cleared int DEFAULT 0,
  error text,
  status text DEFAULT 'running' -- 'running', 'completed', 'failed'
);

-- Create index for retention runs
CREATE INDEX IF NOT EXISTS idx_retention_runs_status ON retention_runs(status, started_at DESC);