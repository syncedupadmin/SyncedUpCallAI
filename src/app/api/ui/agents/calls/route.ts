import { NextRequest, NextResponse } from 'next/server';
import { getCallsGroupedByAgent } from '@/src/server/db/convoso';
import { db } from '@/src/server/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ui/agents/calls
 * Returns calls grouped by agent with filtering and pagination
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Extract query parameters
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const agent = searchParams.get('agent') || undefined;
    const disposition = searchParams.get('disposition') || undefined;
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate pagination
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        { ok: false, error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    if (isNaN(offset) || offset < 0) {
      return NextResponse.json(
        { ok: false, error: 'Offset must be >= 0' },
        { status: 400 }
      );
    }

    // Get grouped data
    const result = await getCallsGroupedByAgent({
      from,
      to,
      agent,
      disposition,
      limit,
      offset,
    });

    // Calculate summary statistics
    const totalAgents = result.total;
    const totalCalls = result.rows.reduce((sum, row) => sum + row.calls, 0);
    const avgCallsPerAgent = totalAgents > 0 ? Math.round(totalCalls / totalAgents) : 0;

    // Format response
    return NextResponse.json({
      ok: true,
      summary: {
        totalAgents,
        totalCalls,
        avgCallsPerAgent,
      },
      rows: result.rows.map(row => ({
        agent: row.agent,
        agent_id: row.agent_id,
        calls: row.calls,
        avgDurationSec: row.avgDurationSec,
        completedRate: Math.round(row.completedRate * 100) / 100,
        totalDurationMin: Math.round(row.totalDuration / 60),
        lastCall: row.lastCall,
      })),
      total: result.total,
      limit,
      offset,
    });

  } catch (error: any) {
    console.error('[Agent Calls API] Error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ui/agents/calls/refresh
 * Refresh materialized view for agent performance (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    // Check for admin secret or jobs secret
    const jobsSecret = req.headers.get('x-jobs-secret');

    if (!jobsSecret || jobsSecret !== process.env.JOBS_SECRET) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Refresh materialized view if it exists
    try {
      await db.none('REFRESH MATERIALIZED VIEW CONCURRENTLY mv_agent_daily_performance');
      console.log('[Agent Calls API] Refreshed materialized view');
    } catch (error: any) {
      if (error.message.includes('does not exist')) {
        console.log('[Agent Calls API] Materialized view not found, skipping refresh');
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Agent performance data refreshed',
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[Agent Calls API] Refresh error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    );
  }
}