-- Fix ambiguous column reference in get_next_transcription_job function
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
    tq.call_id as call_id,
    tq.recording_url as recording_url,
    tq.priority as priority,
    tq.attempts as attempts;
END;
$$ LANGUAGE plpgsql;