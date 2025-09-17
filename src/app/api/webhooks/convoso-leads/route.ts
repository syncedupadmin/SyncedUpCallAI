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
  // Allow if no secret configured OR no secret sent by Convoso
  return true;
}

export async function POST(req: NextRequest) {
  let webhookLogId: number | null = null;

  try {
    // Validate webhook
    if (!validateWebhook(req)) {
      logError('Invalid webhook secret for lead webhook');
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const bodyText = await req.text();
    const body = JSON.parse(bodyText);

    // Log webhook for debugging (if webhook_logs table exists)
    try {
      const result = await db.oneOrNone(`
        INSERT INTO webhook_logs (endpoint, method, headers, body)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [
        '/api/webhooks/convoso-leads',
        'POST',
        Object.fromEntries(req.headers.entries()),
        body
      ]);
      webhookLogId = result?.id;
    } catch (e) {
      // Table might not exist yet, continue
    }

    // Map lead data - be flexible with field names
    const leadData = {
      lead_id: body.lead_id || body.owner_id || body.created_by || body.id || null,
      phone_number: body.phone_number || body.phone || null,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      email: body.email || null,
      address: body.address || body.address1 || null,
      city: body.city || null,
      state: body.state || null,
      list_id: body.list_id || null
    };

    // Validate we have at least some identifying information
    if (!leadData.lead_id && !leadData.phone_number && !leadData.email) {
      logError('Lead webhook missing all identifiers', null, { body });
      return NextResponse.json({
        ok: false,
        error: 'Missing required fields: need at least lead_id, phone_number, or email'
      }, { status: 400 });
    }

    // Upsert contact data
    let contactId = null;
    if (leadData.lead_id || leadData.phone_number) {
      // Use lead_id as primary key if available, otherwise use phone_number
      const upsertKey = leadData.lead_id ? 'lead_id' : 'phone_number';
      const upsertValue = leadData.lead_id || leadData.phone_number;

      const result = await db.oneOrNone(`
        INSERT INTO contacts (lead_id, phone_number, first_name, last_name, email, address, city, state, list_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (${upsertKey})
        DO UPDATE SET
          phone_number = COALESCE(EXCLUDED.phone_number, contacts.phone_number),
          first_name = COALESCE(EXCLUDED.first_name, contacts.first_name),
          last_name = COALESCE(EXCLUDED.last_name, contacts.last_name),
          email = COALESCE(EXCLUDED.email, contacts.email),
          address = COALESCE(EXCLUDED.address, contacts.address),
          city = COALESCE(EXCLUDED.city, contacts.city),
          state = COALESCE(EXCLUDED.state, contacts.state),
          list_id = COALESCE(EXCLUDED.list_id, contacts.list_id),
          updated_at = NOW()
        RETURNING id
      `, [
        leadData.lead_id,
        leadData.phone_number,
        leadData.first_name,
        leadData.last_name,
        leadData.email,
        leadData.address,
        leadData.city,
        leadData.state,
        leadData.list_id
      ]);

      contactId = result?.id;
    }

    // Update webhook log with success
    if (webhookLogId) {
      try {
        await db.none(`
          UPDATE webhook_logs
          SET response_status = $1, response_body = $2
          WHERE id = $3
        `, [200, { ok: true, contact_id: contactId }, webhookLogId]);
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }

    // Log the event
    logInfo({
      event_type: 'lead_webhook',
      lead_id: leadData.lead_id,
      phone_number: leadData.phone_number,
      contact_id: contactId,
      source: 'convoso'
    });

    return NextResponse.json({
      ok: true,
      message: 'Lead data saved',
      type: 'lead',
      contact_id: contactId,
      lead: {
        lead_id: leadData.lead_id,
        name: `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() || null,
        phone: leadData.phone_number,
        email: leadData.email
      }
    });

  } catch (error: any) {
    logError('Lead webhook failed', error);

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

    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// GET endpoint to check status
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Convoso leads webhook endpoint',
    description: 'This endpoint receives lead/contact data from Convoso',
    timestamp: new Date().toISOString()
  });
}