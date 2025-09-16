import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';
import { isAdminAuthenticated, unauthorizedResponse } from '@/src/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return unauthorizedResponse();
  }

  try {
    // Get total counts
    const totalCallsResult = await db.one(`
      SELECT COUNT(*) as count FROM calls
    `);

    // Count all call events as webhooks
    const totalWebhooksResult = await db.one(`
      SELECT COUNT(*) as count FROM call_events
    `);

    // Get today's counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const todayCallsResult = await db.one(`
      SELECT COUNT(*) as count
      FROM calls
      WHERE created_at >= $1
    `, [todayISO]);

    const todayWebhooksResult = await db.one(`
      SELECT COUNT(*) as count
      FROM call_events
      WHERE COALESCE(at, created_at) >= $1
    `, [todayISO]);

    // Get counts by source
    const callsBySource = await db.manyOrNone(`
      SELECT
        source,
        COUNT(*) as count,
        COUNT(CASE WHEN created_at >= $1 THEN 1 END) as today_count
      FROM calls
      GROUP BY source
    `, [todayISO]);

    // Get recent activity
    const recentActivity = await db.manyOrNone(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as call_count
      FROM calls
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Get agent activity
    const agentActivity = await db.manyOrNone(`
      SELECT
        agent_name,
        COUNT(*) as total_calls,
        COUNT(CASE WHEN created_at >= $1 THEN 1 END) as today_calls
      FROM calls
      WHERE agent_name IS NOT NULL
      GROUP BY agent_name
      ORDER BY total_calls DESC
      LIMIT 10
    `, [todayISO]);

    return NextResponse.json({
      ok: true,
      stats: {
        total: {
          calls: parseInt(totalCallsResult.count),
          webhooks: parseInt(totalWebhooksResult.count)
        },
        today: {
          calls: parseInt(todayCallsResult.count),
          webhooks: parseInt(todayWebhooksResult.count)
        },
        bySource: callsBySource.map(s => ({
          source: s.source,
          total: parseInt(s.count),
          today: parseInt(s.today_count)
        })),
        recentActivity: recentActivity.map(a => ({
          date: a.date,
          calls: parseInt(a.call_count)
        })),
        topAgents: agentActivity.map(a => ({
          agent: a.agent_name,
          total: parseInt(a.total_calls),
          today: parseInt(a.today_calls)
        }))
      }
    });
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({
      ok: false,
      error: error.message
    }, { status: 500 });
  }
}