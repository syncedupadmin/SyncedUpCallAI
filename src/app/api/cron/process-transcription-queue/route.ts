import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { logInfo, logError } from '@/src/lib/log';

export const dynamic = 'force-dynamic';

// Process transcription queue
export async function GET(req: NextRequest) {
  // TEMPORARILY DISABLED: Transcription processing disabled until database functions are created
  return NextResponse.json({
    message: 'Transcription processing temporarily disabled',
    ok: true
  });

  const startTime = Date.now();
  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [] as any[]
  };

  try {
    // Process up to 5 transcriptions per run (to stay within time limits)
    const maxJobs = 5;

    for (let i = 0; i < maxJobs; i++) {
      // Get next job from queue
      const job = await db.oneOrNone(`
        SELECT * FROM get_next_transcription_job()
      `);

      if (!job) {
        // No more pending jobs
        break;
      }

      results.processed++;

      try {
        logInfo({
          event_type: 'transcription_job_started',
          queue_id: job.queue_id,
          call_id: job.call_id,
          priority: job.priority,
          attempt: job.attempts
        });

        // Call the transcribe endpoint
        const transcribeResp = await fetch(`${process.env.APP_URL}/api/jobs/transcribe`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.JOBS_SECRET}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            callId: job.call_id,
            recordingUrl: job.recording_url
          })
        });

        if (transcribeResp.ok) {
          const result = await transcribeResp.json();

          // Mark job as completed
          await db.none(`
            SELECT complete_transcription_job($1, $2, $3)
          `, [job.queue_id, true, null]);

          results.succeeded++;

          logInfo({
            event_type: 'transcription_job_completed',
            queue_id: job.queue_id,
            call_id: job.call_id,
            engine: result.engine,
            lang: result.lang,
            analyze_ok: result.analyze_ok
          });
        } else {
          const errorText = await transcribeResp.text();

          // Check if it's a permanent failure
          const isPermanentFailure = transcribeResp.status === 404 ||
                                    errorText.includes('short_call') ||
                                    errorText.includes('no_recording');

          if (isPermanentFailure || job.attempts >= 3) {
            // Mark as failed permanently
            await db.none(`
              SELECT complete_transcription_job($1, $2, $3)
            `, [job.queue_id, false, errorText]);

            logError('Transcription job permanently failed', null, {
              queue_id: job.queue_id,
              call_id: job.call_id,
              attempts: job.attempts,
              error: errorText
            });
          } else {
            // Retry - job stays in pending status with incremented attempts
            await db.none(`
              UPDATE transcription_queue
              SET status = 'pending',
                  last_error = $2,
                  started_at = NULL
              WHERE id = $1
            `, [job.queue_id, errorText]);

            logInfo({
              event_type: 'transcription_job_retry_scheduled',
              queue_id: job.queue_id,
              call_id: job.call_id,
              attempts: job.attempts,
              error: errorText
            });
          }

          results.failed++;
          results.errors.push({
            queue_id: job.queue_id,
            call_id: job.call_id,
            error: errorText
          });
        }

        // Add small delay between transcriptions to avoid overwhelming services
        if (i < maxJobs - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error: any) {
        // Mark job for retry
        await db.none(`
          UPDATE transcription_queue
          SET status = 'pending',
              last_error = $2,
              started_at = NULL
          WHERE id = $1
        `, [job.queue_id, error.message]);

        results.failed++;
        results.errors.push({
          queue_id: job.queue_id,
          call_id: job.call_id,
          error: error.message
        });

        logError('Transcription job failed', error, {
          queue_id: job.queue_id,
          call_id: job.call_id
        });
      }

      // Stop if running too long (max 50 seconds to be safe)
      if (Date.now() - startTime > 50 * 1000) {
        break;
      }
    }

    // Get queue statistics
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour') as completed_recent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) FILTER (WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 hour') as avg_completion_minutes
      FROM transcription_queue
    `);

    // Clean up old completed jobs
    await db.none(`
      SELECT cleanup_old_transcription_jobs()
    `);

    logInfo({
      event_type: 'transcription_queue_processed',
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed,
      queue_stats: stats,
      duration_ms: Date.now() - startTime
    });

    return NextResponse.json({
      ok: true,
      ...results,
      stats,
      duration_ms: Date.now() - startTime
    });

  } catch (error: any) {
    logError('Transcription queue processor failed', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      ...results
    }, { status: 500 });
  }
}