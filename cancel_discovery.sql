-- Cancel the currently running discovery session
-- Run this in your Supabase SQL Editor

-- Show current sessions
SELECT id, agency_id, status, progress, created_at
FROM discovery_sessions
WHERE status IN ('pulling', 'transcribing', 'analyzing')
ORDER BY created_at DESC
LIMIT 5;

-- To cancel the session with ID 'fa890a0f-7eb0-495a-93c6-50d1e5c68270':
UPDATE discovery_sessions
SET status = 'cancelled',
    error = 'Manually cancelled to restart with performance improvements',
    updated_at = NOW()
WHERE id = 'fa890a0f-7eb0-495a-93c6-50d1e5c68270';

-- Verify cancellation
SELECT id, status, progress, error
FROM discovery_sessions
WHERE id = 'fa890a0f-7eb0-495a-93c6-50d1e5c68270';
