-- Fix the source field issue for webhook records

-- 1. Check if there's a default value on source column
ALTER TABLE calls
ALTER COLUMN source DROP DEFAULT;

-- 2. Update all records with source='webhook' to 'convoso' if they look like Convoso data
UPDATE calls
SET source = 'convoso'
WHERE source = 'webhook'
  AND (
    metadata IS NOT NULL
    OR campaign IS NOT NULL
    OR disposition IS NOT NULL
    OR agent_name IS NOT NULL
  );

-- 3. For truly empty webhook records, try to extract data from metadata
UPDATE calls
SET
  phone_number = COALESCE(
    phone_number,
    metadata->>'phone_number',
    metadata->>'customer_phone',
    metadata->>'phone',
    metadata->>'lead_phone',
    metadata->'lead'->>'phone'
  ),
  agent_name = COALESCE(
    agent_name,
    metadata->>'agent_name',
    metadata->>'user',
    metadata->>'agent',
    metadata->'agent'->>'name'
  ),
  campaign = COALESCE(
    campaign,
    metadata->>'campaign',
    metadata->>'campaign_name'
  ),
  disposition = COALESCE(
    disposition,
    metadata->>'disposition',
    metadata->>'call_disposition'
  )
WHERE source = 'webhook'
  AND metadata IS NOT NULL;

-- 4. Create an index to improve webhook queries
CREATE INDEX IF NOT EXISTS idx_calls_source_created
ON calls(source, created_at DESC);

-- 5. Show summary of what was fixed
SELECT
  'Fixed Records' as status,
  COUNT(*) as count
FROM calls
WHERE source = 'convoso'
  AND (phone_number IS NOT NULL OR agent_name IS NOT NULL)
UNION ALL
SELECT
  'Still Missing Data' as status,
  COUNT(*) as count
FROM calls
WHERE source IN ('webhook', 'convoso')
  AND phone_number IS NULL
  AND agent_name IS NULL;

-- 6. Sample of fixed records
SELECT
  id,
  source,
  created_at,
  phone_number,
  agent_name,
  campaign,
  disposition
FROM calls
WHERE source = 'convoso'
  AND created_at > NOW() - INTERVAL '1 day'
ORDER BY created_at DESC
LIMIT 10;