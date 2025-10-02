import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { withStrictAgencyIsolation } from '@/lib/security/agency-isolation';

export const dynamic = 'force-dynamic';

export const GET = withStrictAgencyIsolation(async (req, context) => {
  try {
    // Get overall stats, filtered by agency
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_analyzed,
        AVG(overall_score) as avg_compliance_score,
        SUM(CASE WHEN compliance_passed THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT as pass_rate,
        SUM(CASE WHEN flagged_for_review THEN 1 ELSE 0 END) as flagged_count,
        AVG(word_match_percentage) as avg_word_match,
        AVG(phrase_match_percentage) as avg_phrase_match
      FROM post_close_compliance
      WHERE agency_id = $1
    `, [context.agencyId]);

    // Get script count for this agency
    const scriptCount = await db.oneOrNone(`
      SELECT COUNT(*) as script_count
      FROM post_close_scripts
      WHERE active = true AND agency_id = $1
    `, [context.agencyId]);

    return NextResponse.json({
      success: true,
      ...stats,
      active_scripts: scriptCount?.script_count || 0
    });

  } catch (error: any) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch stats' },
      { status: 500 }
    );
  }
});
