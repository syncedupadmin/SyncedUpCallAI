import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { logInfo, logError } from '@/src/lib/log';

export const dynamic = 'force-dynamic';

// Fetch recording from Convoso API
async function fetchRecording(callId?: string, leadId?: string): Promise<string | null> {
  const apiBase = process.env.CONVOSO_API_BASE;
  const apiKey = process.env.CONVOSO_AUTH_TOKEN;

  if (!apiBase || !apiKey) {
    logError('Convoso API credentials not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      auth_token: apiKey,
      limit: '1'
    });

    if (callId) {
      params.append('call_id', callId);
    } else if (leadId) {
      params.append('lead_id', leadId);
    } else {
      return null;
    }

    const url = `${apiBase}/users/recordings?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.data?.entries?.length > 0) {
      const recording = data.data.entries[0];
      const recordingUrl = recording.url;
      if (recordingUrl && !recordingUrl.startsWith('http')) {
        return `${apiBase}/recordings/${recordingUrl}`;
      }
      return recordingUrl;
    }

    return null;
  } catch (error: any) {
    logError('Failed to fetch recording', error, { callId, leadId });
    return null;
  }
}

// Validate webhook secret
function validateWebhook(req: NextRequest): boolean {
  const secret = req.headers.get('x-webhook-secret');
  if (secret && process.env.CONVOSO_WEBHOOK_SECRET) {
    return secret === process.env.CONVOSO_WEBHOOK_SECRET;
  }
  return true; // Allow if no secret configured
}

export async function POST(req: NextRequest) {
  let webhookLogId: number | null = null;

  try {
    // Validate webhook
    if (!validateWebhook(req)) {
      logError('Invalid webhook secret for immediate call webhook');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    // Log webhook for debugging
    try {
      const result = await db.oneOrNone(`
        INSERT INTO webhook_logs (endpoint, method, headers, body)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [
        '/api/webhooks/convoso-calls-immediate',
        'POST',
        Object.fromEntries(req.headers.entries()),
        body
      ]);
      webhookLogId = result?.id;
    } catch (e) {
      // Table might not exist yet, continue
    }

    // Map call data
    const callData = {
      call_id: body.call_id || body.uniqueid || body.id || null,
      lead_id: body.lead_id || body.owner_id || null,
      agent_name: body.agent_name || body.agent || null,
      phone_number: body.phone_number || body.phone || body.customer_phone || null,
      disposition: body.disposition || body.status || null,
      duration: body.duration !== undefined ? Number(body.duration) : null,
      campaign: body.campaign || body.campaign_name || null,
      recording_url: body.recording_url || body.recording || null,
      started_at: body.started_at || body.start_time || null,
      ended_at: body.ended_at || body.end_time || null
    };

    // Validate required fields
    if (!callData.agent_name || !callData.disposition || callData.duration === null) {
      logError('Missing required call fields', null, {
        has_agent: !!callData.agent_name,
        has_disposition: !!callData.disposition,
        has_duration: callData.duration !== null,
        body
      });

      return NextResponse.json({
        ok: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    // Check if call has ended
    const callHasEnded = !!(callData.ended_at || (callData.duration && callData.duration > 0));

    // Try to link to existing contact
    let contactId = null;
    if (callData.lead_id) {
      try {
        const contact = await db.oneOrNone(`
          SELECT id FROM contacts WHERE lead_id = $1
        `, [callData.lead_id]);
        contactId = contact?.id;
      } catch (e) {
        // Contact might not exist yet
      }
    }

    // If call has ended and no recording URL, try immediate fetch
    let fetchedRecordingUrl = callData.recording_url;
    let immediateAttemptMade = false;

    if (callHasEnded && !callData.recording_url && (callData.call_id || callData.lead_id)) {
      logInfo({
        event_type: 'immediate_recording_attempt',
        call_id: callData.call_id,
        lead_id: callData.lead_id,
        duration: callData.duration,
        source: 'convoso'
      });

      immediateAttemptMade = true;
      fetchedRecordingUrl = await fetchRecording(callData.call_id, callData.lead_id);

      if (fetchedRecordingUrl) {
        logInfo({
          event_type: 'immediate_recording_success',
          call_id: callData.call_id,
          lead_id: callData.lead_id,
          source: 'convoso'
        });
      }
    }

    // Upsert call record
    const result = await db.oneOrNone(`
      INSERT INTO calls (
        call_id, lead_id, agent_name, phone_number, disposition,
        duration, campaign, recording_url, started_at, ended_at,
        contact_id, source, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (call_id) WHERE call_id IS NOT NULL
      DO UPDATE SET
        lead_id = COALESCE(EXCLUDED.lead_id, calls.lead_id),
        agent_name = EXCLUDED.agent_name,
        phone_number = COALESCE(EXCLUDED.phone_number, calls.phone_number),
        disposition = EXCLUDED.disposition,
        duration = EXCLUDED.duration,
        campaign = COALESCE(EXCLUDED.campaign, calls.campaign),
        recording_url = COALESCE(EXCLUDED.recording_url, calls.recording_url),
        started_at = COALESCE(EXCLUDED.started_at, calls.started_at),
        ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
        contact_id = COALESCE(EXCLUDED.contact_id, calls.contact_id)
      RETURNING id
    `, [
      callData.call_id,
      callData.lead_id,
      callData.agent_name,
      callData.phone_number,
      callData.disposition,
      callData.duration,
      callData.campaign,
      fetchedRecordingUrl,
      callData.started_at,
      callData.ended_at,
      contactId,
      'convoso'
    ]);

    const callRecordId = result?.id;

    // If we successfully fetched a recording, queue it for transcription immediately
    if (fetchedRecordingUrl && callRecordId) {
      try {
        // High priority for immediately available recordings
        await db.none(`
          SELECT queue_transcription($1, $2, $3, $4)
        `, [callRecordId, fetchedRecordingUrl, 20, 'webhook_immediate']);

        logInfo({
          event_type: 'transcription_queued_from_webhook',
          call_id: callRecordId,
          has_immediate_recording: true,
          priority: 20,
          source: 'convoso'
        });
      } catch (queueError: any) {
        logError('Failed to queue transcription from webhook', queueError, {
          call_id: callRecordId
        });
      }
    }

    // If still no recording URL, queue for retry
    if (!fetchedRecordingUrl && (callData.call_id || callData.lead_id)) {
      try {
        const callStartTime = callData.started_at ? new Date(callData.started_at) : new Date();
        const callEndTime = callData.ended_at ? new Date(callData.ended_at) : null;

        // If we already tried immediate fetch and failed, schedule with backoff
        let scheduledFor;
        if (immediateAttemptMade) {
          // Start with 2-minute delay after failed immediate attempt
          scheduledFor = new Date(Date.now() + 2 * 60 * 1000);
        } else if (callHasEnded) {
          // Call ended but we didn't try immediate fetch (missing API creds?)
          scheduledFor = new Date();
        } else {
          // Call ongoing, estimate end time
          const avgCallDurationMinutes = 5;
          const estimatedEndTime = new Date(callStartTime.getTime() + (avgCallDurationMinutes * 60 * 1000));
          scheduledFor = new Date(estimatedEndTime.getTime() + (2 * 60 * 1000));
        }

        await db.none(`
          INSERT INTO pending_recordings (
            call_id,
            lead_id,
            attempts,
            created_at,
            scheduled_for,
            call_started_at,
            call_ended_at,
            estimated_end_time,
            retry_phase,
            last_error
          )
          VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9)
          ON CONFLICT DO NOTHING
        `, [
          callData.call_id,
          callData.lead_id,
          immediateAttemptMade ? 1 : 0,
          scheduledFor,
          callStartTime,
          callEndTime,
          callEndTime || null,
          'quick',
          immediateAttemptMade ? 'Immediate fetch failed' : null
        ]);

        logInfo({
          event_type: 'recording_queued_after_immediate',
          call_id: callData.call_id,
          lead_id: callData.lead_id,
          immediate_attempted: immediateAttemptMade,
          scheduled_for: scheduledFor.toISOString(),
          source: 'convoso'
        });
      } catch (err) {
        logError('Failed to queue recording', err, {
          call_id: callData.call_id,
          lead_id: callData.lead_id
        });
      }
    }

    // Update webhook log with success
    if (webhookLogId) {
      try {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, response_body = $2
          WHERE id = $3
        `, [200, {
          ok: true,
          call_id: callRecordId,
          immediate_fetch: immediateAttemptMade,
          recording_found: !!fetchedRecordingUrl
        }, webhookLogId]);
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }

    // Log the event
    logInfo({
      event_type: 'call_webhook_with_immediate',
      call_id: callData.call_id,
      lead_id: callData.lead_id,
      call_record_id: callRecordId,
      has_recording: !!fetchedRecordingUrl,
      immediate_attempt: immediateAttemptMade,
      agent_name: callData.agent_name,
      disposition: callData.disposition,
      duration: callData.duration,
      source: 'convoso'
    });

    return NextResponse.json({
      ok: true,
      type: 'call',
      call_id: callRecordId,
      has_recording: !!fetchedRecordingUrl,
      immediate_fetch_attempted: immediateAttemptMade
    });

  } catch (error: any) {
    logError('Call webhook with immediate fetch failed', error);

    if (webhookLogId) {
      try {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, error = $2
          WHERE id = $3
        `, [500, error.message, webhookLogId]);
      } catch (e) {
        // Ignore
      }
    }

    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint for status check
export async function GET(req: NextRequest) {
  try {
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE recording_url IS NOT NULL) as calls_with_recordings,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as recent_calls
      FROM calls
    `);

    const pendingStats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_pending,
        COUNT(*) FILTER (WHERE retry_phase = 'quick') as quick_phase,
        COUNT(*) FILTER (WHERE retry_phase = 'backoff') as backoff_phase,
        COUNT(*) FILTER (WHERE retry_phase = 'final') as final_phase
      FROM pending_recordings
      WHERE processed_at IS NULL
    `);

    return NextResponse.json({
      ok: true,
      endpoint: '/api/webhooks/convoso-calls-immediate',
      type: 'call webhook with immediate recording fetch',
      call_stats: stats,
      pending_recordings: pendingStats,
      features: {
        immediate_fetch: true,
        exponential_backoff: true,
        max_attempts: 12,
        max_wait_hours: 6
      }
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}