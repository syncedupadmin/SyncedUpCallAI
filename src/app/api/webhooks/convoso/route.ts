import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Queue recording fetch for later processing
async function queueRecordingFetch(callId: string, callData: any) {
  // Skip if pending_recordings table doesn't exist
  return;
  
  /* Disabled until migration is run
  try {
    // Schedule for 2 minutes from now
    const scheduledFor = new Date(Date.now() + 2 * 60 * 1000);
    
    await db.none(`
      INSERT INTO pending_recordings (
        call_id,
        lead_id,
        convoso_call_id,
        agent_id,
        agent_name,
        campaign,
        scheduled_for,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (call_id) DO UPDATE SET
        scheduled_for = EXCLUDED.scheduled_for,
        attempts = 0,
        processed = FALSE,
        updated_at = NOW()
    `, [
      callId,
      callData.lead_id,
      callData.convoso_call_id,
      callData.agent_id,
      callData.agent_name,
      callData.campaign,
      scheduledFor,
      JSON.stringify(callData)
    ]);
    
    console.log(`Queued recording fetch for call ${callId} at ${scheduledFor.toISOString()}`);
  } catch (error) {
    console.error('Error queueing recording fetch:', error);
  }
  */
}

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
      type: body.disposition || body.duration ? 'call' : 'lead',
      body: body
    });
    
    // 1) Derive ONE canonical callId and stick to it
    const callId = 
      body.call_id || 
      body.convoso_call_id || 
      body.CallID ||
      body.id || 
      crypto.randomUUID();
    
    // 2) Determine if this is lead-only data (no call information)
    const isLeadOnly = 
      !body.disposition && 
      !body.duration && 
      !body.duration_sec &&
      !body.recording_url && 
      !body.call_id && 
      !body.convoso_call_id &&
      !body.CallID &&
      !body.call_duration;
    
    // Extract data from the webhook payload
    const callData = {
      call_id: callId, // Use the canonical ID
      lead_id: body.lead_id || body.LeadID || body.lead?.id,
      convoso_call_id: body.convoso_call_id || body.CallID || body.call_id,
      agent_id: body.agent_id || body.UserID || body.user_id || body.agent?.id,
      agent_name: body.agent_name || body.user || body.User || body.agent?.name || body.agent,
      agent_email: body.agent_email || body.user_email || body.agent?.email,
      phone_number: body.phone_number || body.customer_phone || body.phone || body.PhoneNumber,
      campaign: body.campaign || body.campaign_name || body.Campaign,
      disposition: body.disposition || body.call_disposition || body.Disposition,
      direction: body.direction || body.call_direction || body.Direction || 'outbound',
      duration: body.duration || body.duration_sec || body.call_duration || body.Duration,
      recording_url: body.recording_url || body.recording || body.call_recording || body.RecordingURL,
      started_at: body.started_at || body.start_time || body.call_start || body.StartTime,
      ended_at: body.ended_at || body.end_time || body.call_end || body.EndTime,
      notes: body.notes || body.call_notes || body.Notes,
      // Store the complete raw webhook data
      raw_data: body
    };
    
    // Store in database with error handling
    try {
      // 3) Upsert agent if we have agent info
      let agentId: string | null = null;
      if (callData.agent_id || callData.agent_name) {
        try {
          const agentResult = await db.oneOrNone(`
            INSERT INTO agents (id, ext_ref, name, team, active)
            VALUES (gen_random_uuid(), $1, $2, 'convoso', true)
            ON CONFLICT (ext_ref) DO UPDATE SET
              name = COALESCE(EXCLUDED.name, agents.name),
              active = true
            RETURNING id
          `, [
            callData.agent_id || callData.agent_name,
            callData.agent_name || callData.agent_id
          ]);
          agentId = agentResult?.id ?? null;
        } catch (agentError) {
          console.log('Could not create/update agent:', agentError);
        }
      }

      // 4) Only insert into calls table when it's actually call data (not lead-only)
      if (!isLeadOnly) {
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
            agent_id,
            agent_name,
            agent_email,
            lead_id,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (id) DO UPDATE SET
            recording_url = COALESCE(EXCLUDED.recording_url, calls.recording_url),
            disposition = COALESCE(EXCLUDED.disposition, calls.disposition),
            duration_sec = COALESCE(EXCLUDED.duration_sec, calls.duration_sec),
            ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
            agent_id = COALESCE(EXCLUDED.agent_id, calls.agent_id),
            agent_name = COALESCE(EXCLUDED.agent_name, calls.agent_name),
            agent_email = COALESCE(EXCLUDED.agent_email, calls.agent_email),
            metadata = COALESCE(EXCLUDED.metadata, calls.metadata),
            updated_at = NOW()
        `, [
          callId, // Use the canonical ID
          'convoso',
          callData.convoso_call_id || callId,
          callData.campaign || null,
          callData.disposition || null,
          callData.direction,
          callData.started_at || new Date().toISOString(),
          callData.ended_at || new Date().toISOString(),
          callData.duration || null,
          callData.recording_url || null,
          agentId,
          callData.agent_name || null,
          callData.agent_email || null,
          callData.lead_id || null,
          JSON.stringify(callData.raw_data)
        ]);
        
        console.log('Call saved successfully:', callId);
        
        // Queue recording fetch if no recording URL present
        if (!callData.recording_url) {
          await queueRecordingFetch(callId, callData);
        }
      } else {
        console.log('Lead-only data received, skipping call insert:', callId);
      }
      
      // 5) Always capture the raw payload as an event, using safe function that ensures call exists
      try {
        // Use the safe add_call_event function that ensures the call exists first
        await db.one(`
          SELECT public.add_call_event($1::uuid, $2::text, $3::jsonb, NOW()) as event_id
        `, [
          callId, // Use the same canonical ID
          isLeadOnly ? 'lead_webhook_received' : 'webhook_received',
          JSON.stringify({
            agent_name: callData.agent_name,
            agent_email: callData.agent_email,
            lead_id: callData.lead_id,
            convoso_call_id: callData.convoso_call_id,
            phone_number: callData.phone_number,
            raw_data: callData.raw_data
          })
        ]);
      } catch (metaError) {
        console.log('Could not store event metadata:', metaError);
      }
      
    } catch (dbError: any) {
      console.error('Database error:', dbError);
      // Continue even if database fails - don't break the webhook
    }
    
    // Return success to Convoso with the canonical callId
    return NextResponse.json({
      ok: true,
      message: isLeadOnly ? 'Lead data processed successfully' : 'Webhook processed successfully',
      call_id: callId,
      type: isLeadOnly ? 'lead' : 'call'
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

// Handle GET requests to show recent calls and pending recordings
export async function GET(req: NextRequest) {
  try {
    // Get recent calls
    const recentCalls = await db.manyOrNone(`
      SELECT 
        c.id,
        c.source,
        c.campaign,
        c.disposition,
        c.agent_id,
        a.name as agent_name,
        c.recording_url,
        c.started_at
      FROM calls c
      LEFT JOIN agents a ON a.id = c.agent_id
      WHERE c.source = 'convoso'
      ORDER BY c.started_at DESC 
      LIMIT 10
    `);
    
    // Get pending recordings (only if table exists)
    let pendingRecordings = [];
    try {
      pendingRecordings = await db.manyOrNone(`
        SELECT 
          pr.id,
          pr.call_id,
          pr.lead_id,
          pr.agent_name,
          pr.scheduled_for,
          pr.attempts,
          pr.processed,
          pr.error_message
        FROM pending_recordings pr
        WHERE pr.processed = FALSE
        ORDER BY pr.scheduled_for ASC
        LIMIT 10
      `);
    } catch (error) {
      console.log('pending_recordings table not found');
    }
    
    return NextResponse.json({
      ok: true,
      message: 'Convoso webhook endpoint status',
      timestamp: new Date().toISOString(),
      recent_calls: recentCalls,
      pending_recordings: pendingRecordings,
      stats: {
        total_recent_calls: recentCalls.length,
        pending_recordings_count: pendingRecordings.length
      }
    });
  } catch (error: any) {
    console.error('Error fetching status:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}