-- Add "paused" status to discovery_sessions
-- This allows super admin to pause active discovery sessions

-- Drop existing constraint
ALTER TABLE discovery_sessions
DROP CONSTRAINT IF EXISTS discovery_sessions_status_check;

-- Add new constraint with "paused" status
ALTER TABLE discovery_sessions
ADD CONSTRAINT discovery_sessions_status_check
CHECK (status IN ('initializing', 'pulling', 'queued', 'processing', 'paused', 'analyzing', 'complete', 'error', 'cancelled'));

-- Update cron job to skip paused sessions (already handled in code - no changes needed)
-- The process-discovery-queue cron filters by: WHERE status IN ('queued', 'processing')
-- Paused sessions will be skipped automatically
