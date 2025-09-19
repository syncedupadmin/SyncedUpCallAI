import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // First, perform a database health check with timeout
    const dbHealthy = await db.healthCheck(5000);
    
    if (!dbHealthy) {
      console.error('[Cron Health] Database health check failed');
      return NextResponse.json({
        ok: false,
        error: 'Database health check failed',
        db_status: 'unhealthy'
      }, { status: 503 });
    }

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

    // Include database pool status for monitoring
    const poolStatus = db.getPoolStatus();

    return NextResponse.json({
      ok: true,
      jobs,
      all_ok: allOk,
      db_status: 'healthy',
      pool_status: poolStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Cron Health] Error:', error);
    
    // Include more detailed error information for debugging
    const poolStatus = db.getPoolStatus();
    
    return NextResponse.json({
      ok: false,
      error: error.message || 'Failed to check cron health',
      error_code: error.code || 'UNKNOWN_ERROR',
      db_status: 'error',
      pool_status: poolStatus,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}