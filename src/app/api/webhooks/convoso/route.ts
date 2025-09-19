import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { logInfo, logError } from '@/lib/log';

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
  try {
    // Validate webhook
    if (!validateWebhook(req)) {
      logError('Invalid webhook secret');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Parse body
    const body = await req.json();

    // Map lead data according to spec
    const leadData = {
      lead_id: body.lead_id ?? body.id ?? null,
      phone_number: body.phone_number ?? body.phone ?? null,
      first_name: body.first_name ?? null,
      last_name: body.last_name ?? null,
      email: body.email ?? null,
      list_id: body.list_id ?? null,
      address: body.address1 ?? body.address ?? null,
      city: body.city ?? null,
      state: body.state ?? null
    };

    // Check if this looks like call data (warn but continue)
    const hasCallFields = !!(body.agent_name && body.disposition && body.duration);
    if (hasCallFields) {
      logInfo({
        event_type: 'lead_webhook_warning',
        message: 'Received call fields in lead webhook',
        lead_id: leadData.lead_id,
        has_agent: !!body.agent_name,
        has_disposition: !!body.disposition,
        source: 'convoso'
      });
    }

    // Upsert contact if we have a lead_id
    if (leadData.lead_id) {
      await db.upsert('contacts', leadData, 'lead_id');

      // Queue recording fetch if no recording_url present
      if (!body.recording_url) {
        try {
          await db.none(`
            INSERT INTO pending_recordings (lead_id, attempts, created_at)
            VALUES ($1, 0, NOW())
            ON CONFLICT DO NOTHING
          `, [leadData.lead_id]);
        } catch (err) {
          logError('Failed to queue recording', err, { lead_id: leadData.lead_id });
        }
      }
    }

    // Log the event
    logInfo({
      event_type: 'lead',
      lead_id: leadData.lead_id,
      has_recording: !!body.recording_url,
      phone_number: leadData.phone_number,
      source: 'convoso'
    });

    return NextResponse.json({ ok: true, type: 'lead' });

  } catch (error: any) {
    logError('Lead webhook failed', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// GET endpoint for status check
export async function GET(req: NextRequest) {
  try {
    const recentContacts = await db.manyOrNone(`
      SELECT COUNT(*) as count
      FROM contacts
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    return NextResponse.json({
      ok: true,
      endpoint: '/api/webhooks/convoso',
      type: 'lead/contact webhook',
      recent_contacts: recentContacts[0]?.count || 0
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}