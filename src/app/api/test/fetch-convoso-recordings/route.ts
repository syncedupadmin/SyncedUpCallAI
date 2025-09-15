import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

// Test endpoint to fetch recordings from Convoso API with 100-call limit
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await req.json();
    const {
      user_email,
      limit = 100, // Default to 100, max allowed
      dry_run = false // If true, fetch but don't save to DB
    } = body;

    // Validate inputs
    if (!user_email) {
      return NextResponse.json({
        ok: false,
        error: 'user_email is required'
      }, { status: 400 });
    }

    // Enforce maximum limit of 100
    const recordLimit = Math.min(limit, 100);

    console.log('[RECORDING FETCH TEST] Starting fetch:', {
      user_email,
      limit: recordLimit,
      dry_run,
      timestamp: new Date().toISOString()
    });

    // Get Convoso auth token from environment
    const authToken = process.env.CONVOSO_AUTH_TOKEN;
    if (!authToken) {
      console.error('[RECORDING FETCH TEST] Missing CONVOSO_AUTH_TOKEN');
      return NextResponse.json({
        ok: false,
        error: 'CONVOSO_AUTH_TOKEN not configured'
      }, { status: 500 });
    }

    // Prepare API request to Convoso
    const convosoUrl = 'https://secure.convoso.com/api/users/get-recordings';
    const requestBody = {
      auth_token: authToken,
      user: user_email,
      limit: recordLimit // Add limit to API request if supported
    };

    console.log('[RECORDING FETCH TEST] Calling Convoso API:', {
      url: convosoUrl,
      user: user_email,
      limit: recordLimit
    });

    // Call Convoso API
    const response = await fetch(convosoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    // Check response status
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[RECORDING FETCH TEST] Convoso API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });

      return NextResponse.json({
        ok: false,
        error: `Convoso API error: ${response.status} ${response.statusText}`,
        details: errorText
      }, { status: response.status });
    }

    // Parse response
    const data = await response.json();
    console.log('[RECORDING FETCH TEST] Convoso response received:', {
      recordCount: Array.isArray(data) ? data.length :
                   (data.recordings ? data.recordings.length : 0),
      hasData: !!data
    });

    // Extract recordings array (API might return array or object with recordings property)
    const recordings = Array.isArray(data) ? data :
                      (data.recordings || data.data || []);

    // Limit recordings to our maximum
    const limitedRecordings = recordings.slice(0, recordLimit);

    console.log('[RECORDING FETCH TEST] Processing recordings:', {
      total: recordings.length,
      processing: limitedRecordings.length,
      limited: recordings.length > recordLimit
    });

    // Process and save recordings (if not dry run)
    const results = {
      fetched: limitedRecordings.length,
      saved: 0,
      updated: 0,
      errors: 0,
      recordings: [] as any[]
    };

    for (const recording of limitedRecordings) {
      try {
        // Extract relevant fields from Convoso recording data
        const recordingData = {
          lead_id: recording.lead_id || recording.LeadID,
          call_id: recording.call_id || recording.CallID,
          recording_url: recording.recording_url || recording.RecordingURL || recording.url,
          agent_name: recording.agent_name || recording.AgentName,
          agent_email: recording.agent_email || recording.AgentEmail || user_email,
          duration: recording.duration || recording.Duration,
          start_time: recording.start_time || recording.StartTime,
          end_time: recording.end_time || recording.EndTime,
          disposition: recording.disposition || recording.Disposition,
          campaign: recording.campaign || recording.Campaign
        };

        // Add to results for response
        results.recordings.push({
          lead_id: recordingData.lead_id,
          recording_url: recordingData.recording_url,
          agent: recordingData.agent_name,
          duration: recordingData.duration
        });

        // Save to database if not dry run
        if (!dry_run && recordingData.recording_url) {
          // Check if we have a call record for this lead_id
          // Using source_ref column which should exist
          const existingCall = await db.oneOrNone(`
            SELECT id, recording_url
            FROM calls
            WHERE source_ref = $1
            LIMIT 1
          `, [recordingData.lead_id]);

          if (existingCall) {
            // Update existing call with recording URL
            if (!existingCall.recording_url) {
              await db.none(`
                UPDATE calls
                SET
                  recording_url = $2,
                  updated_at = NOW()
                WHERE id = $1
              `, [existingCall.id, recordingData.recording_url]);

              results.updated++;
              console.log('[RECORDING FETCH TEST] Updated call with recording:', {
                call_id: existingCall.id,
                lead_id: recordingData.lead_id
              });
            }
          } else {
            // Create new call record with recording
            // Using only columns that exist in the base schema
            await db.none(`
              INSERT INTO calls (
                id,
                source,
                source_ref,
                recording_url,
                agent_name,
                disposition,
                campaign,
                started_at,
                ended_at,
                duration_sec,
                created_at
              ) VALUES (
                gen_random_uuid(),
                'convoso',
                $1,
                $2,
                $3,
                $4,
                $5,
                $6::timestamptz,
                $7::timestamptz,
                $8,
                NOW()
              )
              ON CONFLICT (source_ref) DO UPDATE
              SET
                recording_url = EXCLUDED.recording_url,
                updated_at = NOW()
            `, [
              recordingData.lead_id,  // Using source_ref for lead_id
              recordingData.recording_url,
              recordingData.agent_name,
              recordingData.disposition,
              recordingData.campaign,
              recordingData.start_time,
              recordingData.end_time,
              recordingData.duration
            ]);

            results.saved++;
            console.log('[RECORDING FETCH TEST] Created new call with recording:', {
              lead_id: recordingData.lead_id
            });
          }

          // Remove from pending_recordings if exists
          await db.none(`
            UPDATE pending_recordings
            SET
              processed = true,
              processed_at = NOW(),
              error_message = NULL
            WHERE lead_id = $1 AND processed = false
          `, [recordingData.lead_id]);
        }
      } catch (recordError: any) {
        console.error('[RECORDING FETCH TEST] Error processing recording:', {
          error: recordError.message,
          recording
        });
        results.errors++;
      }
    }

    const elapsed = Date.now() - startTime;

    // Return results
    return NextResponse.json({
      ok: true,
      message: dry_run ? 'Dry run completed (no data saved)' : 'Recordings fetched and saved',
      user_email,
      limit: recordLimit,
      dry_run,
      results,
      execution_time_ms: elapsed,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[RECORDING FETCH TEST] Fatal error:', error);

    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

// GET endpoint to check test status
export async function GET(req: NextRequest) {
  try {
    // Get recent recordings from database
    const recentRecordings = await db.manyOrNone(`
      SELECT
        id,
        lead_id,
        convoso_lead_id,
        recording_url,
        agent_name,
        agent_email,
        created_at,
        updated_at
      FROM calls
      WHERE
        source = 'convoso'
        AND recording_url IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 10
    `);

    // Get pending recordings count
    const pendingCount = await db.one(`
      SELECT COUNT(*) as count
      FROM pending_recordings
      WHERE processed = false
    `);

    return NextResponse.json({
      ok: true,
      message: 'Recording fetch test endpoint status',
      recent_recordings: recentRecordings.length,
      pending_recordings: parseInt(pendingCount.count),
      latest_recordings: recentRecordings.map(r => ({
        id: r.id,
        lead_id: r.lead_id,
        has_recording: !!r.recording_url,
        agent: r.agent_name,
        created: r.created_at
      })),
      instructions: {
        endpoint: 'POST /api/test/fetch-convoso-recordings',
        required_params: {
          user_email: 'Agent email address'
        },
        optional_params: {
          limit: 'Max recordings to fetch (default 100, max 100)',
          dry_run: 'If true, fetch but do not save (default false)'
        },
        example: {
          user_email: 'agent@example.com',
          limit: 10,
          dry_run: true
        }
      }
    });

  } catch (error: any) {
    console.error('[RECORDING FETCH TEST] Status check error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}