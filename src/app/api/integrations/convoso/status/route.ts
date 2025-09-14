import { NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { getCircuitStatus } from '@/src/server/convoso/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // heartbeat (robust if table is empty/missing)
    let lastRun: string | null = null;
    try {
      const hb = await db.oneOrNone(`
        SELECT MAX(heartbeat_at) AS last_run
        FROM cron_heartbeats
        WHERE name = 'convoso-cron'
      `);
      lastRun = hb?.last_run ?? null;
    } catch {
      // table missing or no perms; return null lastRun without failing
      lastRun = null;
    }

    // quick summary (never throws; 0 if empty)
    const summary = await db.one(`
      SELECT
        COUNT(*)::int AS total_calls,
        COUNT(DISTINCT agent_id)::int AS agents
      FROM calls
    `);

    // history: last 20 syncs
    const history = await db.manyOrNone(`
      SELECT id, sync_type, started_at, completed_at,
             records_processed, records_inserted, records_updated,
             records_failed, error_message
      FROM convoso_sync_status
      ORDER BY started_at DESC
      LIMIT 20
    `);

    return NextResponse.json({
      ok: true,
      circuit: getCircuitStatus(),
      heartbeat: { lastRun },
      summary: {
        totalCalls: summary.total_calls,
        agents: summary.agents,
      },
      history: history.map((r: any) => ({
        id: r.id,
        sync_type: r.sync_type,
        started_at: r.started_at,
        completed_at: r.completed_at,
        records_processed: r.records_processed,
        records_inserted: r.records_inserted,
        records_updated: r.records_updated,
        records_failed: r.records_failed,
        error: r.error_message,
      })),
    });
  } catch (err: any) {
    console.error('[convoso.status] fatal', err?.message);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}