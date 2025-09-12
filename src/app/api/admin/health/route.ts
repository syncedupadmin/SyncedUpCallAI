import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Check database health
    const isHealthy = await db.healthCheck(5000);
    
    // Get pool status
    const poolStatus = db.getPoolStatus();
    
    // Try to get some basic stats
    let stats = null;
    if (isHealthy) {
      try {
        const [callCount, agentCount, eventCount] = await Promise.all([
          db.oneOrNone(`SELECT COUNT(*) as count FROM calls`),
          db.oneOrNone(`SELECT COUNT(*) as count FROM agents`),
          db.oneOrNone(`SELECT COUNT(*) as count FROM call_events`)
        ]);
        
        stats = {
          calls: callCount?.count || 0,
          agents: agentCount?.count || 0,
          events: eventCount?.count || 0
        };
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    }
    
    return NextResponse.json({
      ok: true,
      healthy: isHealthy,
      pool: poolStatus,
      stats,
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL ? 'Configured' : 'Not configured',
        VERCEL: process.env.VERCEL ? 'Yes' : 'No'
      }
    });
  } catch (error: any) {
    console.error('Health check error:', error);
    return NextResponse.json({
      ok: false,
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}