import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { fetchCalls } from '@/src/server/convoso/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large imports

// SSE helper for progress updates
function createSSEResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// Bulk import recordings from Convoso with date range and disposition filtering
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    }
  });

  // Send progress update via SSE
  const sendProgress = (progress: any) => {
    const data = `data: ${JSON.stringify({ progress })}\n\n`;
    controller.enqueue(encoder.encode(data));
  };

  // Start processing in background
  setTimeout(async () => {
    try {
      const body = await req.json();
      const {
        start_date,
        end_date,
        dispositions = [],
        dry_run = false,
        limit // No default limit - pull all
      } = body;

      // Validate inputs
      if (!start_date || !end_date) {
        sendProgress({
          status: 'error',
          message: 'Start date and end date are required',
          current: 0,
          total: 0
        });
        controller.close();
        return;
      }

      console.log('[BULK IMPORT] Starting import:', {
        start_date,
        end_date,
        dispositions: dispositions.length,
        dry_run,
        timestamp: new Date().toISOString()
      });

      sendProgress({
        status: 'fetching',
        message: 'Connecting to Convoso API...',
        current: 0,
        total: 0
      });

      // Get Convoso auth token
      const authToken = process.env.CONVOSO_AUTH_TOKEN;
      if (!authToken) {
        sendProgress({
          status: 'error',
          message: 'CONVOSO_AUTH_TOKEN not configured',
          current: 0,
          total: 0
        });
        controller.close();
        return;
      }

      // Fetch recordings from Convoso
      // The API might expect different date formats
      console.log('[BULK IMPORT] Date parameters:', {
        start_date,
        end_date,
        dispositions: dispositions.join(',')
      });

      const params = new URLSearchParams({
        auth_token: authToken,
        start_date: start_date,
        end_date: end_date
      });

      // Add limit if specified
      if (limit) {
        params.append('limit', limit.toString());
      }

      // Try different endpoint variations based on what we've learned
      const endpoints = [
        `https://api.convoso.com/v1/lead/get-recordings?${params}`,  // Singular 'lead'
        `https://api.convoso.com/v1/leads/get-recordings?${params}`, // Plural 'leads'
        `https://api.convoso.com/api/recordings?${params}`,          // Alternative path
      ];

      let url = endpoints[0];
      console.log('[BULK IMPORT] Trying endpoint:', url);

      sendProgress({
        status: 'fetching',
        message: 'Fetching recordings from Convoso...',
        current: 0,
        total: 0
      });

      let response;
      let successfulEndpoint = null;

      // Try each endpoint until one works
      for (const endpoint of endpoints) {
        try {
          console.log('[BULK IMPORT] Attempting:', endpoint);
          response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });

          if (response.ok) {
            successfulEndpoint = endpoint;
            console.log('[BULK IMPORT] Success with endpoint:', endpoint);
            break;
          } else {
            console.log(`[BULK IMPORT] Failed with ${response.status} for ${endpoint}`);
          }
        } catch (err) {
          console.log(`[BULK IMPORT] Error with ${endpoint}:`, err);
        }
      }

      if (!response || !response.ok) {
        const errorText = response ? await response.text() : 'No successful endpoint found';
        console.error('[BULK IMPORT] All endpoints failed:', errorText);
        sendProgress({
          status: 'error',
          message: `Could not connect to Convoso API. Check date format or credentials.`,
          current: 0,
          total: 0
        });
        controller.close();
        return;
      }

      const apiResponse = await response.json();
      let recordings = [];

      // Parse response - try multiple formats
      console.log('[BULK IMPORT] API Response structure:', {
        hasSuccess: 'success' in apiResponse,
        hasData: 'data' in apiResponse,
        hasEntries: apiResponse.data?.entries ? true : false,
        isArray: Array.isArray(apiResponse),
        keys: Object.keys(apiResponse).slice(0, 10)
      });

      if (apiResponse.success && apiResponse.data?.entries) {
        recordings = apiResponse.data.entries;
      } else if (apiResponse.success && apiResponse.data && Array.isArray(apiResponse.data)) {
        recordings = apiResponse.data;
      } else if (apiResponse.data && Array.isArray(apiResponse.data)) {
        recordings = apiResponse.data;
      } else if (Array.isArray(apiResponse)) {
        recordings = apiResponse;
      } else if (apiResponse.recordings) {
        recordings = apiResponse.recordings;
      } else if (apiResponse.calls) {
        recordings = apiResponse.calls;
      }

      console.log('[BULK IMPORT] Extracted recordings:', recordings.length);

      console.log('[BULK IMPORT] Found recordings:', recordings.length);

      // Log sample recording structure if we have any
      if (recordings.length > 0) {
        console.log('[BULK IMPORT] Sample recording structure:', {
          firstRecord: recordings[0],
          keys: Object.keys(recordings[0])
        });
      } else {
        console.log('[BULK IMPORT] No recordings found. Response was:', {
          success: apiResponse.success,
          message: apiResponse.message,
          error: apiResponse.error,
          total: apiResponse.total
        });
      }

      // Filter by disposition if specified
      if (dispositions.length > 0) {
        recordings = recordings.filter((r: any) => {
          const recordingDispo = r.disposition || r.call_disposition || '';
          return dispositions.includes(recordingDispo);
        });
        console.log('[BULK IMPORT] After disposition filter:', recordings.length);
      }

      sendProgress({
        status: 'processing',
        message: `Processing ${recordings.length} recordings...`,
        current: 0,
        total: recordings.length,
        stats: {
          total: recordings.length,
          byAgent: {},
          byDisposition: {},
          byDuration: {
            under30s: 0,
            under1min: 0,
            under2min: 0,
            over2min: 0
          }
        }
      });

      // Process recordings
      const stats = {
        total: recordings.length,
        saved: 0,
        updated: 0,
        errors: 0,
        byAgent: {} as Record<string, number>,
        byDisposition: {} as Record<string, number>,
        byDuration: {
          under30s: 0,
          under1min: 0,
          under2min: 0,
          over2min: 0
        }
      };

      for (let i = 0; i < recordings.length; i++) {
        const recording = recordings[i];

        // Update statistics
        const agent = recording.agent_name || recording.User || 'Unknown';
        const disposition = recording.disposition || recording.call_disposition || 'Unknown';
        const duration = recording.seconds || recording.duration || 0;

        stats.byAgent[agent] = (stats.byAgent[agent] || 0) + 1;
        stats.byDisposition[disposition] = (stats.byDisposition[disposition] || 0) + 1;

        if (duration < 30) stats.byDuration.under30s++;
        else if (duration < 60) stats.byDuration.under1min++;
        else if (duration < 120) stats.byDuration.under2min++;
        else stats.byDuration.over2min++;

        // Send progress update every 10 recordings
        if (i % 10 === 0) {
          sendProgress({
            status: 'processing',
            message: `Processing recording ${i + 1} of ${recordings.length}...`,
            current: i + 1,
            total: recordings.length,
            stats
          });
        }

        // Skip saving if dry run
        if (dry_run) continue;

        try {
          // Extract recording data
          const callData = {
            lead_id: recording.lead_id || recording.LeadID,
            recording_id: recording.recording_id || recording.id,
            recording_url: recording.url || recording.recording_url || recording.RecordingURL,
            agent_id: recording.agent_id || recording.UserID,
            agent_name: recording.agent_name || recording.User || recording.user,
            phone_number: recording.phone_number || recording.PhoneNumber,
            campaign: recording.campaign || recording.Campaign,
            disposition: recording.disposition || recording.Disposition,
            direction: recording.direction || 'outbound',
            duration: recording.seconds || recording.duration || recording.Duration,
            started_at: recording.start_time || recording.StartTime,
            ended_at: recording.end_time || recording.EndTime
          };

          if (!callData.recording_url || !callData.lead_id) continue;

          // Generate fingerprint for matching
          let recordingFingerprint: string | null = null;
          if (callData.lead_id && callData.agent_name && callData.started_at) {
            const startTime = new Date(callData.started_at).toISOString().split('.')[0];
            const duration = callData.duration || 0;
            recordingFingerprint = `${callData.lead_id}_${callData.agent_name}_${startTime}_${duration}`.toLowerCase();
          }

          // Check if call already exists
          const existingCall = await db.oneOrNone(`
            SELECT id, recording_url, lead_id
            FROM calls
            WHERE lead_id = $1
              AND (
                recording_fingerprint = $2
                OR (started_at = $3::timestamptz AND agent_name = $4)
              )
            LIMIT 1
          `, [
            callData.lead_id,
            recordingFingerprint,
            callData.started_at,
            callData.agent_name
          ]);

          if (existingCall) {
            // Update existing call with recording URL if missing
            if (!existingCall.recording_url && callData.recording_url) {
              await db.none(`
                UPDATE calls
                SET
                  recording_url = $2,
                  recording_match_confidence = 'exact',
                  recording_matched_at = NOW(),
                  updated_at = NOW()
                WHERE id = $1
              `, [existingCall.id, callData.recording_url]);
              stats.updated++;
            }
          } else {
            // Create new call record
            const callId = await db.one(`
              INSERT INTO calls (
                id,
                source,
                source_ref,
                lead_id,
                campaign,
                disposition,
                direction,
                started_at,
                ended_at,
                duration_sec,
                recording_url,
                agent_name,
                recording_fingerprint,
                recording_match_confidence,
                metadata,
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
                $9,
                $10,
                $11,
                $12,
                $13,
                NOW()
              )
              ON CONFLICT (id) DO NOTHING
              RETURNING id
            `, [
              callData.recording_id || callData.lead_id,
              callData.lead_id,
              callData.campaign,
              callData.disposition,
              callData.direction,
              callData.started_at,
              callData.ended_at,
              callData.duration,
              callData.recording_url,
              callData.agent_name,
              recordingFingerprint,
              'exact',
              JSON.stringify({
                imported_at: new Date().toISOString(),
                import_type: 'bulk',
                raw_data: recording
              })
            ]);

            if (callId) stats.saved++;
          }

        } catch (error: any) {
          console.error('[BULK IMPORT] Error processing recording:', error.message);
          stats.errors++;
        }
      }

      // Final progress update
      sendProgress({
        status: 'complete',
        message: `Import completed! Saved: ${stats.saved}, Updated: ${stats.updated}, Errors: ${stats.errors}`,
        current: recordings.length,
        total: recordings.length,
        stats
      });

      console.log('[BULK IMPORT] Import completed:', {
        ...stats,
        dry_run,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('[BULK IMPORT] Fatal error:', error);
      sendProgress({
        status: 'error',
        message: error.message || 'Import failed',
        current: 0,
        total: 0
      });
    } finally {
      controller.close();
    }
  }, 0);

  return createSSEResponse(stream);
}

// GET endpoint to check import status
export async function GET(req: NextRequest) {
  try {
    // Get statistics from database
    const stats = await db.one(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(DISTINCT lead_id) as unique_leads,
        COUNT(DISTINCT agent_name) as unique_agents,
        COUNT(recording_url) as calls_with_recordings,
        COUNT(CASE WHEN recording_match_confidence = 'exact' THEN 1 END) as exact_matches,
        COUNT(CASE WHEN recording_match_confidence = 'fuzzy' THEN 1 END) as fuzzy_matches,
        COUNT(CASE WHEN recording_match_confidence = 'probable' THEN 1 END) as probable_matches,
        MIN(started_at) as earliest_call,
        MAX(started_at) as latest_call
      FROM calls
      WHERE source = 'convoso'
    `);

    // Get disposition breakdown
    const dispositions = await db.manyOrNone(`
      SELECT
        disposition,
        COUNT(*) as count
      FROM calls
      WHERE source = 'convoso'
        AND disposition IS NOT NULL
      GROUP BY disposition
      ORDER BY count DESC
      LIMIT 20
    `);

    // Get agent breakdown
    const agents = await db.manyOrNone(`
      SELECT
        agent_name,
        COUNT(*) as call_count,
        COUNT(recording_url) as recordings_count
      FROM calls
      WHERE source = 'convoso'
        AND agent_name IS NOT NULL
      GROUP BY agent_name
      ORDER BY call_count DESC
      LIMIT 20
    `);

    return NextResponse.json({
      ok: true,
      message: 'Bulk import endpoint ready',
      database_stats: stats,
      top_dispositions: dispositions,
      top_agents: agents,
      instructions: {
        endpoint: 'POST /api/admin/bulk-import-recordings',
        parameters: {
          start_date: 'YYYY-MM-DD format',
          end_date: 'YYYY-MM-DD format',
          dispositions: 'Array of disposition codes to filter (optional)',
          dry_run: 'Boolean - preview without saving (optional)',
          limit: 'Maximum recordings to import (optional, no limit by default)'
        },
        example: {
          start_date: '2025-01-01',
          end_date: '2025-01-15',
          dispositions: ['SALE', 'NI', 'INST'],
          dry_run: false
        }
      }
    });

  } catch (error: any) {
    console.error('[BULK IMPORT] Status check error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}