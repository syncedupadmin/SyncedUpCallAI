import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { logInfo, logError } from '@/src/lib/log';

export const dynamic = 'force-dynamic';

// Validate webhook secret
function validateWebhook(req: NextRequest): boolean {
  const secret = req.headers.get('x-webhook-secret');
  if (secret && process.env.WEBHOOK_SECRET) {
    return secret === process.env.WEBHOOK_SECRET;
  }
  // Allow if no secret configured (for testing)
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // Validate webhook
    if (!validateWebhook(req)) {
      logError('Invalid webhook secret');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await req.json();

    // REQUIRE call fields
    if (!body.agent_name || !body.disposition || body.duration === undefined) {
      logError('Missing required call fields', null, {
        has_agent: !!body.agent_name,
        has_disposition: !!body.disposition,
        has_duration: body.duration !== undefined
      });
      return NextResponse.json({
        ok: false,
        error: 'Missing required fields: agent_name, disposition, duration'
      }, { status: 400 });
    }

    // Map call data according to spec
    const callData = {
      call_id: body.call_id ?? body.uniqueid ?? null,
      lead_id: body.lead_id ?? null,
      agent_name: body.agent_name,
      disposition: body.disposition,
      duration: Number(body.duration ?? 0),
      campaign: body.campaign ?? null,
      recording_url: body.recording_url ?? null
    };

    // Ensure we have an identifier
    if (!callData.call_id && !callData.lead_id) {
      logError('No call_id or lead_id provided');
      return NextResponse.json({
        ok: false,
        error: 'Either call_id or lead_id is required'
      }, { status: 400 });
    }

    // Upsert call
    const conflictKey = callData.call_id ? 'call_id' : 'lead_id';
    await db.upsert('calls', callData, conflictKey);

    // Queue recording fetch if no recording_url
    if (!callData.recording_url) {
      try {
        await db.none(`
          INSERT INTO pending_recordings (call_id, lead_id, attempts, created_at)
          VALUES ($1, $2, 0, NOW())
          ON CONFLICT DO NOTHING
        `, [callData.call_id, callData.lead_id]);
      } catch (err) {
        logError('Failed to queue recording', err, {
          call_id: callData.call_id,
          lead_id: callData.lead_id
        });
      }
    }

    // Log the event
    logInfo({
      event_type: 'call',
      call_id: callData.call_id,
      lead_id: callData.lead_id,
      has_recording: !!callData.recording_url,
      agent_name: callData.agent_name,
      disposition: callData.disposition,
      duration: callData.duration,
      source: 'convoso'
    });

    return NextResponse.json({ ok: true, type: 'call' });

  } catch (error: any) {
    logError('Call webhook failed', error);
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