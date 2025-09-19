import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Validate environment variables
function validateEnv(): boolean {
  if (!process.env.CONVOSO_AUTH_TOKEN) {
    logError('CONVOSO_AUTH_TOKEN not configured');
    return false;
  }
  return true;
}

// Calculate next retry time based on attempt number
function calculateNextRetryTime(attemptNumber: number): Date {
  const now = new Date();
  let delayMinutes: number;

  // Phase 1: Quick retries (attempts 1-5) - every 2 minutes
  if (attemptNumber <= 5) {
    delayMinutes = 2;
  }
  // Phase 2: Exponential backoff (attempts 6-11)
  else if (attemptNumber === 6) {
    delayMinutes = 5;
  } else if (attemptNumber === 7) {
    delayMinutes = 10;
  } else if (attemptNumber === 8) {
    delayMinutes = 20;
  } else if (attemptNumber === 9) {
    delayMinutes = 40;
  } else if (attemptNumber === 10) {
    delayMinutes = 60;
  } else if (attemptNumber === 11) {
    delayMinutes = 60;
  }
  // Phase 3: Final safety net (attempt 12)
  else if (attemptNumber === 12) {
    delayMinutes = 180; // 3 hours for final attempt
  } else {
    // Should not happen, but default to 6 hours
    delayMinutes = 360;
  }

  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}

// Determine retry phase based on attempt
function getRetryPhase(attemptNumber: number): string {
  if (attemptNumber <= 5) {
    return 'quick';
  } else if (attemptNumber <= 11) {
    return 'backoff';
  } else {
    return 'final';
  }
}

// Fetch recording from Convoso API
async function fetchRecording(callId?: string, leadId?: string): Promise<string | null> {
  const authToken = process.env.CONVOSO_AUTH_TOKEN;
  const apiBase = 'https://api.convoso.com/v1';

  if (!authToken) {
    logError('CONVOSO_AUTH_TOKEN not configured');
    return null;
  }

  try {
    // Build query parameters with auth token
    const params = new URLSearchParams({
      auth_token: authToken,
      limit: '1'
    });

    // Add call_id or lead_id to params
    if (callId) {
      params.append('call_id', callId);
    } else if (leadId) {
      params.append('lead_id', leadId);
    } else {
      return null;
    }

    // Use the correct endpoint: /leads/get-recordings (not /users/recordings)
    const url = `${apiBase}/leads/get-recordings?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
      // No Bearer token needed - auth_token is in query params
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    // Check if we have a successful response with recordings
    if (data.success && data.data?.entries?.length > 0) {
      const recording = data.data.entries[0];
      // Return the recording URL directly
      return recording.url || null;
    }

    return null;
  } catch (error: any) {
    logError('Failed to fetch recording', error, { callId, leadId });
    return null;
  }
}

// Sleep helper for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  // Validate environment
  if (!validateEnv()) {
    return NextResponse.json({
      ok: false,
      error: 'Missing required environment variables'
    }, { status: 500 });
  }

  const startTime = Date.now();
  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [] as any[],
    phaseBreakdown: {
      quick: 0,
      backoff: 0,
      final: 0
    }
  };

  try {
    // Get pending recordings that are scheduled for processing
    // Max 50 records, attempts < 12, and scheduled_for <= NOW()
    const pending = await db.manyOrNone(`
      SELECT id, call_id, lead_id, attempts, retry_phase,
             call_started_at, call_ended_at, estimated_end_time
      FROM pending_recordings
      WHERE attempts < 12
        AND (scheduled_for IS NULL OR scheduled_for <= NOW())
        AND processed_at IS NULL
      ORDER BY
        CASE WHEN call_ended_at IS NOT NULL THEN 0 ELSE 1 END,  -- Prioritize completed calls
        scheduled_for ASC NULLS FIRST
      LIMIT 50
    `);

    logInfo({
      event_type: 'cron_start',
      pending_count: pending.length,
      source: 'process-recordings-v3'
    });

    // Process with rate limiting (max 60 per minute = 1 per second)
    for (const job of pending) {
      results.processed++;

      // Track phase breakdown
      const currentPhase = job.retry_phase || getRetryPhase(job.attempts + 1);
      results.phaseBreakdown[currentPhase as keyof typeof results.phaseBreakdown]++;

      try {
        // Fetch recording
        const recordingUrl = await fetchRecording(job.call_id, job.lead_id);

        if (recordingUrl) {
          // Update calls table and get the internal call ID
          let internalCallId = null;
          if (job.call_id) {
            const callRecord = await db.oneOrNone(`
              UPDATE calls
              SET recording_url = $1
              WHERE call_id = $2
              RETURNING id
            `, [recordingUrl, job.call_id]);
            internalCallId = callRecord?.id;
          } else if (job.lead_id) {
            const callRecord = await db.oneOrNone(`
              UPDATE calls
              SET recording_url = $1
              WHERE lead_id = $2
              RETURNING id
            `, [recordingUrl, job.lead_id]);
            internalCallId = callRecord?.id;
          }

          // Mark as processed
          await db.none(`
            UPDATE pending_recordings
            SET processed_at = NOW(),
                last_error = NULL
            WHERE id = $1
          `, [job.id]);

          // Queue for immediate transcription with high priority
          if (internalCallId) {
            try {
              await db.none(`
                SELECT queue_transcription($1, $2, $3, $4)
              `, [internalCallId, recordingUrl, 10, 'recording_fetch']);

              logInfo({
                event_type: 'transcription_queued',
                call_id: internalCallId,
                recording_url: recordingUrl,
                source: 'process-recordings-v3'
              });
            } catch (queueError: any) {
              logError('Failed to queue transcription', queueError, {
                call_id: internalCallId
              });
            }
          }

          results.succeeded++;

          logInfo({
            event_type: 'recording_fetched',
            call_id: job.call_id,
            lead_id: job.lead_id,
            internal_call_id: internalCallId,
            attempts: job.attempts + 1,
            phase: currentPhase,
            source: 'process-recordings-v3'
          });
        } else {
          // Recording not found, schedule next retry
          const nextAttempt = job.attempts + 1;

          if (nextAttempt >= 12) {
            // Max attempts reached, mark as failed
            await db.none(`
              UPDATE pending_recordings
              SET attempts = $1,
                  last_error = $2,
                  processed_at = NOW()
              WHERE id = $3
            `, [nextAttempt, 'Max attempts reached - recording not found', job.id]);

            logError('Recording fetch exhausted all attempts', null, {
              job_id: job.id,
              call_id: job.call_id,
              lead_id: job.lead_id,
              final_attempt: nextAttempt
            });
          } else {
            // Schedule next retry with exponential backoff
            const nextRetryTime = calculateNextRetryTime(nextAttempt);
            const nextPhase = getRetryPhase(nextAttempt);

            await db.none(`
              UPDATE pending_recordings
              SET attempts = $1,
                  last_error = $2,
                  scheduled_for = $3,
                  retry_phase = $4
              WHERE id = $5
            `, [nextAttempt, 'Recording not found', nextRetryTime, nextPhase, job.id]);

            logInfo({
              event_type: 'recording_retry_scheduled',
              job_id: job.id,
              call_id: job.call_id,
              lead_id: job.lead_id,
              next_attempt: nextAttempt,
              next_retry: nextRetryTime.toISOString(),
              phase: nextPhase
            });
          }

          results.failed++;
        }

        // Rate limit: 1 per second
        await sleep(1000);

      } catch (error: any) {
        // Update error and schedule retry
        const nextAttempt = job.attempts + 1;
        const nextRetryTime = calculateNextRetryTime(nextAttempt);
        const nextPhase = getRetryPhase(nextAttempt);

        await db.none(`
          UPDATE pending_recordings
          SET attempts = $1,
              last_error = $2,
              scheduled_for = $3,
              retry_phase = $4
          WHERE id = $5
        `, [nextAttempt, error.message, nextRetryTime, nextPhase, job.id]);

        results.failed++;
        results.errors.push({
          job_id: job.id,
          error: error.message
        });

        logError('Failed to process recording', error, {
          job_id: job.id,
          call_id: job.call_id,
          lead_id: job.lead_id,
          attempt: nextAttempt
        });
      }

      // Stop if running too long (max 5 minutes)
      if (Date.now() - startTime > 5 * 60 * 1000) {
        break;
      }
    }

    // Get summary statistics
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) FILTER (WHERE retry_phase = 'quick' AND processed_at IS NULL) as quick_pending,
        COUNT(*) FILTER (WHERE retry_phase = 'backoff' AND processed_at IS NULL) as backoff_pending,
        COUNT(*) FILTER (WHERE retry_phase = 'final' AND processed_at IS NULL) as final_pending,
        COUNT(*) FILTER (WHERE processed_at IS NOT NULL AND last_error IS NULL) as total_succeeded,
        COUNT(*) FILTER (WHERE processed_at IS NOT NULL AND last_error IS NOT NULL) as total_failed
      FROM pending_recordings
    `);

    logInfo({
      event_type: 'cron_complete',
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed,
      phase_breakdown: results.phaseBreakdown,
      pending_stats: stats,
      duration_ms: Date.now() - startTime,
      source: 'process-recordings-v3'
    });

    return NextResponse.json({
      ok: true,
      ...results,
      stats,
      duration_ms: Date.now() - startTime
    });

  } catch (error: any) {
    logError('Cron job failed', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      ...results
    }, { status: 500 });
  }
}