import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { fetchCalls, getCircuitStatus } from '@/src/server/convoso/client';
import { upsertConvosoCall, recordSyncStatus } from '@/src/server/db/convoso';
import { ConvosoSyncStatus } from '@/src/server/convoso/types';
import { isAdminAuthenticated } from '@/src/server/auth/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel cron timeout

// Rate limiter state
let lastCronRun = 0;
const MIN_INTERVAL_MS = 60000; // 60 seconds minimum between runs

/**
 * GET /api/cron/convoso-delta
 * Vercel Cron endpoint for delta syncs every 15 minutes
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // Verify this is called by Vercel Cron, has valid secret, or admin auth
  const vercelCronHeader = req.headers.get('x-vercel-cron');
  const cronSecret = req.headers.get('x-cron-secret');
  const hasAdminAuth = isAdminAuthenticated(req);

  const authorized =
    !!vercelCronHeader ||
    (cronSecret && cronSecret === process.env.CRON_SECRET) ||
    hasAdminAuth;

  if (!authorized) {
    console.warn('[Convoso Delta Cron] Unauthorized access attempt');
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Rate limit check
  if (lastCronRun && (Date.now() - lastCronRun) < MIN_INTERVAL_MS) {
    console.log('[Convoso Delta Cron] Rate limited - recent run');
    return NextResponse.json({
      ok: false,
      error: 'recent_run',
      last_run: new Date(lastCronRun).toISOString(),
      next_allowed: new Date(lastCronRun + MIN_INTERVAL_MS).toISOString()
    });
  }

  lastCronRun = Date.now();

  const syncStatus: ConvosoSyncStatus = {
    sync_type: 'delta',
    started_at: new Date(),
    records_processed: 0,
    records_inserted: 0,
    records_updated: 0,
    records_failed: 0,
  };

  try {
    // Calculate delta window (last 15 minutes by default)
    const deltaMinutes = parseInt(process.env.CONVOSO_DELTA_MINUTES || '15');
    const to = new Date();
    const from = new Date(to.getTime() - deltaMinutes * 60 * 1000);

    syncStatus.from_date = from;
    syncStatus.to_date = to;

    console.log(`[Convoso Delta Cron] Starting delta sync: ${from.toISOString()} to ${to.toISOString()}`);

    // Check if we should get the last successful sync time instead
    try {
      const lastSync = await db.oneOrNone(`
        SELECT completed_at
        FROM convoso_sync_status
        WHERE sync_type = 'delta'
          AND error_message IS NULL
          AND completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT 1
      `);

      if (lastSync?.completed_at) {
        const lastSyncTime = new Date(lastSync.completed_at);
        // Use last sync time if it's more recent than our default window
        if (lastSyncTime > from) {
          syncStatus.from_date = lastSyncTime;
          console.log(`[Convoso Delta Cron] Using last sync time: ${lastSyncTime.toISOString()}`);
        }
      }
    } catch (err) {
      console.log('[Convoso Delta Cron] Could not fetch last sync time, using default window');
    }

    let totalScanned = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    let hasMorePages = true;
    let page = 1;
    const perPage = 200; // Larger batch for cron
    const maxPages = 10; // Safety limit

    while (hasMorePages && page <= maxPages) {
      try {
        const pageData = await fetchCalls({
          from: syncStatus.from_date!.toISOString(),
          to: syncStatus.to_date!.toISOString(),
          page,
          perPage,
        });

        const pageScanned = pageData.data.length;
        totalScanned += pageScanned;

        console.log(JSON.stringify({
          level: 'info',
          scope: 'convoso.cron',
          message: `Delta sync page ${page}`,
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
            console.error(`[Convoso Delta Cron] Failed to upsert call ${call.id}:`, error.message);
            totalFailed++;
          }
        }

        // Check if we should continue
        hasMorePages = pageScanned === perPage && page < pageData.total_pages;
        page++;

        if (pageScanned === 0) {
          console.log('[Convoso Delta Cron] No more data');
          break;
        }
      } catch (error: any) {
        console.error(`[Convoso Delta Cron] Failed to fetch page ${page}:`, error.message);

        // If circuit breaker is open, stop
        if (error.message.includes('circuit breaker open')) {
          syncStatus.error_message = error.message;
          break;
        }

        totalFailed += perPage; // Estimate
        break;
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
      pages_processed: page - 1,
      delta_minutes: deltaMinutes,
    };

    await recordSyncStatus(syncStatus);

    // Update cron heartbeat (upsert with ON CONFLICT)
    try {
      await db.none(
        `INSERT INTO cron_heartbeats (name, heartbeat_at)
         VALUES ($1, NOW())
         ON CONFLICT (name) DO UPDATE SET heartbeat_at = NOW()`,
        ['convoso-cron']
      );
    } catch (err) {
      console.log('[Convoso Delta Cron] Could not write heartbeat:', err);
    }

    console.log(
      `[Convoso Delta Cron] Complete: scanned=${totalScanned}, ins=${totalInserted}, upd=${totalUpdated}, fail=${totalFailed}`
    );

    return NextResponse.json({
      ok: true,
      scanned: totalScanned,
      inserted: totalInserted,
      updated: totalUpdated,
      failed: totalFailed,
      took_ms: Date.now() - startTime,
    });

  } catch (error: any) {
    console.error('[Convoso Delta Cron] Fatal error:', error);

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