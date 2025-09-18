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

// Bulk import calls/recordings from Convoso with date range and disposition filtering
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

      console.log('[BULK IMPORT V2] Starting import:', {
        start_date,
        end_date,
        dispositions: dispositions.length,
        dry_run,
        limit,
        timestamp: new Date().toISOString()
      });

      sendProgress({
        status: 'fetching',
        message: 'Connecting to Convoso API...',
        current: 0,
        total: 0
      });

      // Check for auth token
      if (!process.env.CONVOSO_AUTH_TOKEN) {
        sendProgress({
          status: 'error',
          message: 'CONVOSO_AUTH_TOKEN not configured',
          current: 0,
          total: 0
        });
        controller.close();
        return;
      }

      let allCalls = [];
      let page = 1;
      const perPage = 100; // API max per page
      let totalFetched = 0;

      try {
        // Fetch first page to get total
        console.log('[BULK IMPORT V2] Fetching first page...');
        const firstPage = await fetchCalls({
          from: start_date,
          to: end_date,
          page: 1,
          perPage
        });

        allCalls = firstPage.data;
        totalFetched = firstPage.data.length;
        const totalAvailable = firstPage.total;
        const totalPages = firstPage.total_pages;

        console.log('[BULK IMPORT V2] First page results:', {
          records: firstPage.data.length,
          total: totalAvailable,
          totalPages: totalPages
        });

        sendProgress({
          status: 'fetching',
          message: `Found ${totalAvailable} calls. Processing page 1 of ${totalPages}...`,
          current: totalFetched,
          total: limit || totalAvailable
        });

        // Calculate how many pages to fetch
        let pagesToFetch = totalPages;
        if (limit && limit < totalAvailable) {
          pagesToFetch = Math.ceil(limit / perPage);
        }

        // Fetch remaining pages
        for (page = 2; page <= pagesToFetch && (!limit || allCalls.length < limit); page++) {
          console.log(`[BULK IMPORT V2] Fetching page ${page} of ${pagesToFetch}...`);

          sendProgress({
            status: 'fetching',
            message: `Fetching page ${page} of ${pagesToFetch}...`,
            current: allCalls.length,
            total: limit || totalAvailable
          });

          const pageData = await fetchCalls({
            from: start_date,
            to: end_date,
            page,
            perPage
          });

          allCalls = [...allCalls, ...pageData.data];
          totalFetched += pageData.data.length;

          // Stop if we've reached the limit
          if (limit && allCalls.length >= limit) {
            allCalls = allCalls.slice(0, limit);
            break;
          }

          // Small delay between pages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        }

      } catch (error: any) {
        console.error('[BULK IMPORT V2] Error fetching from Convoso:', error);
        sendProgress({
          status: 'error',
          message: `Failed to fetch from Convoso: ${error.message}`,
          current: 0,
          total: 0
        });
        controller.close();
        return;
      }

      console.log('[BULK IMPORT V2] Total calls fetched:', allCalls.length);

      // Filter by disposition if specified
      let filteredCalls = allCalls;
      if (dispositions.length > 0) {
        filteredCalls = allCalls.filter((call: any) => {
          const callDispo = call.disposition || '';
          return dispositions.includes(callDispo);
        });
        console.log(`[BULK IMPORT V2] After disposition filter: ${filteredCalls.length} (from ${allCalls.length})`);
      }

      sendProgress({
        status: 'processing',
        message: `Processing ${filteredCalls.length} calls...`,
        current: 0,
        total: filteredCalls.length,
        stats: {
          total: filteredCalls.length,
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

      // Process calls
      const stats = {
        total: filteredCalls.length,
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

      for (let i = 0; i < filteredCalls.length; i++) {
        const call = filteredCalls[i];

        // Update statistics
        const agent = call.agent || 'Unknown';
        const disposition = call.disposition || 'Unknown';
        const duration = call.duration_sec || 0;

        stats.byAgent[agent] = (stats.byAgent[agent] || 0) + 1;
        stats.byDisposition[disposition] = (stats.byDisposition[disposition] || 0) + 1;

        if (duration < 30) stats.byDuration.under30s++;
        else if (duration < 60) stats.byDuration.under1min++;
        else if (duration < 120) stats.byDuration.under2min++;
        else stats.byDuration.over2min++;

        // Send progress update every 10 calls
        if (i % 10 === 0 || i === filteredCalls.length - 1) {
          sendProgress({
            status: 'processing',
            message: `Processing call ${i + 1} of ${filteredCalls.length}...`,
            current: i + 1,
            total: filteredCalls.length,
            stats
          });
        }

        // Skip saving if dry run
        if (dry_run) continue;

        try {
          // Extract call data
          const callData = {
            call_id: call.id,
            lead_id: call.lead_id,
            recording_url: call.recording_url,
            agent_id: call.agent_id,
            agent_name: call.agent,
            phone_number: call.lead_phone,
            campaign: call.campaign,
            disposition: call.disposition,
            direction: call.direction || 'outbound',
            duration: call.duration_sec,
            started_at: call.started_at,
            ended_at: call.ended_at
          };

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
            WHERE (source_ref = $1 OR id::text = $1)
              OR (lead_id = $2 AND started_at = $3::timestamptz AND agent_name = $4)
            LIMIT 1
          `, [
            callData.call_id,
            callData.lead_id,
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
                agent_id,
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
                $14,
                NOW()
              )
              ON CONFLICT (id) DO NOTHING
            `, [
              callData.call_id,
              callData.lead_id,
              callData.campaign,
              callData.disposition,
              callData.direction,
              callData.started_at,
              callData.ended_at,
              callData.duration,
              callData.recording_url,
              callData.agent_name,
              callData.agent_id,
              recordingFingerprint,
              callData.recording_url ? 'exact' : null,
              JSON.stringify({
                imported_at: new Date().toISOString(),
                import_type: 'bulk_v2',
                raw_data: call.raw || call
              })
            ]);

            stats.saved++;
          }

        } catch (error: any) {
          console.error('[BULK IMPORT V2] Error processing call:', error.message);
          stats.errors++;
        }
      }

      // Final progress update
      sendProgress({
        status: 'complete',
        message: dry_run
          ? `Dry run completed! Found ${stats.total} calls matching criteria.`
          : `Import completed! Saved: ${stats.saved}, Updated: ${stats.updated}, Errors: ${stats.errors}`,
        current: filteredCalls.length,
        total: filteredCalls.length,
        stats
      });

      console.log('[BULK IMPORT V2] Import completed:', {
        ...stats,
        dry_run,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('[BULK IMPORT V2] Fatal error:', error);
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

    return NextResponse.json({
      ok: true,
      message: 'Bulk import V2 endpoint ready',
      description: 'This version uses the Convoso client fetchCalls function',
      database_stats: stats,
      top_dispositions: dispositions,
      instructions: {
        endpoint: 'POST /api/admin/bulk-import-recordings-v2',
        parameters: {
          start_date: 'YYYY-MM-DD format',
          end_date: 'YYYY-MM-DD format',
          dispositions: 'Array of disposition codes to filter (optional)',
          dry_run: 'Boolean - preview without saving (optional)',
          limit: 'Maximum calls to import (optional)'
        },
        example: {
          start_date: '2025-01-01',
          end_date: '2025-01-15',
          dispositions: ['SALE', 'NI', 'INST'],
          dry_run: true,
          limit: 100
        }
      }
    });

  } catch (error: any) {
    console.error('[BULK IMPORT V2] Status check error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}