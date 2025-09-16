import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute max execution time

// Verify cron secret for security
function verifyCronSecret(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow manual trigger in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  if (!cronSecret || !authHeader) {
    return false;
  }
  
  return authHeader === `Bearer ${cronSecret}`;
}

// Fetch recording from Convoso API (with optional user email)
async function fetchConvosoRecording(leadId: string, userEmail?: string): Promise<any> {
  const authToken = process.env.CONVOSO_AUTH_TOKEN;

  if (!authToken) {
    throw new Error('CONVOSO_AUTH_TOKEN not configured');
  }

  try {
    // Try the user recordings endpoint if we have an email
    if (userEmail) {
      console.log(`[PROCESS-RECORDINGS] Fetching recordings for user: ${userEmail}, lead: ${leadId}`);

      const requestBody = {
        auth_token: authToken,
        user: userEmail,
        limit: 100 // Limit to 100 recordings
      };

      const recordingsUrl = 'https://api.convoso.com/v1/users/get-recordings';
      const recordingsResponse = await fetch(recordingsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      if (!recordingsResponse.ok) {
        console.warn(`User recordings API failed: ${recordingsResponse.status}, falling back to lead API`);
      } else {
        const recordingsData = await recordingsResponse.json();

        // Extract recordings array
        const recordings = Array.isArray(recordingsData) ? recordingsData :
                          (recordingsData.recordings || recordingsData.data || []);

        // Find recording for this specific lead_id
        const recording = recordings.find((r: any) =>
          r.lead_id === leadId ||
          r.LeadID === leadId ||
          r.callId?.includes(leadId)
        );

        if (recording) {
          const recordingUrl = recording.recording_url ||
                              recording.RecordingURL ||
                              recording.url ||
                              recording.file_name;

          return {
            recording_url: recordingUrl,
            recordings_data: recording
          };
        }
      }
    }

    // Fallback to original lead-based endpoint (using GET with query params)
    console.log(`[PROCESS-RECORDINGS] Using lead endpoint for lead: ${leadId}`);

    const recordingsParams = new URLSearchParams({
      auth_token: authToken,
      lead_id: leadId,
      limit: '10'  // Get up to 10 recordings for this lead
    });

    // Note: Using /v1/leads/get-recordings (plural "leads")
    const recordingsUrl = `https://api.convoso.com/v1/leads/get-recordings?${recordingsParams}`;
    const recordingsResponse = await fetch(recordingsUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!recordingsResponse.ok) {
      throw new Error(`Convoso API error: ${recordingsResponse.status}`);
    }

    const recordingsData = await recordingsResponse.json();

    // Extract recording URL from response (using correct format from docs)
    let recordingUrl = null;
    if (recordingsData.success && recordingsData.data?.entries?.length > 0) {
      const recording = recordingsData.data.entries[0];
      // The URL field contains the recording file path
      recordingUrl = recording.url;

      // If it's just a filename, we might need to construct full URL
      if (recordingUrl && !recordingUrl.startsWith('http')) {
        // This might need a base URL from Convoso
        console.log(`[PROCESS-RECORDINGS] Recording filename: ${recordingUrl}`);
      }
    }

    return {
      recording_url: recordingUrl,
      recordings_data: recordingsData
    };
  } catch (error) {
    console.error('Error fetching Convoso recording:', error);
    throw error;
  }
}

// Fetch agent information from Convoso API
async function fetchConvosoAgentInfo(callId: string, agentId?: string): Promise<any> {
  const authToken = process.env.CONVOSO_AUTH_TOKEN;
  
  if (!authToken) {
    return null;
  }
  
  try {
    // Search call logs for agent information
    const callLogParams = new URLSearchParams({
      auth_token: authToken,
      call_id: callId
    });
    
    // If we have agent ID, add it to the search
    if (agentId) {
      callLogParams.append('user_id', agentId);
    }
    
    const callLogUrl = `https://api.convoso.com/v1/calllog/search?${callLogParams}`;
    const callLogResponse = await fetch(callLogUrl);
    
    if (!callLogResponse.ok) {
      console.error(`Convoso calllog API error: ${callLogResponse.status}`);
      return null;
    }
    
    const callLogData = await callLogResponse.json();
    
    // Extract agent information
    if (callLogData.calls && callLogData.calls.length > 0) {
      const call = callLogData.calls[0];
      return {
        agent_id: call.user_id || call.agent_id,
        agent_name: call.user_name || call.agent_name || call.user,
        agent_email: call.user_email || call.agent_email
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching Convoso agent info:', error);
    return null;
  }
}

// Process a single pending recording
async function processPendingRecording(recording: any): Promise<boolean> {
  try {
    console.log(`Processing recording for call ${recording.call_id}, lead ${recording.lead_id}`);

    // Extract agent email from metadata or agent_name if it's an email
    const agentEmail = recording.metadata?.agent_email ||
                      (recording.agent_name?.includes('@') ? recording.agent_name : null);

    // Fetch recording from Convoso (with email if available)
    const recordingData = await fetchConvosoRecording(recording.lead_id, agentEmail);
    
    // Fetch agent information if available
    let agentInfo = null;
    if (recording.convoso_call_id || recording.agent_id) {
      agentInfo = await fetchConvosoAgentInfo(
        recording.convoso_call_id,
        recording.agent_id
      );
    }
    
    // Update call with recording URL and agent info
    if (recordingData.recording_url || agentInfo) {
      await db.none(`
        UPDATE calls 
        SET 
          recording_url = COALESCE($1, recording_url),
          agent_id = COALESCE($2, agent_id),
          agent_name = COALESCE($3, agent_name),
          agent_email = COALESCE($4, agent_email),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{recording_fetch}',
            $5::jsonb
          ),
          updated_at = NOW()
        WHERE id = $6
      `, [
        recordingData.recording_url,
        agentInfo?.agent_id,
        agentInfo?.agent_name,
        agentInfo?.agent_email,
        JSON.stringify({
          fetched_at: new Date().toISOString(),
          recordings_data: recordingData.recordings_data,
          agent_info: agentInfo
        }),
        recording.call_id
      ]);
      
      // Mark as processed
      await db.none(`
        UPDATE pending_recordings
        SET 
          processed = TRUE,
          processed_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [recording.id]);
      
      console.log(`Successfully processed recording for call ${recording.call_id}`);
      return true;
    } else {
      // Recording not ready yet, schedule retry
      const nextAttempt = recording.attempts + 1;
      let nextSchedule;
      
      if (nextAttempt === 1) {
        // First retry: 2 minutes
        nextSchedule = new Date(Date.now() + 2 * 60 * 1000);
      } else if (nextAttempt <= 5) {
        // Subsequent retries: 5 minutes
        nextSchedule = new Date(Date.now() + 5 * 60 * 1000);
      } else {
        // Max attempts reached, mark as failed
        await db.none(`
          UPDATE pending_recordings
          SET 
            processed = TRUE,
            processed_at = NOW(),
            error_message = 'Max retry attempts reached - recording not available',
            updated_at = NOW()
          WHERE id = $1
        `, [recording.id]);
        
        console.log(`Max attempts reached for call ${recording.call_id}`);
        return false;
      }
      
      // Schedule retry
      await db.none(`
        UPDATE pending_recordings
        SET 
          attempts = $1,
          scheduled_for = $2,
          last_attempt_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
      `, [nextAttempt, nextSchedule, recording.id]);
      
      console.log(`Scheduled retry ${nextAttempt} for call ${recording.call_id} at ${nextSchedule.toISOString()}`);
      return false;
    }
  } catch (error: any) {
    console.error(`Error processing recording ${recording.id}:`, error);
    
    // Update error status
    await db.none(`
      UPDATE pending_recordings
      SET 
        attempts = attempts + 1,
        last_attempt_at = NOW(),
        error_message = $1,
        scheduled_for = CASE 
          WHEN attempts < 5 THEN NOW() + INTERVAL '5 minutes'
          ELSE scheduled_for
        END,
        processed = CASE 
          WHEN attempts >= 5 THEN TRUE
          ELSE FALSE
        END,
        updated_at = NOW()
      WHERE id = $2
    `, [error.message, recording.id]);
    
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret for production
    if (process.env.NODE_ENV === 'production' && !verifyCronSecret(req)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    console.log('Starting process-recordings cron job');
    
    // Get pending recordings that are due for processing
    const pendingRecordings = await db.manyOrNone(`
      SELECT 
        pr.*,
        c.metadata as call_metadata
      FROM pending_recordings pr
      JOIN calls c ON c.id = pr.call_id
      WHERE pr.processed = FALSE
        AND pr.scheduled_for <= NOW()
        AND pr.attempts < 5
      ORDER BY pr.scheduled_for ASC
      LIMIT 10
    `);
    
    console.log(`Found ${pendingRecordings.length} pending recordings to process`);
    
    const results = {
      processed: 0,
      failed: 0,
      retried: 0
    };
    
    // Process each recording
    for (const recording of pendingRecordings) {
      const success = await processPendingRecording(recording);
      if (success) {
        results.processed++;
      } else if (recording.attempts >= 4) {
        results.failed++;
      } else {
        results.retried++;
      }
    }
    
    console.log('Process-recordings cron job completed:', results);
    
    return NextResponse.json({
      ok: true,
      message: 'Recording processing completed',
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('Cron job error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}

// Allow manual trigger via GET for testing
export async function GET(req: NextRequest) {
  // In production, require proper auth
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Method not allowed in production' },
      { status: 405 }
    );
  }
  
  // Delegate to POST handler
  return POST(req);
}