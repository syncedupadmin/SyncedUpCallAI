-- =====================================================
-- Minimal Transcription Queue Fix
-- Date: 2025-01-17
-- Purpose: Only create missing functions, skip existing ones
-- =====================================================

-- 1. Ensure transcription_queue table exists
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
  completed_at TIMESTAMP
);

-- Add constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_call' AND table_name = 'transcription_queue'
  ) THEN
    ALTER TABLE transcription_queue
    ADD CONSTRAINT fk_call FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add indexes if not exist
CREATE INDEX IF NOT EXISTS idx_transcription_queue_status ON transcription_queue(status);
CREATE INDEX IF NOT EXISTS idx_transcription_queue_priority ON transcription_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_transcription_queue_call_id ON transcription_queue(call_id);

-- 2. Create get_next_transcription_job if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_next_transcription_job') THEN
    CREATE FUNCTION get_next_transcription_job()
    RETURNS TABLE (
      queue_id INTEGER,
      call_id UUID,
      recording_url TEXT,
      priority INTEGER,
      attempts INTEGER
    ) AS $func$
    BEGIN
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
          AND attempts < 3
        ORDER BY
          priority DESC,
          created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      ) next_job
      WHERE tq.id = next_job.id
      RETURNING
        tq.id as queue_id,
        tq.call_id,
        tq.recording_url,
        tq.priority,
        tq.attempts;
    END;
    $func$ LANGUAGE plpgsql;

    RAISE NOTICE 'Created function get_next_transcription_job';
  ELSE
    RAISE NOTICE 'Function get_next_transcription_job already exists';
  END IF;
END $$;

-- 3. Create complete_transcription_job if it doesn't exist (check by name only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_transcription_job') THEN
    CREATE FUNCTION complete_transcription_job(
      p_queue_id INTEGER,
      p_success BOOLEAN,
      p_error TEXT DEFAULT NULL
    )
    RETURNS VOID AS $func$
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
          last_error = p_error
        WHERE id = p_queue_id;
      END IF;
    END;
    $func$ LANGUAGE plpgsql;

    RAISE NOTICE 'Created function complete_transcription_job';
  ELSE
    RAISE NOTICE 'Function complete_transcription_job already exists';
  END IF;
END $$;

-- 4. Create cleanup_old_transcription_jobs if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_old_transcription_jobs') THEN
    CREATE FUNCTION cleanup_old_transcription_jobs()
    RETURNS INTEGER AS $func$
    DECLARE
      deleted_count INTEGER;
    BEGIN
      DELETE FROM transcription_queue
      WHERE status = 'completed'
        AND completed_at < NOW() - INTERVAL '7 days';

      GET DIAGNOSTICS deleted_count = ROW_COUNT;

      DELETE FROM transcription_queue
      WHERE status = 'failed'
        AND completed_at < NOW() - INTERVAL '30 days';

      RETURN deleted_count;
    END;
    $func$ LANGUAGE plpgsql;

    RAISE NOTICE 'Created function cleanup_old_transcription_jobs';
  ELSE
    RAISE NOTICE 'Function cleanup_old_transcription_jobs already exists';
  END IF;
END $$;

-- 5. Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON transcription_queue TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE transcription_queue_id_seq TO authenticated;

-- Grant execute on functions if they exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_next_transcription_job') THEN
    GRANT EXECUTE ON FUNCTION get_next_transcription_job TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cleanup_old_transcription_jobs') THEN
    GRANT EXECUTE ON FUNCTION cleanup_old_transcription_jobs TO authenticated;
  END IF;

  -- For complete_transcription_job, we need to handle multiple signatures
  EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated';
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================
SELECT 'Checking transcription functions:' as status;

SELECT proname as function_name, pronargs as arg_count
FROM pg_proc
WHERE proname IN ('get_next_transcription_job', 'complete_transcription_job', 'cleanup_old_transcription_jobs', 'queue_transcription')
ORDER BY proname;

-- Check queue status
SELECT 'Queue Status:' as info;
SELECT COALESCE(status, 'TOTAL') as status, COUNT(*) as count
FROM transcription_queue
GROUP BY ROLLUP(status)
ORDER BY status;