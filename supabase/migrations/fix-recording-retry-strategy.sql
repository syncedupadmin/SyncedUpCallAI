-- Migration: Fix recording retry strategy with exponential backoff
-- Created: 2025-01-16
-- Purpose: Update pending_recordings to support long calls with smart retry strategy

-- Add new columns to pending_recordings table
ALTER TABLE pending_recordings
ADD COLUMN IF NOT EXISTS estimated_end_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS retry_phase VARCHAR(20) DEFAULT 'quick',
ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS call_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS call_ended_at TIMESTAMPTZ;

-- Update the attempts constraint to allow up to 12 attempts
-- First, we need to check if there's an existing constraint
DO $$
BEGIN
    -- Drop any existing check constraint on attempts
    ALTER TABLE pending_recordings DROP CONSTRAINT IF EXISTS pending_recordings_attempts_check;

    -- Add new constraint allowing up to 12 attempts
    ALTER TABLE pending_recordings
    ADD CONSTRAINT pending_recordings_attempts_check
    CHECK (attempts >= 0 AND attempts <= 12);
EXCEPTION
    WHEN others THEN
        -- If constraint doesn't exist, just add it
        NULL;
END $$;

-- Create function to calculate next retry time based on attempt number
CREATE OR REPLACE FUNCTION calculate_next_retry_time(
    attempt_number INTEGER,
    call_start TIMESTAMPTZ DEFAULT NULL
) RETURNS TIMESTAMPTZ AS $$
DECLARE
    delay_minutes INTEGER;
    base_time TIMESTAMPTZ;
BEGIN
    base_time := COALESCE(call_start, NOW());

    -- Phase 1: Quick retries (attempts 1-5) - every 2 minutes
    IF attempt_number <= 5 THEN
        delay_minutes := attempt_number * 2;

    -- Phase 2: Exponential backoff (attempts 6-11)
    ELSIF attempt_number = 6 THEN
        delay_minutes := 15;  -- 10 + 5
    ELSIF attempt_number = 7 THEN
        delay_minutes := 25;  -- 15 + 10
    ELSIF attempt_number = 8 THEN
        delay_minutes := 45;  -- 25 + 20
    ELSIF attempt_number = 9 THEN
        delay_minutes := 85;  -- 45 + 40
    ELSIF attempt_number = 10 THEN
        delay_minutes := 145; -- 85 + 60
    ELSIF attempt_number = 11 THEN
        delay_minutes := 205; -- 145 + 60

    -- Phase 3: Final safety net (attempt 12) - 6 hours
    ELSIF attempt_number = 12 THEN
        delay_minutes := 360; -- 6 hours total
    ELSE
        -- Should not happen with constraint, but default to 6 hours
        delay_minutes := 360;
    END IF;

    RETURN base_time + (delay_minutes || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Create function to determine retry phase based on attempt
CREATE OR REPLACE FUNCTION get_retry_phase(attempt_number INTEGER)
RETURNS VARCHAR(20) AS $$
BEGIN
    IF attempt_number <= 5 THEN
        RETURN 'quick';
    ELSIF attempt_number <= 11 THEN
        RETURN 'backoff';
    ELSE
        RETURN 'final';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Update existing pending_recordings to have scheduled_for if missing
UPDATE pending_recordings
SET scheduled_for = calculate_next_retry_time(attempts + 1, created_at),
    retry_phase = get_retry_phase(attempts + 1)
WHERE scheduled_for IS NULL;

-- Create index for efficient processing based on scheduled time
CREATE INDEX IF NOT EXISTS idx_pending_recordings_scheduled_processing
ON pending_recordings(scheduled_for, attempts)
WHERE processed_at IS NULL;

-- Add helpful comments
COMMENT ON COLUMN pending_recordings.estimated_end_time IS 'Estimated time when call will end, used for smart scheduling';
COMMENT ON COLUMN pending_recordings.retry_phase IS 'Current retry phase: quick, backoff, or final';
COMMENT ON COLUMN pending_recordings.scheduled_for IS 'Next scheduled retry time based on exponential backoff';
COMMENT ON COLUMN pending_recordings.call_started_at IS 'Actual call start time from webhook';
COMMENT ON COLUMN pending_recordings.call_ended_at IS 'Actual call end time from webhook if available';

-- Add a view to monitor retry status
CREATE OR REPLACE VIEW pending_recordings_status AS
SELECT
    id,
    call_id,
    lead_id,
    attempts,
    retry_phase,
    scheduled_for,
    CASE
        WHEN scheduled_for <= NOW() THEN 'ready'
        ELSE 'waiting'
    END as status,
    scheduled_for - NOW() as time_until_retry,
    last_error,
    created_at,
    call_started_at,
    call_ended_at,
    estimated_end_time
FROM pending_recordings
WHERE processed_at IS NULL
ORDER BY scheduled_for ASC;

COMMENT ON VIEW pending_recordings_status IS 'Monitor pending recording retries with their current status';