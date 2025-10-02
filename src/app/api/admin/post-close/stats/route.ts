import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get overall stats
    const stats = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_analyzed,
        AVG(overall_score) as avg_compliance_score,
        SUM(CASE WHEN compliance_passed THEN 1 ELSE 0 END)::FLOAT / COUNT(*)::FLOAT as pass_rate,
        SUM(CASE WHEN flagged_for_review THEN 1 ELSE 0 END) as flagged_count,
        AVG(word_match_percentage) as avg_word_match,
        AVG(phrase_match_percentage) as avg_phrase_match
      FROM post_close_compliance
    `);

    // Get script count
    const scriptCount = await db.oneOrNone(`
      SELECT COUNT(*) as script_count FROM post_close_scripts WHERE active = true
    `);

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
}
