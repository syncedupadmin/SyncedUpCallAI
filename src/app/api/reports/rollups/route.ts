import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const daysParam = req.nextUrl.searchParams.get('days');
    const days = Math.min(Math.max(1, parseInt(daysParam || '30', 10)), 90);
    
    // Query rollups with filled gaps for missing dates
    const { rows } = await db.query(`
      WITH date_series AS (
        SELECT generate_series(
          CURRENT_DATE - interval '1 day' * ($1 - 1),
          CURRENT_DATE,
          interval '1 day'
        )::date AS date
      )
      SELECT 
        ds.date,
        COALESCE(r.total_calls, 0) as total_calls,
        COALESCE(r.analyzed_calls, 0) as analyzed_calls,
        COALESCE(r.success_calls, 0) as success_calls,
        COALESCE(r.revenue_cents, 0) as revenue_cents
      FROM date_series ds
      LEFT JOIN revenue_rollups r ON r.date = ds.date
      ORDER BY ds.date DESC
    `, [days]);
    
    // Calculate totals
    const totals = rows.reduce((acc, row) => ({
      total_calls: acc.total_calls + row.total_calls,
      analyzed_calls: acc.analyzed_calls + row.analyzed_calls,
      success_calls: acc.success_calls + row.success_calls,
      revenue_cents: acc.revenue_cents + parseInt(row.revenue_cents || '0', 10)
    }), {
      total_calls: 0,
      analyzed_calls: 0,
      success_calls: 0,
      revenue_cents: 0
    });
    
    // Add success rate to totals
    const successRate = totals.total_calls > 0 
      ? Math.round((totals.success_calls / totals.total_calls) * 100) 
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
    console.error('[Rollups] Error:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error.message || 'Failed to fetch rollups' 
    }, { status: 500 });
  }
}