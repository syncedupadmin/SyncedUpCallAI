import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Get total calls count
    const totalCallsResult = await db.one(`
      SELECT COUNT(*) as total
      FROM calls
    `);
    const totalCalls = parseInt(totalCallsResult.total);

    // Get calls from last week for comparison
    const lastWeekResult = await db.one(`
      SELECT COUNT(*) as total
      FROM calls
      WHERE started_at >= NOW() - INTERVAL '7 days'
    `);
    const lastWeekCalls = parseInt(lastWeekResult.total);

    // Get calls from previous week for percentage calculation
    const previousWeekResult = await db.one(`
      SELECT COUNT(*) as total
      FROM calls
      WHERE started_at >= NOW() - INTERVAL '14 days'
        AND started_at < NOW() - INTERVAL '7 days'
    `);
    const previousWeekCalls = parseInt(previousWeekResult.total);

    // Calculate week-over-week change
    let weekChange = 0;
    if (previousWeekCalls > 0) {
      weekChange = ((lastWeekCalls - previousWeekCalls) / previousWeekCalls) * 100;
    }

    // Get average duration (in seconds)
    const avgDurationResult = await db.one(`
      SELECT 
        COALESCE(AVG(duration_sec), 0) as avg_duration
      FROM calls
      WHERE duration_sec > 0
        AND duration_sec < 3600  -- Exclude outliers over 1 hour
    `);
    const avgDurationSec = parseFloat(avgDurationResult.avg_duration);
    
    // Format duration as "Xm Ys"
    const minutes = Math.floor(avgDurationSec / 60);
    const seconds = Math.round(avgDurationSec % 60);
    const avgDuration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    // Get success rate (based on disposition)
    const successResult = await db.one(`
      SELECT 
        COUNT(*) FILTER (WHERE disposition IN ('Completed', 'Success', 'Connected', 'Answered')) as successful,
        COUNT(*) as total
      FROM calls
      WHERE disposition IS NOT NULL
        AND disposition != 'Unknown'
    `);
    
    let successRate = 0;
    if (parseInt(successResult.total) > 0) {
      successRate = (parseInt(successResult.successful) / parseInt(successResult.total)) * 100;
    }

    // Get active agents count (unique agents in last 24 hours)
    const activeAgentsResult = await db.one(`
      SELECT COUNT(DISTINCT agent_id) as active_agents
      FROM calls
      WHERE started_at >= NOW() - INTERVAL '24 hours'
        AND agent_id IS NOT NULL
    `);
    const activeAgents = parseInt(activeAgentsResult.active_agents);

    // Get today's call count
    const todayCallsResult = await db.one(`
      SELECT COUNT(*) as today
      FROM calls
      WHERE DATE(started_at) = CURRENT_DATE
    `);
    const todayCalls = parseInt(todayCallsResult.today);

    return NextResponse.json({
      ok: true,
      metrics: {
        totalCalls,
        avgDuration,
        successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
        activeAgents,
        weekChange: Math.round(weekChange * 10) / 10,
        todayCalls
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    
    // Return default values on error but keep ok:true
    return NextResponse.json({
      ok: true,
      metrics: {
        totalCalls: 0,
        avgDuration: '0s',
        successRate: 0,
        activeAgents: 0,
        weekChange: 0,
        todayCalls: 0
      }
    });
  }
}