import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { getCircuitStatus } from '@/src/server/convoso/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/convoso/status
 * Returns sync status history and circuit breaker state
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate pagination
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { ok: false, error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    if (isNaN(offset) || offset < 0) {
      return NextResponse.json(
        { ok: false, error: 'Offset must be >= 0' },
        { status: 400 }
      );
    }

    // Get sync history
    const syncHistory = await db.manyOrNone(`
      SELECT
        id,
        sync_type,
        started_at,
        completed_at,
        from_date,
        to_date,
        records_processed,
        records_inserted,
        records_updated,
        records_failed,
        error_message,
        metadata,
        EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 as duration_ms
      FROM convoso_sync_status
      ORDER BY started_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Get total count
    const countResult = await db.one(`
      SELECT COUNT(*) as total FROM convoso_sync_status
    `);

    // Get last successful sync
    const lastSuccess = await db.oneOrNone(`
      SELECT completed_at, records_processed
      FROM convoso_sync_status
      WHERE sync_type = 'delta'
        AND error_message IS NULL
        AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 1
    `);

    // Get cron heartbeat (get most recent heartbeat)
    let cronHeartbeat = null;
    try {
      cronHeartbeat = await db.oneOrNone(`
        SELECT MAX(heartbeat_at) as last_run
        FROM cron_heartbeats
        WHERE name = 'convoso-cron'
        GROUP BY name
      `);
    } catch (err) {
      // Table might not exist or no heartbeats yet
      console.log('[Convoso Status] cron_heartbeats query failed:', err.message);
    }

    // Calculate health status
    const now = Date.now();
    const lastSuccessTime = lastSuccess?.completed_at ? new Date(lastSuccess.completed_at).getTime() : 0;
    const timeSinceLastSuccess = now - lastSuccessTime;
    const isHealthy = timeSinceLastSuccess < 30 * 60 * 1000; // 30 minutes

    return NextResponse.json({
      ok: true,
      health: {
        status: isHealthy ? 'healthy' : 'degraded',
        lastSuccess: lastSuccess ? {
          at: lastSuccess.completed_at,
          records: lastSuccess.records_processed,
          minutesAgo: Math.floor(timeSinceLastSuccess / 60000)
        } : null,
        circuit: getCircuitStatus(),
        cronHeartbeat: cronHeartbeat ? {
          lastRun: cronHeartbeat.last_run
        } : null
      },
      history: syncHistory.map(row => ({
        id: row.id,
        syncType: row.sync_type,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        fromDate: row.from_date,
        toDate: row.to_date,
        processed: row.records_processed,
        inserted: row.records_inserted,
        updated: row.records_updated,
        failed: row.records_failed,
        error: row.error_message,
        durationMs: row.duration_ms ? Math.round(row.duration_ms) : null,
        metadata: row.metadata
      })),
      total: parseInt(countResult.total),
      limit,
      offset
    });

  } catch (error: any) {
    console.error('[Convoso Status API] Error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}