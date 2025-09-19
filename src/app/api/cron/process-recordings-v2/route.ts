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
    errors: [] as any[]
  };

  try {
    // Get pending recordings (max 50, attempts < 7)
    const pending = await db.manyOrNone(`
      SELECT id, call_id, lead_id, attempts
      FROM pending_recordings
      WHERE attempts < 7
      ORDER BY created_at ASC
      LIMIT 50
    `);

    logInfo({
      event_type: 'cron_start',
      pending_count: pending.length,
      source: 'process-recordings-v2'
    });

    // Process with rate limiting (max 60 per minute = 1 per second)
    for (const job of pending) {
      results.processed++;

      try {
        // Fetch recording
        const recordingUrl = await fetchRecording(job.call_id, job.lead_id);

        if (recordingUrl) {
          // Update calls table
          if (job.call_id) {
            await db.none(`
              UPDATE calls
              SET recording_url = $1
              WHERE call_id = $2
            `, [recordingUrl, job.call_id]);
          } else if (job.lead_id) {
            await db.none(`
              UPDATE calls
              SET recording_url = $1
              WHERE lead_id = $2
            `, [recordingUrl, job.lead_id]);
          }

          // Delete job
          await db.none(`
            DELETE FROM pending_recordings
            WHERE id = $1
          `, [job.id]);

          results.succeeded++;

          logInfo({
            event_type: 'recording_fetched',
            call_id: job.call_id,
            lead_id: job.lead_id,
            source: 'process-recordings-v2'
          });
        } else {
          // Increment attempts
          await db.none(`
            UPDATE pending_recordings
            SET attempts = attempts + 1,
                last_error = $2
            WHERE id = $1
          `, [job.id, 'Recording not found']);

          results.failed++;
        }

        // Rate limit: 1 per second
        await sleep(1000);

      } catch (error: any) {
        // Update error
        await db.none(`
          UPDATE pending_recordings
          SET attempts = attempts + 1,
              last_error = $2
          WHERE id = $1
        `, [job.id, error.message]);

        results.failed++;
        results.errors.push({
          job_id: job.id,
          error: error.message
        });

        logError('Failed to process recording', error, {
          job_id: job.id,
          call_id: job.call_id,
          lead_id: job.lead_id
        });
      }

      // Stop if running too long (max 5 minutes)
      if (Date.now() - startTime > 5 * 60 * 1000) {
        break;
      }
    }

    logInfo({
      event_type: 'cron_complete',
      processed: results.processed,
      succeeded: results.succeeded,
      failed: results.failed,
      duration_ms: Date.now() - startTime,
      source: 'process-recordings-v2'
    });

    return NextResponse.json({
      ok: true,
      ...results,
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