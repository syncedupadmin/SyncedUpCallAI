import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

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
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND created_at < NOW()
    `);
    const lastWeekCalls = parseInt(lastWeekResult.total);

    // Get calls from previous week for percentage calculation
    const previousWeekResult = await db.one(`
      SELECT COUNT(*) as total
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '14 days'
        AND created_at < NOW() - INTERVAL '7 days'
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
        COALESCE(AVG(duration_sec), 0) as avg_duration,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_sec), 0) as median_duration
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
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND agent_id IS NOT NULL
    `);
    const activeAgents = parseInt(activeAgentsResult.active_agents);

    // Get today's call count
    const todayCallsResult = await db.one(`
      SELECT COUNT(*) as today
      FROM calls
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    const todayCalls = parseInt(todayCallsResult.today);

    // Get call distribution by hour for today
    const hourlyDistribution = await db.any(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
      FROM calls
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `);

    // Get top agents by call count (last 7 days)
    const topAgents = await db.any(`
      SELECT 
        agent_name,
        agent_id,
        COUNT(*) as call_count,
        AVG(duration_sec) as avg_duration
      FROM calls
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND agent_name IS NOT NULL
      GROUP BY agent_name, agent_id
      ORDER BY call_count DESC
      LIMIT 5
    `);

    // Get disposition breakdown
    const dispositionBreakdown = await db.any(`
      SELECT 
        disposition,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER ()), 1) as percentage
      FROM calls
      WHERE disposition IS NOT NULL
        AND disposition != 'Unknown'
      GROUP BY disposition
      ORDER BY count DESC
      LIMIT 5
    `);

    // Get campaign performance
    const campaignStats = await db.any(`
      SELECT 
        campaign,
        COUNT(*) as total_calls,
        AVG(duration_sec) as avg_duration,
        COUNT(*) FILTER (WHERE disposition IN ('Completed', 'Success', 'Connected', 'Answered')) as successful_calls
      FROM calls
      WHERE campaign IS NOT NULL
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY campaign
      ORDER BY total_calls DESC
      LIMIT 5
    `);

    return NextResponse.json({
      ok: true,
      metrics: {
        totalCalls,
        avgDuration,
        successRate: Math.round(successRate * 10) / 10, // Round to 1 decimal
        activeAgents,
        weekChange: Math.round(weekChange * 10) / 10,
        todayCalls,
        medianDuration: Math.round(parseFloat(avgDurationResult.median_duration))
      },
      charts: {
        hourlyDistribution,
        topAgents: topAgents.map(a => ({
          ...a,
          avg_duration: Math.round(a.avg_duration)
        })),
        dispositionBreakdown,
        campaignStats: campaignStats.map(c => ({
          ...c,
          avg_duration: Math.round(c.avg_duration),
          success_rate: c.total_calls > 0 
            ? Math.round((c.successful_calls / c.total_calls) * 1000) / 10 
            : 0
        }))
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    
    // Return default values on error
    return NextResponse.json({
      ok: false,
      error: error.message,
      metrics: {
        totalCalls: 0,
        avgDuration: '0s',
        successRate: 0,
        activeAgents: 0,
        weekChange: 0,
        todayCalls: 0,
        medianDuration: 0
      },
      charts: {
        hourlyDistribution: [],
        topAgents: [],
        dispositionBreakdown: [],
        campaignStats: []
      }
    });
  }
}