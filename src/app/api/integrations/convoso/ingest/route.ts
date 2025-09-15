import { NextRequest, NextResponse } from 'next/server';
import { fetchCalls, getCircuitStatus } from '@/src/server/convoso/client';
import { upsertConvosoCall, recordSyncStatus } from '@/src/server/db/convoso';
import { ConvosoSyncStatus } from '@/src/server/convoso/types';
import { isAdminAuthenticated } from '@/src/server/auth/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/convoso/ingest
 * Protected endpoint to pull and ingest Convoso calls
 */
export async function POST(req: NextRequest) {
  // Security: Check for jobs secret or admin auth
  const jobsSecret = req.headers.get('x-jobs-secret');
  const hasAdminAuth = isAdminAuthenticated(req);

  if (!hasAdminAuth && (!jobsSecret || jobsSecret !== process.env.JOBS_SECRET)) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const startTime = Date.now();
  const syncStatus: ConvosoSyncStatus = {
    sync_type: 'realtime',
    started_at: new Date(),
    records_processed: 0,
    records_inserted: 0,
    records_updated: 0,
    records_failed: 0,
  };

  try {
    // Parse request body
    const body = await req.json();
    const {
      from,
      to,
      perPage = 100,
      pages = 1,
    } = body;

    // Validate inputs
    if (pages < 1 || pages > 100) {
      return NextResponse.json(
        { ok: false, error: 'Pages must be between 1 and 100' },
        { status: 400 }
      );
    }

    if (perPage < 1 || perPage > 500) {
      return NextResponse.json(
        { ok: false, error: 'perPage must be between 1 and 500' },
        { status: 400 }
      );
    }

    // Set date range for sync status
    if (from) syncStatus.from_date = new Date(from);
    if (to) syncStatus.to_date = new Date(to);

    console.log(`[Convoso Ingest] Starting: pages=${pages}, perPage=${perPage}, from=${from}, to=${to}`);

    let totalScanned = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalFailed = 0;

    // Process each page
    for (let page = 1; page <= pages; page++) {
      try {
        // Fetch page from Convoso
        const pageData = await fetchCalls({
          from,
          to,
          page,
          perPage,
        });

        const pageScanned = pageData.data.length;
        totalScanned += pageScanned;

        console.log(JSON.stringify({
          level: 'info',
          scope: 'convoso.ingest',
          message: `Processing page ${page}/${pages}`,
          page,
          total_pages: pageData.total_pages,
          scanned: pageScanned,
          total: pageData.total,
        }));

        // Process each call
        for (const call of pageData.data) {
          try {
            const result = await upsertConvosoCall(call);

            if (result.inserted) {
              totalInserted++;
            } else if (result.updated) {
              totalUpdated++;
            }
          } catch (error: any) {
            console.error(`[Convoso Ingest] Failed to upsert call ${call.id}:`, error.message);
            totalFailed++;
          }
        }

        // Log progress
        console.log(
          `[Convoso Ingest] Page ${page} complete: ins=${totalInserted}, upd=${totalUpdated}, fail=${totalFailed}`
        );

        // If this page had no data, don't fetch more pages
        if (pageScanned === 0) {
          console.log('[Convoso Ingest] No more data, stopping pagination');
          break;
        }

        // If we've reached the last page according to API
        if (page >= pageData.total_pages) {
          console.log(`[Convoso Ingest] Reached last page (${pageData.total_pages}), stopping`);
          break;
        }

      } catch (error: any) {
        console.error(`[Convoso Ingest] Failed to fetch page ${page}:`, error.message);

        // If circuit breaker is open, stop trying
        if (error.message.includes('circuit breaker open')) {
          syncStatus.error_message = error.message;
          break;
        }

        // For other errors, record and continue
        totalFailed += perPage; // Estimate failed records
      }
    }

    // Record sync status
    syncStatus.completed_at = new Date();
    syncStatus.records_processed = totalScanned;
    syncStatus.records_inserted = totalInserted;
    syncStatus.records_updated = totalUpdated;
    syncStatus.records_failed = totalFailed;
    syncStatus.metadata = {
      duration_ms: Date.now() - startTime,
      circuit_status: getCircuitStatus(),
    };

    await recordSyncStatus(syncStatus);

    console.log(
      `[Convoso Ingest] Complete: scanned=${totalScanned}, ins=${totalInserted}, upd=${totalUpdated}, fail=${totalFailed}`
    );

    return NextResponse.json({
      ok: true,
      scanned: totalScanned,
      inserted: totalInserted,
      updated: totalUpdated,
      failed: totalFailed,
      duration_ms: Date.now() - startTime,
    });

  } catch (error: any) {
    console.error('[Convoso Ingest] Fatal error:', error);

    // Record failed sync
    syncStatus.completed_at = new Date();
    syncStatus.error_message = error.message;
    syncStatus.metadata = {
      duration_ms: Date.now() - startTime,
      circuit_status: getCircuitStatus(),
    };
    await recordSyncStatus(syncStatus);

    return NextResponse.json(
      {
        ok: false,
        error: error.message,
        scanned: syncStatus.records_processed,
        inserted: syncStatus.records_inserted,
        updated: syncStatus.records_updated,
        failed: syncStatus.records_failed,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/integrations/convoso/ingest
 * Health check endpoint
 */
export async function GET(req: NextRequest) {
  try {
    const circuitStatus = getCircuitStatus();

    return NextResponse.json({
      ok: true,
      status: 'ready',
      circuit: circuitStatus,
      env: {
        hasAuthToken: !!process.env.CONVOSO_AUTH_TOKEN,
        baseUrl: process.env.CONVOSO_BASE_URL || 'https://api.convoso.com/v1',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}