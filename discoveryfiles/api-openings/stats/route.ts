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
    // Get overall statistics from REAL data
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_openings,
        AVG(success_score) as avg_success_score,
        AVG(engagement_score) as avg_engagement_score,
        AVG(pace_wpm) as avg_pace,
        AVG(silence_ratio) as avg_silence_ratio,
        SUM(CASE WHEN call_continued THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as overall_success_rate,
        SUM(CASE WHEN disposition IN ('SALE', 'APPOINTMENT_SET') THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as conversion_rate,
        COUNT(DISTINCT agent_name) as unique_agents
      FROM opening_segments
    `);

    // Get breakdown by disposition
    const dispositions = await db.manyOrNone(`
      SELECT
        disposition,
        COUNT(*) as count,
        AVG(success_score) as avg_score
      FROM opening_segments
      GROUP BY disposition
      ORDER BY count DESC
      LIMIT 10
    `);

    return NextResponse.json({
      success: true,
      ...stats,
      dispositions: dispositions || []
    });

  } catch (error: any) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}