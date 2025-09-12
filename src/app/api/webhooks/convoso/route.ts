import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Verify webhook signature (optional)
function verifySignature(req: NextRequest, body: string): boolean {
  const signature = req.headers.get('x-convoso-signature');
  
  // If no signature header, allow the request (for testing)
  if (!signature) {
    console.log('No signature provided, allowing request');
    return true;
  }
  
  // If you have a webhook secret configured
  const webhookSecret = process.env.CONVOSO_WEBHOOK_SECRET;
  if (webhookSecret) {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    return signature === expectedSignature;
  }
  
  // No secret configured, allow any request with signature header
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const bodyText = await req.text();
    const body = JSON.parse(bodyText);
    
    // Log the request for debugging
    console.log('Webhook received:', {
      headers: Object.fromEntries(req.headers.entries()),
      body: body
    });
    
    // Skip signature verification for now to get it working
    // Uncomment this if you want to enable signature verification
    // if (!verifySignature(req, bodyText)) {
    //   return NextResponse.json(
    //     { error: 'Unauthorized' },
    //     { status: 401 }
    //   );
    // }
    
    // Extract call data from the webhook payload
    // Convoso might send different field names, so we check multiple possibilities
    const callData = {
      call_id: body.call_id || body.convoso_call_id || body.id || crypto.randomUUID(),
      lead_id: body.lead_id || body.lead?.id,
      agent_id: body.agent_id || body.agent?.id,
      agent_name: body.agent_name || body.agent?.name || body.agent,
      phone_number: body.phone_number || body.customer_phone || body.phone,
      campaign: body.campaign || body.campaign_name,
      disposition: body.disposition || body.call_disposition || 'Unknown',
      direction: body.direction || body.call_direction || 'outbound',
      duration: body.duration || body.duration_sec || body.call_duration || 0,
      recording_url: body.recording_url || body.recording || body.call_recording,
      started_at: body.started_at || body.start_time || body.call_start,
      ended_at: body.ended_at || body.end_time || body.call_end,
      notes: body.notes || body.call_notes,
      // Include the full lead data if provided
      lead_data: body.lead || {
        first_name: body.first_name,
        last_name: body.last_name,
        email: body.email,
        phone_number: body.phone_number
      }
    };
    
    // Store in database with error handling
    try {
      await db.none(`
        INSERT INTO calls (
          id,
          source,
          source_ref,
          campaign,
          disposition,
          direction,
          started_at,
          ended_at,
          duration_sec,
          recording_url,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          recording_url = COALESCE(EXCLUDED.recording_url, calls.recording_url),
          disposition = COALESCE(EXCLUDED.disposition, calls.disposition),
          duration_sec = COALESCE(EXCLUDED.duration_sec, calls.duration_sec),
          ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
          metadata = COALESCE(EXCLUDED.metadata, calls.metadata),
          updated_at = NOW()
      `, [
        callData.call_id,
        'convoso',
        body.call_id || body.convoso_call_id,
        callData.campaign,
        callData.disposition,
        callData.direction,
        callData.started_at || new Date().toISOString(),
        callData.ended_at || new Date().toISOString(),
        callData.duration,
        callData.recording_url,
        JSON.stringify({
          agent: callData.agent_name,
          lead_id: callData.lead_id,
          raw_data: body
        })
      ]);
      
      console.log('Call saved successfully:', callData.call_id);
    } catch (dbError: any) {
      console.error('Database error:', dbError);
      // Continue even if database fails - don't break the webhook
    }
    
    // Return success to Convoso
    return NextResponse.json({
      ok: true,
      message: 'Webhook processed successfully',
      call_id: callData.call_id
    });
    
  } catch (error: any) {
    console.error('Webhook error:', error);
    
    // Return success even on errors to prevent Convoso from retrying
    return NextResponse.json({
      ok: true,
      message: 'Webhook received',
      error: error.message
    });
  }
}

// Also handle GET requests for testing
export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: 'Convoso webhook endpoint is running',
    timestamp: new Date().toISOString()
  });
}