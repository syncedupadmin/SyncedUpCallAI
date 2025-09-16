import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large batches

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

// Process lead IDs uploaded via CSV/TXT
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
        lead_ids = [],
        batch_size = 50,
        delay_ms = 100,
        dry_run = false,
        skip_existing = true
      } = body;

      // Validate inputs
      if (!lead_ids || lead_ids.length === 0) {
        sendProgress({
          status: 'error',
          message: 'No lead IDs provided',
          current: 0,
          total: 0
        });
        controller.close();
        return;
      }

      console.log('[LEAD PROCESSOR] Starting to process lead IDs:', {
        total: lead_ids.length,
        batch_size,
        delay_ms,
        dry_run,
        skip_existing,
        timestamp: new Date().toISOString()
      });

      sendProgress({
        status: 'processing',
        message: `Starting to process ${lead_ids.length} lead IDs...`,
        current: 0,
        total: lead_ids.length
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

      // Statistics tracking
      const stats = {
        total: lead_ids.length,
        processed: 0,
        successful: 0,
        failed: 0,
        recordings_found: 0
      };

      // Process lead IDs in batches
      for (let i = 0; i < lead_ids.length; i += batch_size) {
        const batch = lead_ids.slice(i, Math.min(i + batch_size, lead_ids.length));

        for (const leadId of batch) {
          stats.processed++;

          // Update progress with current lead
          sendProgress({
            status: 'processing',
            message: `Processing lead ${leadId}...`,
            current: stats.processed,
            total: lead_ids.length,
            current_lead: leadId,
            stats
          });

          // Skip if already exists and skip_existing is true
          if (skip_existing && !dry_run) {
            const existing = await db.oneOrNone(`
              SELECT COUNT(*) as count
              FROM calls
              WHERE lead_id = $1
              LIMIT 1
            `, [leadId]);

            if (existing && existing.count > 0) {
              console.log(`[LEAD PROCESSOR] Skipping existing lead: ${leadId}`);
              continue;
            }
          }

          try {
            // Fetch recordings for this lead from Convoso
            const params = new URLSearchParams({
              auth_token: authToken,
              lead_id: leadId,
              limit: '100' // Get all recordings for this lead
            });

            const url = `https://api.convoso.com/v1/leads/get-recordings?${params}`;
            console.log(`[LEAD PROCESSOR] Fetching recordings for lead ${leadId}`);

            const response = await fetch(url, {
              method: 'GET',
              headers: {
                'Accept': 'application/json'
              }
            });

            if (!response.ok) {
              console.error(`[LEAD PROCESSOR] Failed to fetch lead ${leadId}: ${response.status}`);
              stats.failed++;
              continue;
            }

            const apiResponse = await response.json();
            let recordings = [];

            // Parse response according to Convoso format
            if (apiResponse.success && apiResponse.data?.entries) {
              recordings = apiResponse.data.entries;
            } else if (apiResponse.success && Array.isArray(apiResponse.data)) {
              recordings = apiResponse.data;
            } else if (Array.isArray(apiResponse)) {
              recordings = apiResponse;
            }

            console.log(`[LEAD PROCESSOR] Found ${recordings.length} recordings for lead ${leadId}`);
            stats.recordings_found += recordings.length;

            // Process each recording (unless dry run)
            if (!dry_run && recordings.length > 0) {
              for (const recording of recordings) {
                try {
                  // Extract recording data
                  const callData = {
                    recording_id: recording.recording_id || recording.id,
                    lead_id: leadId,
                    recording_url: recording.url || recording.recording_url,
                    agent_name: recording.agent_name || recording.User || 'Unknown',
                    phone_number: recording.phone_number || recording.PhoneNumber,
                    campaign: recording.campaign || recording.Campaign,
                    disposition: recording.disposition || recording.Disposition,
                    duration: recording.seconds || recording.duration || 0,
                    started_at: recording.start_time || recording.StartTime,
                    ended_at: recording.end_time || recording.EndTime
                  };

                  if (!callData.recording_url) continue;

                  // Generate fingerprint for matching
                  let recordingFingerprint: string | null = null;
                  if (callData.lead_id && callData.agent_name && callData.started_at) {
                    const startTime = new Date(callData.started_at).toISOString().split('.')[0];
                    const duration = callData.duration || 0;
                    recordingFingerprint = `${callData.lead_id}_${callData.agent_name}_${startTime}_${duration}`.toLowerCase();
                  }

                  // Check if call already exists
                  const existingCall = await db.oneOrNone(`
                    SELECT id, recording_url
                    FROM calls
                    WHERE lead_id = $1
                      AND (
                        recording_fingerprint = $2
                        OR (started_at = $3::timestamptz AND agent_name = $4)
                      )
                    LIMIT 1
                  `, [
                    leadId,
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
                    }
                  } else {
                    // Create new call record
                    await db.none(`
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
                    `, [
                      callData.recording_id || `lead-${leadId}-${Date.now()}`,
                      leadId,
                      callData.campaign,
                      callData.disposition,
                      'outbound',
                      callData.started_at || new Date().toISOString(),
                      callData.ended_at,
                      callData.duration,
                      callData.recording_url,
                      callData.agent_name,
                      recordingFingerprint,
                      'exact',
                      JSON.stringify({
                        imported_via: 'lead_upload',
                        imported_at: new Date().toISOString(),
                        raw_data: recording
                      })
                    ]);
                  }

                } catch (dbError: any) {
                  console.error(`[LEAD PROCESSOR] Error saving recording:`, dbError.message);
                }
              }
            }

            stats.successful++;

          } catch (error: any) {
            console.error(`[LEAD PROCESSOR] Error processing lead ${leadId}:`, error.message);
            stats.failed++;
          }

          // Add delay between API calls to avoid rate limiting
          if (delay_ms > 0) {
            await new Promise(resolve => setTimeout(resolve, delay_ms));
          }
        }

        // Add small delay between batches (removed the 2x multiplier)
        if (i + batch_size < lead_ids.length && delay_ms > 0) {
          await new Promise(resolve => setTimeout(resolve, delay_ms));
        }
      }

      // Final progress update
      sendProgress({
        status: 'complete',
        message: dry_run
          ? `Dry run completed! Would process ${stats.recordings_found} recordings.`
          : `Processing completed! Found ${stats.recordings_found} recordings.`,
        current: stats.processed,
        total: lead_ids.length,
        stats
      });

      console.log('[LEAD PROCESSOR] Processing completed:', {
        ...stats,
        dry_run,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('[LEAD PROCESSOR] Fatal error:', error);
      sendProgress({
        status: 'error',
        message: error.message || 'Processing failed',
        current: 0,
        total: 0
      });
    } finally {
      controller.close();
    }
  }, 0);

  return createSSEResponse(stream);
}

// GET endpoint to check status
export async function GET(req: NextRequest) {
  try {
    // Get recent uploads statistics
    const stats = await db.one(`
      SELECT
        COUNT(DISTINCT lead_id) as unique_leads,
        COUNT(*) as total_calls,
        COUNT(recording_url) as calls_with_recordings
      FROM calls
      WHERE source = 'convoso'
        AND metadata->>'imported_via' = 'lead_upload'
    `);

    // Get recent uploads
    const recentUploads = await db.manyOrNone(`
      SELECT
        lead_id,
        COUNT(*) as call_count,
        MAX(created_at) as last_uploaded
      FROM calls
      WHERE source = 'convoso'
        AND metadata->>'imported_via' = 'lead_upload'
        AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY lead_id
      ORDER BY last_uploaded DESC
      LIMIT 10
    `);

    return NextResponse.json({
      ok: true,
      message: 'Lead processor endpoint ready',
      upload_stats: stats,
      recent_uploads: recentUploads,
      instructions: {
        endpoint: 'POST /api/admin/process-lead-ids',
        parameters: {
          lead_ids: 'Array of lead IDs to process',
          batch_size: 'Number of leads per batch (default: 25)',
          delay_ms: 'Delay between API calls in ms (default: 500)',
          dry_run: 'Boolean - preview without saving (default: false)',
          skip_existing: 'Boolean - skip leads already in DB (default: true)'
        },
        example: {
          lead_ids: ['12345', '67890', '11111'],
          batch_size: 25,
          delay_ms: 500,
          dry_run: false,
          skip_existing: true
        }
      }
    });

  } catch (error: any) {
    console.error('[LEAD PROCESSOR] Status check error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}