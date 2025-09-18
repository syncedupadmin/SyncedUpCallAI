-- =====================================================
-- Fix Transcription Queue Functions
-- Date: 2025-01-17
-- Purpose: Create missing database functions for transcription queue processing
-- =====================================================

-- 1. Create transcription_queue table if it doesn't exist
CREATE TABLE IF NOT EXISTS transcription_queue (
  id SERIAL PRIMARY KEY,
  call_id UUID NOT NULL,
  recording_url TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  CONSTRAINT fk_call FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_transcription_queue_status ON transcription_queue(status);
CREATE INDEX IF NOT EXISTS idx_transcription_queue_priority ON transcription_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_transcription_queue_call_id ON transcription_queue(call_id);

-- 2. Create get_next_transcription_job function
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
    attempts = tq.attempts + 1
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

-- 3. Create complete_transcription_job function
-- Drop existing function first if it exists with different signature
DROP FUNCTION IF EXISTS complete_transcription_job(integer, boolean, text);

CREATE OR REPLACE FUNCTION complete_transcription_job(
  p_queue_id INTEGER,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_success THEN
    UPDATE transcription_queue
    SET
      status = 'completed',
      completed_at = NOW(),
      last_error = NULL
    WHERE id = p_queue_id;
  ELSE
    UPDATE transcription_queue
    SET
      status = 'failed',
      completed_at = NOW(),
      last_error = p_error_message
    WHERE id = p_queue_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. Create cleanup_old_transcription_jobs function
CREATE OR REPLACE FUNCTION cleanup_old_transcription_jobs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete completed jobs older than 7 days
  DELETE FROM transcription_queue
  WHERE status = 'completed'
    AND completed_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- Also delete failed jobs older than 30 days
  DELETE FROM transcription_queue
  WHERE status = 'failed'
    AND completed_at < NOW() - INTERVAL '30 days';

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 5. Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON transcription_queue TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE transcription_queue_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION get_next_transcription_job TO authenticated;
GRANT EXECUTE ON FUNCTION complete_transcription_job TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_transcription_jobs TO authenticated;

-- 6. Add helper function to queue a transcription
CREATE OR REPLACE FUNCTION queue_transcription(
  p_call_id UUID,
  p_recording_url TEXT,
  p_priority INTEGER DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
  new_id INTEGER;
BEGIN
  -- Check if already queued
  SELECT id INTO new_id
  FROM transcription_queue
  WHERE call_id = p_call_id
    AND status IN ('pending', 'processing');

  IF new_id IS NOT NULL THEN
    -- Already queued, return existing ID
    RETURN new_id;
  END IF;

  -- Insert new job
  INSERT INTO transcription_queue (call_id, recording_url, priority)
  VALUES (p_call_id, p_recording_url, p_priority)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION queue_transcription TO authenticated;

-- =====================================================
-- VERIFICATION
-- =====================================================
-- Test the functions:
-- SELECT * FROM get_next_transcription_job();
-- SELECT complete_transcription_job(1, true, NULL);
-- SELECT cleanup_old_transcription_jobs();

-- Check queue status:
-- SELECT status, COUNT(*) FROM transcription_queue GROUP BY status;