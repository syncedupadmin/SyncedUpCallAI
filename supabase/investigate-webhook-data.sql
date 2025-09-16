-- Investigate webhook data issues

-- 1. Check distribution of sources
SELECT
  source,
  COUNT(*) as count,
  COUNT(CASE WHEN agent_name IS NOT NULL THEN 1 END) as has_agent,
  COUNT(CASE WHEN phone_number IS NOT NULL THEN 1 END) as has_phone,
  COUNT(CASE WHEN metadata IS NOT NULL THEN 1 END) as has_metadata
FROM calls
GROUP BY source
ORDER BY count DESC;

-- 2. Look at metadata content for 'webhook' source records
SELECT
  id,
  source,
  created_at,
  agent_name,
  phone_number,
  jsonb_pretty(metadata) as formatted_metadata
FROM calls
WHERE source = 'webhook'
  AND metadata IS NOT NULL
LIMIT 5;

-- 3. Check what fields exist in metadata for webhook records
SELECT DISTINCT
  jsonb_object_keys(metadata) as metadata_keys
FROM calls
WHERE source = 'webhook'
  AND metadata IS NOT NULL
LIMIT 100;

-- 4. Sample of most recent webhook records
SELECT
  id,
  source,
  created_at,
  agent_name,
  phone_number,
  campaign,
  disposition,
  metadata->>'phone_number' as meta_phone,
  metadata->>'customer_phone' as meta_customer_phone,
  metadata->>'agent_name' as meta_agent,
  metadata->>'disposition' as meta_disposition
FROM calls
WHERE source = 'webhook'
ORDER BY created_at DESC
LIMIT 10;

-- 5. Compare 'convoso' vs 'webhook' records
SELECT
  source,
  MIN(created_at) as first_record,
  MAX(created_at) as last_record,
  COUNT(*) as total,
  AVG(CASE WHEN phone_number IS NOT NULL THEN 1 ELSE 0 END)::decimal(5,2) as pct_with_phone,
  AVG(CASE WHEN agent_name IS NOT NULL THEN 1 ELSE 0 END)::decimal(5,2) as pct_with_agent
FROM calls
WHERE source IN ('webhook', 'convoso')
GROUP BY source;

-- 6. Find if there's another webhook endpoint creating these records
SELECT DISTINCT
  metadata->>'webhook_endpoint' as endpoint,
  metadata->>'source' as meta_source,
  COUNT(*) as count
FROM calls
WHERE source = 'webhook'
  AND metadata IS NOT NULL
GROUP BY 1, 2;

-- 7. Check call_events table for webhook activity
SELECT
  type,
  COUNT(*) as count,
  MIN(created_at) as first_event,
  MAX(created_at) as last_event
FROM call_events
WHERE type LIKE '%webhook%'
   OR type LIKE '%disposition%'
GROUP BY type
ORDER BY count DESC;