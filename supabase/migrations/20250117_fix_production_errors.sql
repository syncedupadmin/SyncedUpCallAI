-- PRODUCTION FIX: Apply critical fixes for Convoso integration
-- Date: 2025-01-17
-- Purpose: Fix transcription queue ambiguous column error and ensure office_id defaults

-- 1. Fix ambiguous column reference in get_next_transcription_job function
DROP FUNCTION IF EXISTS get_next_transcription_job();

CREATE OR REPLACE FUNCTION get_next_transcription_job()
RETURNS TABLE (
  queue_id INTEGER,
  call_id UUID,
  recording_url TEXT,
  priority INTEGER,
  attempts INTEGER
) AS $$
BEGIN
  -- Update and return the next pending job
  -- Priority order: status='pending', highest priority, oldest first
  RETURN QUERY
  UPDATE transcription_queue tq
  SET
    status = 'processing',
    started_at = NOW(),
    attempts = tq.attempts + 1  -- FIX: Use table alias to avoid ambiguity
  FROM (
    SELECT id
    FROM transcription_queue
    WHERE status = 'pending'
      AND attempts < 3 -- Max 3 attempts
    ORDER BY
      priority DESC,
      created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED -- Prevent race conditions
  ) next_job
  WHERE tq.id = next_job.id
  RETURNING
    tq.id as queue_id,
    tq.call_id,
    tq.recording_url,
    tq.priority,
    tq.attempts;
END;
$$ LANGUAGE plpgsql;

-- 2. Ensure office_id has a default value for calls table
DO $$
BEGIN
  -- Check if office_id column exists and add default if not already set
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'calls'
    AND column_name = 'office_id'
  ) THEN
    -- Set default value for office_id if not already set
    ALTER TABLE calls
    ALTER COLUMN office_id SET DEFAULT 1;

    -- Update any NULL office_id values to 1
    UPDATE calls
    SET office_id = 1
    WHERE office_id IS NULL;
  ELSE
    -- Add office_id column if it doesn't exist
    ALTER TABLE calls
    ADD COLUMN office_id BIGINT DEFAULT 1;
  END IF;
END $$;

-- 3. Ensure contacts table has office_id with default
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'contacts'
    AND column_name = 'office_id'
  ) THEN
    -- Set default value for office_id if not already set
    ALTER TABLE contacts
    ALTER COLUMN office_id SET DEFAULT 1;

    -- Update any NULL office_id values to 1
    UPDATE contacts
    SET office_id = 1
    WHERE office_id IS NULL;
  ELSE
    -- Add office_id column if it doesn't exist
    ALTER TABLE contacts
    ADD COLUMN office_id BIGINT DEFAULT 1;
  END IF;
END $$;

-- 4. Create default office if it doesn't exist
INSERT INTO offices (id, name, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Office', NOW(), NOW())
ON CONFLICT (name) DO NOTHING;

-- 5. Grant necessary permissions
GRANT EXECUTE ON FUNCTION get_next_transcription_job TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_transcription_job TO anon;