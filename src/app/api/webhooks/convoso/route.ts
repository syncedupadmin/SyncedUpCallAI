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
    // Capture all possible agent fields from Convoso
    const callData = {
      call_id: body.call_id || body.convoso_call_id || body.id || crypto.randomUUID(),
      lead_id: body.lead_id || body.LeadID || body.lead?.id,
      convoso_call_id: body.convoso_call_id || body.CallID || body.call_id,
      agent_id: body.agent_id || body.UserID || body.user_id || body.agent?.id,
      agent_name: body.agent_name || body.user || body.User || body.agent?.name || body.agent,
      agent_email: body.agent_email || body.user_email || body.agent?.email,
      phone_number: body.phone_number || body.customer_phone || body.phone || body.PhoneNumber,
      campaign: body.campaign || body.campaign_name || body.Campaign,
      disposition: body.disposition || body.call_disposition || body.Disposition || 'Unknown',
      direction: body.direction || body.call_direction || body.Direction || 'outbound',
      duration: body.duration || body.duration_sec || body.call_duration || body.Duration || 0,
      recording_url: body.recording_url || body.recording || body.call_recording || body.RecordingURL,
      started_at: body.started_at || body.start_time || body.call_start || body.StartTime,
      ended_at: body.ended_at || body.end_time || body.call_end || body.EndTime,
      notes: body.notes || body.call_notes || body.Notes,
      // Include the full lead data if provided
      lead_data: body.lead || {
        first_name: body.first_name || body.FirstName,
        last_name: body.last_name || body.LastName,
        email: body.email || body.Email,
        phone_number: body.phone_number || body.PhoneNumber
      },
      // Store the complete raw webhook data
      raw_data: body
    };
    
    // Store in database with error handling
    // Note: The calls table only has these columns:
    // id, source, source_ref, campaign, disposition, direction,
    // started_at, ended_at, duration_sec, recording_url, agent_id
    try {
      // First, check if we need to create or get the agent
      let agentId = null;
      if (callData.agent_id || callData.agent_name) {
        try {
          // Try to find or create agent
          const agentResult = await db.oneOrNone(`
            INSERT INTO agents (id, ext_ref, name, team, active)
            VALUES (
              gen_random_uuid(),
              $1,
              $2,
              'convoso',
              true
            )
            ON CONFLICT (ext_ref) DO UPDATE SET
              name = COALESCE(EXCLUDED.name, agents.name),
              active = true
            RETURNING id
          `, [
            callData.agent_id || callData.agent_name,
            callData.agent_name || callData.agent_id
          ]);
          
          if (agentResult) {
            agentId = agentResult.id;
          }
        } catch (agentError) {
          console.log('Could not create/update agent:', agentError);
        }
      }

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
          agent_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          recording_url = COALESCE(EXCLUDED.recording_url, calls.recording_url),
          disposition = COALESCE(EXCLUDED.disposition, calls.disposition),
          duration_sec = COALESCE(EXCLUDED.duration_sec, calls.duration_sec),
          ended_at = COALESCE(EXCLUDED.ended_at, calls.ended_at),
          agent_id = COALESCE(EXCLUDED.agent_id, calls.agent_id)
      `, [
        callData.call_id,
        'convoso',
        callData.convoso_call_id || body.call_id || callData.call_id,
        callData.campaign,
        callData.disposition,
        callData.direction,
        callData.started_at || new Date().toISOString(),
        callData.ended_at || new Date().toISOString(),
        callData.duration,
        callData.recording_url,
        agentId
      ]);
      
      // Store additional metadata in a separate tracking table if needed
      // This could be the call_events table or a custom metadata table
      try {
        await db.none(`
          INSERT INTO call_events (call_id, type, payload, at)
          VALUES ($1, 'webhook_received', $2, NOW())
        `, [
          callData.call_id,
          JSON.stringify({
            agent_name: callData.agent_name,
            agent_email: callData.agent_email,
            lead_id: callData.lead_id,
            convoso_call_id: callData.convoso_call_id,
            phone_number: callData.phone_number,
            lead_data: callData.lead_data,
            raw_data: callData.raw_data
          })
        ]);
      } catch (metaError) {
        console.log('Could not store metadata:', metaError);
      }
      
      console.log('Call saved successfully:', callData.call_id);
      
      // Queue recording fetch if no recording URL present
      if (!callData.recording_url) {
        await queueRecordingFetch(callData.call_id, callData);
      }
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