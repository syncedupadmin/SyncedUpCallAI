import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CONVOSO_AUTH_TOKEN = process.env.CONVOSO_AUTH_TOKEN;
const CONVOSO_API_BASE = 'https://api.convoso.com/v1';

export async function POST(req: NextRequest) {
  // Initialize Supabase client inside the function to avoid build-time errors
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Supabase configuration missing' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    const body = await req.json();
    const { startDate, endDate, limit = 10, processTranscription = false } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Format dates for Convoso API (YYYY-MM-DD HH:MM:SS)
    const formatDateTime = (date: string | Date) => {
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    console.log('[Manual Pull] Fetching recordings from', startDate, 'to', endDate);

    // Try different endpoints until we find one that works
    const endpoints = [
      '/lead/get-recordings',  // Singular - this worked before
      '/users/recordings',      // With user parameter
      '/leads/get-recordings'   // Plural version
    ];

    let successfulResponse = null;
    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const params = new URLSearchParams({
          auth_token: CONVOSO_AUTH_TOKEN!,
          start_time: formatDateTime(startDate),
          end_time: formatDateTime(endDate),
          limit: String(limit),
          offset: '0'
        });

        // Add user parameter for /users endpoint
        if (endpoint.includes('/users/')) {
          params.append('user', '*');
        }

        const url = `${CONVOSO_API_BASE}${endpoint}?${params.toString()}`;
        console.log(`[Manual Pull] Trying endpoint: ${endpoint}`);

        const response = await fetch(url);
        const data = await response.json();

        if (data.success !== false) {
          console.log(`[Manual Pull] Success with endpoint: ${endpoint}`);
          successfulResponse = { endpoint, data };
          break;
        }
        lastError = data.error || data.message || 'API returned failure';
      } catch (error: any) {
        lastError = error.message;
        console.error(`[Manual Pull] Failed with ${endpoint}:`, error.message);
      }
    }

    if (!successfulResponse) {
      return NextResponse.json(
        { error: `All endpoints failed. Last error: ${lastError}` },
        { status: 500 }
      );
    }

    const { data } = successfulResponse;

    // Handle different response structures
    const recordings = data.data?.entries || data.entries || data.recordings || [];

    console.log(`[Manual Pull] Found ${recordings.length} recordings`);

    const processedCalls = [];

    for (const recording of recordings) {
      try {
        // Map recording data to our call structure
        const callData = {
          call_id: recording.recording_id ?
            `convoso_rec_${recording.recording_id}` :
            `convoso_${Date.now()}_${Math.random()}`,
          convoso_lead_id: String(recording.lead_id || recording.id),
          agent_name: recording.agent_name || recording.agent || 'Unknown Agent',
          agent_email: recording.email || recording.agent_email || null,
          disposition: recording.disposition || 'RECORDED',
          duration: recording.seconds || recording.duration || 0,
          phone_number: recording.phone_number || recording.phone || 'Unknown',
          recording_url: recording.url || recording.recording_url || recording.recording,
          campaign: recording.campaign || 'Unknown',
          started_at: recording.start_time || recording.call_start || new Date().toISOString(),
          ended_at: recording.end_time || recording.call_end || new Date().toISOString(),
          office_id: 1,
          talk_time_sec: parseInt(recording.talk_time || '0'),
          source: 'convoso_manual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            recording_id: recording.recording_id,
            original_url: recording.url,
            manual_pull: true,
            pull_date: new Date().toISOString()
          }
        };

        // Insert or update call in database
        const { data: insertedCall, error: callError } = await supabase
          .from('calls')
          .upsert(callData, {
            onConflict: 'call_id',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (callError) {
          console.error(`[Manual Pull] Error saving call:`, callError);
          continue;
        }

        // If processTranscription is true and we have a recording URL, queue it
        if (processTranscription && callData.recording_url && insertedCall) {
          console.log(`[Manual Pull] Queueing transcription for call ${insertedCall.id}`);

          // Queue for transcription
          const { error: transcriptionError } = await supabase
            .from('transcription_queue')
            .insert({
              call_id: insertedCall.id,
              status: 'pending',
              priority: 1, // High priority for manual pulls
              created_at: new Date().toISOString(),
              metadata: {
                manual_pull: true,
                requested_at: new Date().toISOString()
              }
            });

          if (transcriptionError) {
            console.error(`[Manual Pull] Error queueing transcription:`, transcriptionError);
          } else {
            // Trigger immediate processing
            try {
              const processResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/transcription/process`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-admin-secret': process.env.ADMIN_SECRET || 'dev-secret'
                },
                body: JSON.stringify({ callId: insertedCall.id })
              });

              if (processResponse.ok) {
                console.log(`[Manual Pull] Transcription processing triggered for call ${insertedCall.id}`);
                insertedCall.transcription_status = 'processing';
              }
            } catch (error) {
              console.error('[Manual Pull] Failed to trigger transcription:', error);
            }
          }
        }

        processedCalls.push({
          ...callData,
          id: insertedCall?.id,
          transcription_queued: processTranscription && callData.recording_url
        });

      } catch (error: any) {
        console.error(`[Manual Pull] Error processing recording:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      endpoint: successfulResponse.endpoint,
      recordings_found: recordings.length,
      calls_processed: processedCalls.length,
      calls: processedCalls,
      time_range: {
        start: formatDateTime(startDate),
        end: formatDateTime(endDate)
      }
    });

  } catch (error: any) {
    console.error('[Manual Pull] Fatal error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}