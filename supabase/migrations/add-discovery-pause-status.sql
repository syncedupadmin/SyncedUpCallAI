-- Add "paused" status to discovery_sessions
-- This allows super admin to pause active discovery sessions

-- First, check what statuses currently exist
-- SELECT DISTINCT status FROM discovery_sessions;

-- Update any invalid statuses before changing constraint
-- Fix old "transcribing" status to "processing" (new queue-based system)
UPDATE discovery_sessions
SET status = 'cancelled',
    error_message = COALESCE(error_message, '') || ' [Migrated from old system]'
WHERE status = 'transcribing';

-- Drop existing constraint if it exists
ALTER TABLE discovery_sessions
DROP CONSTRAINT IF EXISTS discovery_sessions_status_check;

-- Add new constraint with "paused" and all valid statuses
-- Includes both old system statuses and new queue-based statuses
ALTER TABLE discovery_sessions
ADD CONSTRAINT discovery_sessions_status_check
CHECK (status IN (
  'initializing',    -- Initial state
  'pulling',         -- Old system: pulling metadata
  'queued',          -- New system: queued for processing
  'processing',      -- New system: being processed by cron
  'paused',          -- New: paused by super admin
  'transcribing',    -- Old system: transcribing (will be migrated to cancelled)
  'analyzing',       -- Old/New: analyzing calls
  'complete',        -- Finished successfully
  'error',           -- Failed with error
  'cancelled'        -- Cancelled by user or admin
));

-- Update cron job to skip paused sessions (already handled in code - no changes needed)
-- The process-discovery-queue cron filters by: WHERE status IN ('queued', 'processing')
-- Paused sessions will be skipped automatically
