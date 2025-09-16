-- Migration: Add transcription queue for immediate processing
-- Created: 2025-01-16
-- Purpose: Queue transcriptions as soon as recordings are available

-- Create transcription queue table
CREATE TABLE IF NOT EXISTS transcription_queue (
  id SERIAL PRIMARY KEY,
  call_id UUID UNIQUE NOT NULL,
  recording_url TEXT NOT NULL,
  priority INTEGER DEFAULT 0, -- Higher number = higher priority
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Metadata for tracking
  source VARCHAR(50), -- 'webhook', 'batch', 'manual', 'recording_fetch'
  duration_sec INTEGER, -- Call duration for prioritization

  CONSTRAINT fk_call_id FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
);

-- Create indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_transcription_queue_status
  ON transcription_queue(status, priority DESC, created_at ASC)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_transcription_queue_call_id
  ON transcription_queue(call_id);

CREATE INDEX IF NOT EXISTS idx_transcription_queue_created
  ON transcription_queue(created_at)
  WHERE status = 'pending';

-- Function to add call to transcription queue
CREATE OR REPLACE FUNCTION queue_transcription(
  p_call_id UUID,
  p_recording_url TEXT,
  p_priority INTEGER DEFAULT 0,
  p_source VARCHAR(50) DEFAULT 'unknown'
) RETURNS BOOLEAN AS $$
DECLARE
  v_duration INTEGER;
  v_existing_transcript BOOLEAN;
BEGIN
  -- Check if already transcribed
  SELECT EXISTS(SELECT 1 FROM transcripts WHERE call_id = p_call_id)
  INTO v_existing_transcript;

  IF v_existing_transcript THEN
    RETURN FALSE; -- Already transcribed
  END IF;

  -- Get call duration for smart prioritization
  SELECT duration_sec FROM calls WHERE id = p_call_id
  INTO v_duration;

  -- Insert into queue (ON CONFLICT DO UPDATE to handle re-queuing)
  INSERT INTO transcription_queue (
    call_id,
    recording_url,
    priority,
    source,
    duration_sec,
    status,
    attempts,
    created_at
  )
  VALUES (
    p_call_id,
    p_recording_url,
    p_priority,
    p_source,
    v_duration,
    'pending',
    0,
    NOW()
  )
  ON CONFLICT (call_id) DO UPDATE SET
    recording_url = EXCLUDED.recording_url,
    priority = GREATEST(transcription_queue.priority, EXCLUDED.priority),
    status = CASE
      WHEN transcription_queue.status = 'failed' THEN 'pending'
      ELSE transcription_queue.status
    END,
    attempts = CASE
      WHEN transcription_queue.status = 'failed' THEN 0
      ELSE transcription_queue.attempts
    END,
    last_error = NULL,
    created_at = CASE
      WHEN transcription_queue.status = 'failed' THEN NOW()
      ELSE transcription_queue.created_at
    END;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to get next item from queue
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
    attempts = attempts + 1
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

-- Function to mark job as completed
CREATE OR REPLACE FUNCTION complete_transcription_job(
  p_queue_id INTEGER,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  UPDATE transcription_queue
  SET
    status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    completed_at = CASE WHEN p_success THEN NOW() ELSE NULL END,
    last_error = p_error
  WHERE id = p_queue_id;
END;
$$ LANGUAGE plpgsql;

-- View to monitor queue status
CREATE OR REPLACE VIEW transcription_queue_status AS
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/60)::INTEGER as avg_wait_minutes,
  MAX(EXTRACT(EPOCH FROM (NOW() - created_at))/60)::INTEGER as max_wait_minutes
FROM transcription_queue
WHERE completed_at IS NULL
GROUP BY status;

-- View for detailed queue monitoring
CREATE OR REPLACE VIEW transcription_queue_details AS
SELECT
  tq.id,
  tq.call_id,
  tq.status,
  tq.priority,
  tq.attempts,
  tq.source,
  tq.created_at,
  tq.started_at,
  tq.completed_at,
  EXTRACT(EPOCH FROM (NOW() - tq.created_at))/60 as wait_minutes,
  c.agent_name,
  c.duration_sec,
  c.disposition,
  c.campaign
FROM transcription_queue tq
LEFT JOIN calls c ON c.id = tq.call_id
ORDER BY
  CASE WHEN tq.status = 'pending' THEN 0
       WHEN tq.status = 'processing' THEN 1
       WHEN tq.status = 'failed' THEN 2
       ELSE 3 END,
  tq.priority DESC,
  tq.created_at ASC;

-- Add trigger to clean up old completed jobs (keep for 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_transcription_jobs()
RETURNS VOID AS $$
BEGIN
  DELETE FROM transcription_queue
  WHERE status = 'completed'
    AND completed_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON transcription_queue TO authenticated;
GRANT ALL ON transcription_queue_id_seq TO authenticated;
GRANT SELECT ON transcription_queue_status TO authenticated;
GRANT SELECT ON transcription_queue_details TO authenticated;

-- Add helpful comments
COMMENT ON TABLE transcription_queue IS 'Queue for managing transcription jobs with priority and retry logic';
COMMENT ON COLUMN transcription_queue.priority IS 'Higher number = higher priority. 0=normal, 10=high, 100=urgent';
COMMENT ON COLUMN transcription_queue.source IS 'Origin of the transcription request: webhook, batch, manual, recording_fetch';
COMMENT ON VIEW transcription_queue_status IS 'Summary view of transcription queue status';
COMMENT ON VIEW transcription_queue_details IS 'Detailed view of all transcription jobs with call metadata';