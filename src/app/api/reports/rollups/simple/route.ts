import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const daysParam = req.nextUrl.searchParams.get('days');
    const days = Math.min(Math.max(1, parseInt(daysParam || '30', 10)), 90);
    
    // Query daily stats from actual calls table
    const { rows } = await db.query(`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - interval '1 day' * ($1 - 1),
          CURRENT_DATE,
          interval '1 day'
        )::date AS date
      ),
      daily_stats AS (
        SELECT 
          DATE(started_at) as date,
          COUNT(*) as total_calls,
          COUNT(CASE WHEN disposition IN ('Completed', 'Success', 'Connected', 'Answered') THEN 1 END) as success_calls,
          COUNT(DISTINCT agent_id) as agents,
          AVG(duration_sec) as avg_duration,
          MAX(duration_sec) as max_duration
        FROM calls
        WHERE started_at >= CURRENT_DATE - interval '1 day' * $1
          AND started_at <= CURRENT_DATE + interval '1 day'
        GROUP BY DATE(started_at)
      )
      SELECT 
        ds.date,
        COALESCE(dst.total_calls, 0)::int as total_calls,
        COALESCE(dst.success_calls, 0)::int as success_calls,
        COALESCE(dst.total_calls, 0)::int as analyzed_calls,  -- Assume all calls are analyzed
        0 as revenue_cents,  -- No revenue data available
        COALESCE(dst.agents, 0)::int as agents,
        COALESCE(dst.avg_duration, 0)::float as avg_duration,
        COALESCE(dst.max_duration, 0)::int as max_duration
      FROM date_series ds
      LEFT JOIN daily_stats dst ON dst.date = ds.date
      ORDER BY ds.date DESC
    `, [days]);
    
    // Calculate totals
    const totals = rows.reduce((acc, row) => ({
      total_calls: acc.total_calls + row.total_calls,
      analyzed_calls: acc.analyzed_calls + row.analyzed_calls,
      success_calls: acc.success_calls + row.success_calls,
      revenue_cents: acc.revenue_cents + parseInt(row.revenue_cents || '0', 10),
      total_agents: Math.max(acc.total_agents, row.agents)
    }), {
      total_calls: 0,
      analyzed_calls: 0,
      success_calls: 0,
      revenue_cents: 0,
      total_agents: 0
    });
    
    // Add success rate to totals
    const successRate = totals.total_calls > 0 
      ? Math.round((totals.success_calls / totals.total_calls) * 1000) / 10 
      : 0;
    
    return NextResponse.json(
      {
        ok: true,
        rows,
        totals: {
          ...totals,
          success_rate: successRate
        }
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
        }
      }
    );
  } catch (error: any) {
    console.error('[Simple Rollups] Error:', error);
    
    // Return empty data on error
    return NextResponse.json({ 
      ok: true,
      rows: [],
      totals: {
        total_calls: 0,
        analyzed_calls: 0,
        success_calls: 0,
        revenue_cents: 0,
        success_rate: 0
      }
    });
  }
}