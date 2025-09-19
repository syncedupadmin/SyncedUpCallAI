import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get agent performance from REAL data
    const agents = await db.manyOrNone(`
      SELECT
        agent_name,
        COUNT(*) as total_calls,
        AVG(success_score) as avg_success_score,
        AVG(engagement_score) as avg_engagement_score,
        SUM(CASE WHEN call_continued THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as continuation_rate,
        SUM(CASE WHEN disposition IN ('SALE', 'APPOINTMENT_SET') THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as conversion_rate
      FROM opening_segments
      WHERE agent_name IS NOT NULL
      GROUP BY agent_name
      HAVING COUNT(*) >= 5  -- Only show agents with at least 5 calls
      ORDER BY conversion_rate DESC, avg_success_score DESC
      LIMIT 50
    `);

    return NextResponse.json({
      success: true,
      agents: agents || []
    });

  } catch (error: any) {
    console.error('Failed to fetch agent performance:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch agent performance' },
      { status: 500 }
    );
  }
}