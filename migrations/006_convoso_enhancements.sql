-- Migration 006: Convoso API Integration Enhancements
-- Adds columns and indexes for direct Convoso API ingestion
-- Maintains backward compatibility with existing webhook flow

-- Add Convoso-specific columns to existing calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_name text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_email text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS lead_id text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS talk_time_sec int;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS wrap_time_sec int;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS queue text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE calls ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE calls ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add indexes for efficient agent grouping and filtering
CREATE INDEX IF NOT EXISTS idx_calls_agent_name ON calls(agent_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_source_agent ON calls(source, agent_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_disposition ON calls(disposition) WHERE disposition IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_tags ON calls USING gin(tags) WHERE tags IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_updated ON calls(updated_at DESC);

-- Create a helper function to normalize phone numbers (digits only)
CREATE OR REPLACE FUNCTION normalize_phone(phone text)
RETURNS text AS $$
BEGIN
  -- Remove all non-digit characters
  RETURN regexp_replace(phone, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create index on normalized phone for faster lookups
CREATE INDEX IF NOT EXISTS idx_calls_phone_normalized
ON calls(normalize_phone(agent_name))
WHERE agent_name ~ '[0-9]';

-- Add trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_calls_updated_at ON calls;
CREATE TRIGGER update_calls_updated_at
  BEFORE UPDATE ON calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create a view for agent call statistics
CREATE OR REPLACE VIEW v_agent_call_stats AS
SELECT
  agent_name,
  agent_id,
  COUNT(*) as total_calls,
  COUNT(*) FILTER (WHERE disposition = 'SALE') as sales,
  COUNT(*) FILTER (WHERE disposition IN ('No Answer', 'Busy', 'Failed')) as failed_calls,
  AVG(duration_sec) FILTER (WHERE duration_sec > 0) as avg_duration,
  SUM(duration_sec) as total_duration,
  SUM(talk_time_sec) as total_talk_time,
  MAX(started_at) as last_call,
  MIN(started_at) as first_call
FROM calls
WHERE source = 'convoso'
  AND agent_name IS NOT NULL
GROUP BY agent_name, agent_id;

-- Create materialized view for agent daily performance
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_agent_daily_performance AS
SELECT
  DATE(started_at) as call_date,
  agent_name,
  agent_id,
  COUNT(*) as calls,
  COUNT(DISTINCT lead_id) as unique_leads,
  COUNT(*) FILTER (WHERE disposition = 'SALE') as sales,
  AVG(duration_sec) FILTER (WHERE duration_sec > 0) as avg_duration,
  SUM(duration_sec) as total_duration,
  SUM(talk_time_sec) as talk_time,
  SUM(wrap_time_sec) as wrap_time,
  array_agg(DISTINCT campaign) FILTER (WHERE campaign IS NOT NULL) as campaigns
FROM calls
WHERE source = 'convoso'
  AND started_at >= CURRENT_DATE - INTERVAL '90 days'
  AND agent_name IS NOT NULL
GROUP BY DATE(started_at), agent_name, agent_id
ORDER BY call_date DESC, calls DESC;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_mv_agent_daily_date
ON mv_agent_daily_performance(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_mv_agent_daily_agent
ON mv_agent_daily_performance(agent_name, call_date DESC);

-- Add tracking table for API sync status
CREATE TABLE IF NOT EXISTS convoso_sync_status (
  id serial PRIMARY KEY,
  sync_type text NOT NULL, -- 'delta', 'backfill', 'webhook'
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  from_date timestamptz,
  to_date timestamptz,
  records_processed int DEFAULT 0,
  records_inserted int DEFAULT 0,
  records_updated int DEFAULT 0,
  records_failed int DEFAULT 0,
  error_message text,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sync_status_type_completed
ON convoso_sync_status(sync_type, completed_at DESC);

-- Grant permissions if using specific database user
-- GRANT SELECT, INSERT, UPDATE ON calls TO your_app_user;
-- GRANT SELECT ON v_agent_call_stats TO your_app_user;
-- GRANT SELECT ON mv_agent_daily_performance TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE ON convoso_sync_status TO your_app_user;