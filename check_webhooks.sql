-- Check recent webhook logs
SELECT 
  id,
  endpoint,
  created_at,
  response_status,
  error,
  jsonb_pretty(body) as body_formatted
FROM webhook_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 10;
