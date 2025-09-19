import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export async function GET(req: NextRequest) {
  try {
    // Drop and recreate the function with fixed column references
    await db.none(`DROP FUNCTION IF EXISTS get_next_transcription_job()`);

    await db.none(`
      CREATE FUNCTION get_next_transcription_job()
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
          FROM transcription_queue tq2
          WHERE tq2.status = 'pending'
            AND tq2.attempts < 3
          ORDER BY
            tq2.priority DESC,
            tq2.created_at ASC
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
      message: 'Fixed get_next_transcription_job function',
      queueStatus
    });

  } catch (error: any) {
    console.error('Error fixing queue function:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}