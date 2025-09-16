import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get recent calls without authentication check for debugging
    const recentCalls = await db.manyOrNone(`
      SELECT
        c.id,
        c.agent_name,
        c.phone_number,
        c.disposition,
        c.started_at,
        c.duration_sec,
        c.lead_id,
        c.campaign
      FROM calls c
      WHERE c.started_at > NOW() - INTERVAL '24 hours'
      ORDER BY c.started_at DESC
      LIMIT 20
    `);

    // Get call count
    const countResult = await db.one(`
      SELECT COUNT(*) as total FROM calls
    `);

    // Get calls with "test agent"
    const testAgentCalls = await db.manyOrNone(`
      SELECT
        id,
        agent_name,
        started_at,
        phone_number
      FROM calls
      WHERE agent_name ILIKE '%test%'
      ORDER BY started_at DESC
      LIMIT 10
    `);

    return NextResponse.json({
      ok: true,
      summary: {
        total_calls: countResult.total,
        recent_24h: recentCalls.length,
        test_agent_calls: testAgentCalls.length
      },
      recent_calls: recentCalls,
      test_agent_calls: testAgentCalls,
      debug_info: {
        timestamp: new Date().toISOString(),
        database_connected: true
      }
    });
  } catch (error: any) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      debug_info: {
        timestamp: new Date().toISOString(),
        database_connected: false
      }
    });
  }
}