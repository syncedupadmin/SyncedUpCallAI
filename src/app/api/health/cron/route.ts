import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Ensure heartbeat records exist for our cron jobs
    await db.none(`
      INSERT INTO cron_heartbeats (name, last_ok, last_message) 
      VALUES 
        ('rollups', NOW(), 'Initialized'),
        ('retention', NOW(), 'Initialized')
      ON CONFLICT (name) DO NOTHING
    `);

    // Get heartbeat status for all cron jobs
    const jobs = await db.manyOrNone(`
      SELECT 
        name,
        last_ok,
        last_message,
        EXTRACT(EPOCH FROM (NOW() - last_ok))::int as age_sec,
        CASE 
          WHEN last_ok > NOW() - INTERVAL '2 hours' THEN 'ok'
          ELSE 'stale'
        END as status
      FROM cron_heartbeats
      ORDER BY name
    `);

    // Check if any jobs are stale
    const allOk = jobs.every(job => job.status === 'ok');

    return NextResponse.json({
      ok: true,
      jobs,
      all_ok: allOk
    });

  } catch (error: any) {
    console.error('[Cron Health] Error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to check cron health'
    }, { status: 500 });
  }
}