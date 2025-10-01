-- Stop all in-progress discovery sessions
UPDATE discovery_sessions
SET status = 'cancelled',
    error_message = 'Manually cancelled to restart with new code'
WHERE status IN ('initializing', 'pulling', 'analyzing', 'in_progress');

-- Reset agency discovery status
UPDATE agencies
SET discovery_status = 'pending',
    discovery_session_id = NULL
WHERE discovery_status = 'in_progress';

-- Show what was updated
SELECT 'Updated sessions:' as info;
SELECT id, agency_id, status, progress FROM discovery_sessions WHERE status = 'cancelled' ORDER BY created_at DESC LIMIT 3;

SELECT 'Updated agencies:' as info;
SELECT id, name, discovery_status FROM agencies WHERE discovery_status = 'pending' ORDER BY updated_at DESC LIMIT 3;
