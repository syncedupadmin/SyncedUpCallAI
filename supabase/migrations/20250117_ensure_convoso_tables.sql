-- =====================================================
-- Ensure Convoso Sync Tables Exist
-- Date: 2025-01-17
-- Purpose: Create missing tables for Convoso polling service
-- =====================================================

-- 1. Create sync_state table if it doesn't exist
CREATE TABLE IF NOT EXISTS sync_state (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  office_id BIGINT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for office_id lookups
CREATE INDEX IF NOT EXISTS idx_sync_state_office_id ON sync_state(office_id);

-- Initialize sync state for Default Office (id=1) if not exists
INSERT INTO sync_state (key, value, office_id)
VALUES ('last_convoso_check', (NOW() - INTERVAL '1 hour')::TEXT, 1)
ON CONFLICT (key) DO NOTHING;

-- 2. Create convoso_sync_status table if it doesn't exist
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

-- 3. Add missing Convoso-specific columns to calls table if not present
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

-- 4. Add indexes for Convoso data
CREATE INDEX IF NOT EXISTS idx_calls_agent_name ON calls(agent_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_lead_id ON calls(lead_id);
CREATE INDEX IF NOT EXISTS idx_calls_updated ON calls(updated_at DESC);

-- 5. Create helper function to normalize phone numbers if not exists
CREATE OR REPLACE FUNCTION normalize_phone(phone text)
RETURNS text AS $$
BEGIN
  -- Remove all non-digit characters
  RETURN regexp_replace(phone, '[^0-9]', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Add trigger to auto-update updated_at timestamp if not exists
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
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 7. Grant permissions (adjust based on your user setup)
GRANT SELECT, INSERT, UPDATE ON sync_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON convoso_sync_status TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE sync_state IS 'Tracks synchronization state for external systems like Convoso API polling';
COMMENT ON COLUMN sync_state.key IS 'Unique key identifier for the sync state (e.g., last_convoso_check)';
COMMENT ON COLUMN sync_state.value IS 'State value, typically a timestamp or configuration';
COMMENT ON COLUMN sync_state.office_id IS 'Office ID for multi-tenant support';

COMMENT ON TABLE convoso_sync_status IS 'Detailed tracking of Convoso sync operations';
COMMENT ON COLUMN convoso_sync_status.sync_type IS 'Type of sync: delta (incremental), backfill (historical), or webhook';

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Run these queries to verify tables exist:
-- SELECT * FROM sync_state;
-- SELECT * FROM convoso_sync_status ORDER BY started_at DESC LIMIT 10;
-- SELECT COUNT(*) FROM calls WHERE source = 'convoso';