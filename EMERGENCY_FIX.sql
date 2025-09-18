-- EMERGENCY DATABASE FIX
-- Run this IMMEDIATELY in Supabase SQL Editor

-- 1. Fix calls table - ensure no invalid UUIDs
DELETE FROM calls WHERE id = 'SYSTEM' OR id IS NULL;

-- 2. Add check constraint to prevent invalid IDs
ALTER TABLE calls DROP CONSTRAINT IF EXISTS valid_uuid;
ALTER TABLE calls ADD CONSTRAINT valid_uuid CHECK (id IS NOT NULL AND id != 'SYSTEM'::uuid);

-- 3. Fix any calls with invalid data
UPDATE calls
SET source = 'convoso'
WHERE source IS NULL;

UPDATE calls
SET office_id = 1
WHERE office_id IS NULL;

-- 4. Create missing indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_source ON calls(source);
CREATE INDEX IF NOT EXISTS idx_calls_recording_url ON calls(recording_url) WHERE recording_url IS NOT NULL;

-- 5. Ensure sync_state table exists and is initialized
CREATE TABLE IF NOT EXISTS sync_state (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  office_id BIGINT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Initialize sync state
INSERT INTO sync_state (key, value, office_id, updated_at)
VALUES ('last_convoso_check', (NOW() - INTERVAL '1 hour')::TEXT, 1, NOW())
ON CONFLICT (key) DO UPDATE
SET value = (NOW() - INTERVAL '1 hour')::TEXT,
    updated_at = NOW();

-- 6. Create convoso_sync_status if missing
CREATE TABLE IF NOT EXISTS convoso_sync_status (
  id serial PRIMARY KEY,
  sync_type text NOT NULL,
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

-- 7. Grant permissions
GRANT ALL ON sync_state TO authenticated;
GRANT ALL ON convoso_sync_status TO authenticated;

-- 8. Check for problematic data
SELECT 'Checking for issues...' as status;

SELECT COUNT(*) as invalid_calls
FROM calls
WHERE id::text = 'SYSTEM' OR id IS NULL;

SELECT COUNT(*) as calls_without_office
FROM calls
WHERE office_id IS NULL;

SELECT COUNT(*) as total_calls
FROM calls;

-- 9. Show sync status
SELECT key, value, updated_at
FROM sync_state
WHERE key = 'last_convoso_check';