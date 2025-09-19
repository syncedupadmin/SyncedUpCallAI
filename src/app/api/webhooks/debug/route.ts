import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// Raw webhook logger - captures EVERYTHING
export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();
  const bodyText = await req.text();

  // Log the raw webhook immediately
  console.log('[WEBHOOK-DEBUG] Incoming webhook:', {
    timestamp,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
    bodyLength: bodyText.length,
    bodyPreview: bodyText.substring(0, 500)
  });

  let body: any = null;
  try {
    body = JSON.parse(bodyText);
  } catch (e) {
    console.error('[WEBHOOK-DEBUG] Failed to parse JSON:', e);
    body = { raw: bodyText };
  }

  // Save to database for analysis
  try {
    await db.none(`
      INSERT INTO call_events (
        call_id,
        type,
        payload,
        created_at
      ) VALUES (
        gen_random_uuid(),
        'webhook_debug',
        $1,
        NOW()
      )
    `, [JSON.stringify({
      timestamp,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries()),
      body: body,
      raw_body: bodyText
    })]);
  } catch (dbError) {
    console.error('[WEBHOOK-DEBUG] Failed to save to database:', dbError);
  }

  // Extract what we think are the important fields
  const extracted = {
    lead_id: body.lead_id || body.LeadID || body.lead?.id || null,
    agent_name: body.agent_name || body.user || body.User || body.agent?.name || null,
    phone_number: body.phone_number || body.customer_phone || body.phone ||
                  body.lead_phone || body.to_number || body.from_number ||
                  body.lead?.phone || null,
    campaign: body.campaign || body.campaign_name || body.Campaign || null,
    disposition: body.disposition || body.call_disposition || body.Disposition || null,
    duration: body.duration || body.duration_sec || body.call_duration || null,
    recording_url: body.recording_url || body.recording || body.call_recording || null
  };

  return NextResponse.json({
    ok: true,
    message: 'Webhook logged for debugging',
    timestamp,
    received: {
      field_count: Object.keys(body).length,
      fields: Object.keys(body)
    },
    extracted,
    body_sample: JSON.stringify(body).substring(0, 1000)
  });
}

// GET endpoint to view recent debug webhooks
export async function GET(req: NextRequest) {
  try {
    const debugLogs = await db.manyOrNone(`
      SELECT
        id,
        created_at,
        payload
      FROM call_events
      WHERE type = 'webhook_debug'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    const formatted = debugLogs.map(log => ({
      id: log.id,
      created_at: log.created_at,
      url: log.payload?.url,
      fields: log.payload?.body ? Object.keys(log.payload.body) : [],
      body: log.payload?.body
    }));

    return NextResponse.json({
      ok: true,
      count: formatted.length,
      recent_webhooks: formatted
    });
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}