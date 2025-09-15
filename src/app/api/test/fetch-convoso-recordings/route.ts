import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

// Test endpoint to fetch recordings from Convoso API
export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    // Parse request body
    const body = await req.json();
    const {
      user_email,
      lead_id,
      limit = 10, // Default to 10, max allowed 100
      dry_run = false // If true, fetch but don't save to DB
    } = body;

    // Validate inputs - need either user_email or lead_id
    if (!user_email && !lead_id) {
      return NextResponse.json({
        ok: false,
        error: 'Either user_email or lead_id is required'
      }, { status: 400 });
    }

    // Enforce maximum limit of 100
    const recordLimit = Math.min(limit, 100);

    console.log('[RECORDING FETCH TEST] Starting fetch:', {
      user_email,
      lead_id,
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

    let recordings = [];
    let apiResponse = null;

    // Method 1: Fetch by LEAD ID (documented GET endpoint)
    if (lead_id) {
      console.log(`[RECORDING FETCH TEST] Fetching by lead_id: ${lead_id}`);

      const params = new URLSearchParams({
        auth_token: authToken,
        lead_id: lead_id,
        limit: recordLimit.toString()
      });

      const url = `https://api.convoso.com/v1/lead/get-recordings?${params}`;
      console.log('[RECORDING FETCH TEST] GET request to:', url);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[RECORDING FETCH TEST] Lead API error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText
          });

          return NextResponse.json({
            ok: false,
            error: `Convoso Lead API error: ${response.status} ${response.statusText}`,
            details: errorText
          }, { status: response.status });
        }

        apiResponse = await response.json();

        // Parse response according to documented format
        if (apiResponse.success && apiResponse.data?.entries) {
          recordings = apiResponse.data.entries.map((entry: any) => ({
            recording_id: entry.recording_id,
            lead_id: entry.lead_id,
            recording_url: entry.url,
            start_time: entry.start_time,
            end_time: entry.end_time,
            duration: entry.seconds,
            source: 'lead_api'
          }));
        }

      } catch (fetchError: any) {
        console.error('[RECORDING FETCH TEST] Fetch error:', fetchError);
        return NextResponse.json({
          ok: false,
          error: 'Failed to connect to Convoso API',
          details: fetchError.message
        }, { status: 500 });
      }
    }

    // Method 2: Try various user endpoints (based on screenshots)
    else if (user_email) {
      console.log(`[RECORDING FETCH TEST] Fetching by user_email: ${user_email}`);

      // Try different possible endpoints for user recordings
      const endpoints = [
        // Possible endpoints based on the screenshots
        { url: 'https://api.convoso.com/api/users/get-recordings', method: 'POST' },
        { url: 'https://api.convoso.com/v1/users/recordings', method: 'POST' },
        { url: 'https://api.convoso.com/v1/user/recordings', method: 'GET' },
      ];

      for (const endpoint of endpoints) {
        console.log(`[RECORDING FETCH TEST] Trying ${endpoint.method} ${endpoint.url}`);

        try {
          let response;

          if (endpoint.method === 'POST') {
            // POST with JSON body
            response = await fetch(endpoint.url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                auth_token: authToken,
                user: user_email,
                limit: recordLimit
              })
            });
          } else {
            // GET with query params
            const params = new URLSearchParams({
              auth_token: authToken,
              user: user_email,
              limit: recordLimit.toString()
            });
            response = await fetch(`${endpoint.url}?${params}`, {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              }
            });
          }

          if (response.ok) {
            apiResponse = await response.json();
            console.log('[RECORDING FETCH TEST] Success with endpoint:', endpoint.url);

            // Try to parse various response formats
            if (Array.isArray(apiResponse)) {
              recordings = apiResponse;
            } else if (apiResponse.recordings) {
              recordings = apiResponse.recordings;
            } else if (apiResponse.data?.entries) {
              recordings = apiResponse.data.entries;
            } else if (apiResponse.data) {
              recordings = Array.isArray(apiResponse.data) ? apiResponse.data : [apiResponse.data];
            }

            // Normalize the recording format
            recordings = recordings.map((r: any) => ({
              recording_id: r.recording_id || r.id,
              lead_id: r.lead_id || r.LeadID,
              recording_url: r.url || r.recording_url || r.RecordingURL,
              start_time: r.start_time || r.StartTime,
              end_time: r.end_time || r.EndTime,
              duration: r.seconds || r.duration || r.Duration,
              source: 'user_api'
            }));

            break; // Found working endpoint
          } else {
            console.log(`[RECORDING FETCH TEST] Failed with ${response.status} for ${endpoint.url}`);
          }

        } catch (error: any) {
          console.log(`[RECORDING FETCH TEST] Error with ${endpoint.url}:`, error.message);
        }
      }

      if (recordings.length === 0) {
        return NextResponse.json({
          ok: false,
          error: 'Could not find working user recordings endpoint',
          hint: 'None of the known endpoints returned recordings. The API might have changed.'
        }, { status: 404 });
      }
    }

    // Limit recordings to our maximum
    const limitedRecordings = recordings.slice(0, recordLimit);

    console.log('[RECORDING FETCH TEST] Processing recordings:', {
      total: recordings.length,
      processing: limitedRecordings.length
    });

    // Process and save recordings (if not dry run)
    const results = {
      fetched: limitedRecordings.length,
      saved: 0,
      updated: 0,
      errors: 0,
      recordings: limitedRecordings
    };

    if (!dry_run) {
      for (const recording of limitedRecordings) {
        if (!recording.recording_url || !recording.lead_id) continue;

        try {
          // Check if we have a call record for this lead_id
          const existingCall = await db.oneOrNone(`
            SELECT id, recording_url
            FROM calls
            WHERE source_ref = $1
            LIMIT 1
          `, [recording.lead_id.toString()]);

          if (existingCall) {
            // Update existing call with recording URL
            if (!existingCall.recording_url) {
              await db.none(`
                UPDATE calls
                SET
                  recording_url = $2,
                  updated_at = NOW()
                WHERE id = $1
              `, [existingCall.id, recording.recording_url]);

              results.updated++;
              console.log('[RECORDING FETCH TEST] Updated call with recording:', {
                call_id: existingCall.id,
                lead_id: recording.lead_id
              });
            }
          } else {
            // Create new call record with recording
            await db.none(`
              INSERT INTO calls (
                id,
                source,
                source_ref,
                recording_url,
                started_at,
                ended_at,
                duration_sec,
                created_at
              ) VALUES (
                gen_random_uuid(),
                'convoso',
                $1,
                $2,
                $3::timestamptz,
                $4::timestamptz,
                $5,
                NOW()
              )
              ON CONFLICT (source_ref) DO UPDATE
              SET
                recording_url = EXCLUDED.recording_url,
                updated_at = NOW()
            `, [
              recording.lead_id.toString(),
              recording.recording_url,
              recording.start_time,
              recording.end_time,
              recording.duration
            ]);

            results.saved++;
            console.log('[RECORDING FETCH TEST] Created new call with recording:', {
              lead_id: recording.lead_id
            });
          }

        } catch (dbError: any) {
          console.error('[RECORDING FETCH TEST] DB error:', dbError.message);
          results.errors++;
        }
      }
    }

    const elapsed = Date.now() - startTime;

    // Return results
    return NextResponse.json({
      ok: true,
      message: dry_run ? 'Dry run completed (no data saved)' : 'Recordings fetched and saved',
      method: lead_id ? 'lead_id' : 'user_email',
      query_value: lead_id || user_email,
      limit: recordLimit,
      dry_run,
      results,
      api_response: {
        success: apiResponse?.success,
        total: apiResponse?.data?.total || recordings.length
      },
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
        source_ref as lead_id,
        recording_url,
        agent_name,
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
        methods: {
          by_lead: {
            description: 'Fetch recordings for a specific lead',
            required: { lead_id: 'Lead ID from Convoso' },
            optional: { limit: 'Max 100', dry_run: 'Test without saving' }
          },
          by_user: {
            description: 'Fetch all recordings for a user (experimental)',
            required: { user_email: 'Agent email address' },
            optional: { limit: 'Max 100', dry_run: 'Test without saving' }
          }
        },
        examples: [
          {
            method: 'By Lead ID',
            body: { lead_id: '12345', limit: 10, dry_run: true }
          },
          {
            method: 'By User Email',
            body: { user_email: 'agent@example.com', limit: 10, dry_run: true }
          }
        ]
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