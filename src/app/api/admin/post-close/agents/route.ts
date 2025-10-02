import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    // Get agent performance stats, filtered by agency
    const agents = await db.manyOrNone(`
      SELECT
        agent_name,
        COUNT(*) as total_analyzed,
        SUM(CASE WHEN compliance_passed THEN 1 ELSE 0 END) as total_passed,
        SUM(CASE WHEN NOT compliance_passed THEN 1 ELSE 0 END) as total_failed,
        AVG(overall_score) as avg_compliance_score,
        AVG(word_match_percentage) as avg_word_match,
        AVG(phrase_match_percentage) as avg_phrase_match,
        SUM(CASE WHEN flagged_for_review THEN 1 ELSE 0 END) as violations_count,
        (SUM(CASE WHEN compliance_passed THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT) * 100 as pass_rate
      FROM post_close_compliance
      WHERE agent_name IS NOT NULL AND agency_id = $1
      GROUP BY agent_name
      ORDER BY avg_compliance_score DESC
    `, [context.agencyId]);

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
});
