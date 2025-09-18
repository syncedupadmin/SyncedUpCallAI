import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { logInfo, logError } from '@/src/lib/log';

export const dynamic = 'force-dynamic';

// Validate webhook secret
function validateWebhook(req: NextRequest): boolean {
  const secret = req.headers.get('x-webhook-secret');
  if (secret && process.env.CONVOSO_WEBHOOK_SECRET) {
    return secret === process.env.CONVOSO_WEBHOOK_SECRET;
  }
  // Allow if no secret configured (for testing)
  return true;
}

export async function POST(req: NextRequest) {
  let webhookLogId: number | null = null;

  try {
    // Validate webhook
    if (!validateWebhook(req)) {
      logError('Invalid webhook secret for call webhook');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    // Log webhook for debugging (if webhook_logs table exists)
    try {
      const result = await db.oneOrNone(`
        INSERT INTO webhook_logs (endpoint, method, headers, body)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [
        '/api/webhooks/convoso-calls',
        'POST',
        Object.fromEntries(req.headers.entries()),
        body
      ]);
      webhookLogId = result?.id;
    } catch (e) {
      // Table might not exist yet, continue
    }

    // Map call data - be flexible with field names
    const callData = {
      call_id: body.call_id || body.uniqueid || body.id || null,
      lead_id: body.lead_id || body.owner_id || null,
      agent_name: body.agent_name || body.agent || null,
      phone_number: body.phone_number || body.phone || body.customer_phone || null,
      disposition: body.disposition || body.status || null,
      duration_sec: body.duration !== undefined ? Number(body.duration) : null,
      campaign: body.campaign || body.campaign_name || null,
      recording_url: body.recording_url || body.recording || null,
      started_at: body.started_at || body.start_time || null,
      ended_at: body.ended_at || body.end_time || null
    };

    // Validate required fields for a call record
    if (!callData.agent_name || !callData.disposition || callData.duration_sec === null) {
      logError('Missing required call fields', null, {
        has_agent: !!callData.agent_name,
        has_disposition: !!callData.disposition,
        has_duration: callData.duration_sec !== null,
        body
      });

      // Update webhook log with error
      if (webhookLogId) {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, error = $2
          WHERE id = $3
        `, [400, 'Missing required fields', webhookLogId]).catch(() => {});
      }

      return NextResponse.json({
        ok: false,
        error: 'Missing required fields: agent_name, disposition, duration'
      }, { status: 400 });
    }

    // Ensure we have an identifier
    if (!callData.call_id && !callData.lead_id) {
      logError('No call_id or lead_id provided', null, { body });

      if (webhookLogId) {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, error = $2
          WHERE id = $3
        `, [400, 'Missing identifier', webhookLogId]).catch(() => {});
      }

      return NextResponse.json({
        ok: false,
        error: 'Either call_id or lead_id is required'
      }, { status: 400 });
    }

    // Try to link to existing contact if we have a lead_id
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

    // Upsert call record
    const result = await db.oneOrNone(`
      INSERT INTO calls (
        call_id, lead_id, agent_name, phone_number, disposition,
        duration_sec, campaign, recording_url, started_at, ended_at,
        contact_id, office_id, source, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (call_id) WHERE call_id IS NOT NULL
      DO UPDATE SET
        lead_id = COALESCE(EXCLUDED.lead_id, calls.lead_id),
        agent_name = EXCLUDED.agent_name,
        phone_number = COALESCE(EXCLUDED.phone_number, calls.phone_number),
        disposition = EXCLUDED.disposition,
        duration_sec = EXCLUDED.duration_sec,
        campaign = COALESCE(EXCLUDED.campaign, calls.campaign),
        recording_url = COALESCE(EXCLUDED.recording_url, calls.recording_url),
        started_at = COALESCE(EXCLUDED.started_at, calls.started_at),
        ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
        contact_id = COALESCE(EXCLUDED.contact_id, calls.contact_id),
        office_id = COALESCE(calls.office_id, 1)
      RETURNING id
    `, [
      callData.call_id,
      callData.lead_id,
      callData.agent_name,
      callData.phone_number,
      callData.disposition,
      callData.duration_sec,
      callData.campaign,
      callData.recording_url,
      callData.started_at,
      callData.ended_at,
      contactId,
      1, // Default office_id
      'convoso'
    ]);

    const callRecordId = result?.id;

    // Queue recording fetch if no recording_url
    if (!callData.recording_url && (callData.call_id || callData.lead_id)) {
      try {
        // Determine if call has ended and calculate smart scheduling
        const callHasEnded = !!(callData.ended_at || (callData.duration_sec && callData.duration_sec > 0));
        const callStartTime = callData.started_at ? new Date(callData.started_at) : new Date();
        const callEndTime = callData.ended_at ? new Date(callData.ended_at) : null;

        let scheduledFor;
        let estimatedEndTime = null;

        if (callHasEnded) {
          // Call has ended, try to fetch recording immediately
          scheduledFor = new Date(); // Schedule for immediate processing
        } else {
          // Call is ongoing, estimate when it might end
          // Use average call duration of 5 minutes as default estimate
          const avgCallDurationMinutes = 5;
          estimatedEndTime = new Date(callStartTime.getTime() + (avgCallDurationMinutes * 60 * 1000));

          // Schedule first attempt 2 minutes after estimated end
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
            retry_phase
          )
          VALUES ($1, $2, 0, NOW(), $3, $4, $5, $6, 'quick')
          ON CONFLICT DO NOTHING
        `, [
          callData.call_id,
          callData.lead_id,
          scheduledFor,
          callStartTime,
          callEndTime,
          estimatedEndTime
        ]);

        logInfo({
          event_type: 'recording_queued',
          call_id: callData.call_id,
          lead_id: callData.lead_id,
          call_has_ended: callHasEnded,
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
        `, [200, { ok: true, call_id: callRecordId }, webhookLogId]);
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }

    // Log the event
    logInfo({
      event_type: 'call_webhook',
      call_id: callData.call_id,
      lead_id: callData.lead_id,
      call_record_id: callRecordId,
      has_recording: !!callData.recording_url,
      agent_name: callData.agent_name,
      disposition: callData.disposition,
      duration_sec: callData.duration_sec,
      source: 'convoso'
    });

    return NextResponse.json({
      ok: true,
      type: 'call',
      call_id: callRecordId,
      message: 'Call data saved'
    });

  } catch (error: any) {
    logError('Call webhook failed', error);

    // Update webhook log with error
    if (webhookLogId) {
      try {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, error = $2
          WHERE id = $3
        `, [500, error.message, webhookLogId]);
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }

    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// GET endpoint for status check
export async function GET(req: NextRequest) {
  try {
    const recentCalls = await db.manyOrNone(`
      SELECT COUNT(*) as count
      FROM calls
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    return NextResponse.json({
      ok: true,
      endpoint: '/api/webhooks/convoso-calls',
      type: 'call event webhook',
      recent_calls: recentCalls[0]?.count || 0
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}