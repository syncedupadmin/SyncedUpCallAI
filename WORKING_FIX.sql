-- WORKING DATABASE FIX
-- This version handles all the edge cases properly

-- 1. Fix any calls with missing office_id
UPDATE calls
SET office_id = 1
WHERE office_id IS NULL;

-- 2. Fix any calls with missing source
UPDATE calls
SET source = 'convoso'
WHERE source IS NULL;

-- 3. Create sync_state table if it doesn't exist
CREATE TABLE IF NOT EXISTS sync_state (
  key VARCHAR(50) PRIMARY KEY,
  value TEXT,
  office_id BIGINT DEFAULT 1,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Initialize or reset sync state to 1 hour ago
INSERT INTO sync_state (key, value, office_id, updated_at)
VALUES ('last_convoso_check', (NOW() - INTERVAL '1 hour')::TEXT, 1, NOW())
ON CONFLICT (key) DO UPDATE
SET value = (NOW() - INTERVAL '1 hour')::TEXT,
    updated_at = NOW();

-- 5. Create convoso_sync_status if missing
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

-- 6. Grant permissions
GRANT ALL ON sync_state TO authenticated;
GRANT ALL ON convoso_sync_status TO authenticated;

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_source ON calls(source);
CREATE INDEX IF NOT EXISTS idx_calls_recording_url ON calls(recording_url) WHERE recording_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_office_id ON calls(office_id);

-- 8. Handle the offices table properly
DO $$
BEGIN
  -- Check if default office exists
  IF NOT EXISTS (SELECT 1 FROM offices WHERE id = 1) THEN
    -- Try to insert with OVERRIDING SYSTEM VALUE
    BEGIN
      INSERT INTO offices (id, name, created_at, updated_at)
      OVERRIDING SYSTEM VALUE
      VALUES (1, 'Default Office', NOW(), NOW());
    EXCEPTION WHEN OTHERS THEN
      -- If that fails, just insert without specifying ID
      INSERT INTO offices (name, created_at, updated_at)
      VALUES ('Default Office', NOW(), NOW());
    END;
  END IF;
END $$;

-- 9. Get the actual default office ID
DO $$
DECLARE
  default_office_id BIGINT;
BEGIN
  -- Get the first office ID
  SELECT id INTO default_office_id FROM offices ORDER BY id LIMIT 1;

  -- Update any calls with office_id = 1 to use the actual default
  IF default_office_id IS NOT NULL AND default_office_id != 1 THEN
    UPDATE calls SET office_id = default_office_id WHERE office_id = 1;
    UPDATE sync_state SET office_id = default_office_id WHERE office_id = 1;
  END IF;
END $$;

-- 10. Show status
SELECT 'Fix Status:' as info;

SELECT 'Offices:' as info, COUNT(*) as count, MIN(id) as first_office_id FROM offices;

SELECT 'Calls Summary:' as info,
       COUNT(*) as total,
       COUNT(DISTINCT office_id) as offices_used,
       MIN(office_id) as min_office_id
FROM calls;

SELECT 'Sync State:' as info, key, value, office_id, updated_at
FROM sync_state
WHERE key = 'last_convoso_check';

SELECT 'Fix completed!' as status;