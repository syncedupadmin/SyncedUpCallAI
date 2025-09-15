import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

// Simple echo endpoint to capture and log webhook data
export async function POST(req: NextRequest) {
  const timestamp = new Date().toISOString();

  try {
    // Capture all headers
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Get the raw body
    const bodyText = await req.text();
    let bodyParsed: any = null;

    try {
      bodyParsed = JSON.parse(bodyText);
    } catch {
      // Not JSON, that's ok
    }

    const webhookData = {
      timestamp,
      url: req.url,
      method: req.method,
      headers,
      bodyRaw: bodyText,
      bodyParsed,
      source: headers['user-agent'] || 'unknown'
    };

    // Log to console for immediate visibility
    console.log('[ECHO WEBHOOK] Received:', JSON.stringify(webhookData, null, 2));

    // Try to store in database for later analysis
    try {
      await db.none(`
        INSERT INTO call_events (call_id, type, payload, at)
        VALUES (
          '00000000-0000-0000-0000-000000000000'::uuid,
          'webhook_echo',
          $1::jsonb,
          NOW()
        )
      `, [JSON.stringify(webhookData)]);

      console.log('[ECHO WEBHOOK] Stored in database');
    } catch (dbError) {
      console.error('[ECHO WEBHOOK] Database storage failed:', dbError);
    }

    // Return the data back to caller
    return NextResponse.json({
      ok: true,
      message: 'Webhook received and logged',
      timestamp,
      received: {
        headers: Object.keys(headers).length,
        bodySize: bodyText.length,
        isJson: !!bodyParsed,
        sample: bodyParsed ? {
          lead_id: bodyParsed.lead_id,
          phone: bodyParsed.phone_number || bodyParsed.customer_phone,
          agent: bodyParsed.agent_name,
          disposition: bodyParsed.disposition
        } : null
      }
    });

  } catch (error: any) {
    console.error('[ECHO WEBHOOK] Error:', error);

    // Still return success to prevent retries
    return NextResponse.json({
      ok: true,
      message: 'Webhook received with error',
      error: error.message,
      timestamp
    });
  }
}

// GET endpoint to check recent echo webhooks
export async function GET(req: NextRequest) {
  try {
    // Get recent echo webhooks from database
    const recentEchoes = await db.manyOrNone(`
      SELECT
        id,
        payload,
        at as timestamp
      FROM call_events
      WHERE type = 'webhook_echo'
        AND call_id = '00000000-0000-0000-0000-000000000000'::uuid
      ORDER BY at DESC
      LIMIT 10
    `);

    return NextResponse.json({
      ok: true,
      message: 'Recent echo webhooks',
      count: recentEchoes.length,
      webhooks: recentEchoes.map(w => ({
        id: w.id,
        timestamp: w.timestamp,
        data: w.payload
      }))
    });

  } catch (error: any) {
    console.error('[ECHO WEBHOOK] GET error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}