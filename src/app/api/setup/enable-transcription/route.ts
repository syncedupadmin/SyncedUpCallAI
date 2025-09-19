import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET(req: NextRequest) {
  try {
    // Create transcription queue table
    await db.none(`
      CREATE TABLE IF NOT EXISTS transcription_queue (
        id SERIAL PRIMARY KEY,
        call_id UUID UNIQUE NOT NULL,
        recording_url TEXT NOT NULL,
        priority INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        source VARCHAR(50),
        duration_sec INTEGER,
        CONSTRAINT fk_call_id FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await db.none(`
      CREATE INDEX IF NOT EXISTS idx_transcription_queue_status
        ON transcription_queue(status, priority DESC, created_at ASC)
        WHERE status IN ('pending', 'processing')
    `);

    await db.none(`
      CREATE INDEX IF NOT EXISTS idx_transcription_queue_call_id
        ON transcription_queue(call_id)
    `);

    // Create queue_transcription function
    await db.none(`
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
          RETURN FALSE;
        END IF;

        -- Get call duration
        SELECT duration_sec FROM calls WHERE id = p_call_id
        INTO v_duration;

        -- Insert or update in queue
        INSERT INTO transcription_queue (
          call_id, recording_url, priority, source, duration_sec, status, attempts
        ) VALUES (
          p_call_id, p_recording_url, p_priority, p_source, v_duration, 'pending', 0
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
          last_error = NULL;

        RETURN TRUE;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create get_next_transcription_job function
    await db.none(`
      CREATE OR REPLACE FUNCTION get_next_transcription_job()
      RETURNS TABLE (
        queue_id INTEGER,
        call_id UUID,
        recording_url TEXT,
        priority INTEGER,
        attempts INTEGER
      ) AS $$
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
            AND transcription_queue.attempts < 3
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
      $$ LANGUAGE plpgsql
    `);

    // Create complete_transcription_job function
    await db.none(`
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
      $$ LANGUAGE plpgsql
    `);

    // Create cleanup function
    await db.none(`
      CREATE OR REPLACE FUNCTION cleanup_old_transcription_jobs()
      RETURNS INTEGER AS $$
      DECLARE
        v_deleted INTEGER;
      BEGIN
        DELETE FROM transcription_queue
        WHERE status = 'completed'
          AND completed_at < NOW() - INTERVAL '24 hours';

        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        RETURN v_deleted;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Check queue status
    const queueStatus = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total
      FROM transcription_queue
    `);

    return NextResponse.json({
      ok: true,
      message: 'Transcription queue enabled and functions created',
      queueStatus
    });

  } catch (error: any) {
    console.error('Error enabling transcription:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}