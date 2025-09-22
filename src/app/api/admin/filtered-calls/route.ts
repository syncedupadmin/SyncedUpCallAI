import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { getFilteringStats } from '@/server/lib/call-quality-classifier';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const period = req.nextUrl.searchParams.get('period') || 'week';
    let days = 7;
    if (period === 'day') days = 1;
    if (period === 'month') days = 30;

    // Get filtering statistics
    const stats = await getFilteringStats(days);

    // Get daily breakdown
    const dailyBreakdown = await db.manyOrNone(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE is_analyzable = true) as analyzed,
        COUNT(*) FILTER (WHERE is_analyzable = false) as filtered,
        COUNT(*) FILTER (WHERE classification = 'voicemail') as voicemails,
        COUNT(*) FILTER (WHERE classification = 'dead_air') as dead_air,
        COUNT(*) FILTER (WHERE classification = 'hold_music') as hold_music,
        COUNT(*) FILTER (WHERE classification = 'no_agent') as no_agent,
        COUNT(*) FILTER (WHERE classification = 'wrong_number') as wrong_numbers,
        COUNT(*) FILTER (WHERE classification = 'automated_system') as automated_systems,
        COUNT(*) FILTER (WHERE classification = 'technical_failure') as technical_failures,
        ROUND(
          COUNT(*) FILTER (WHERE is_analyzable = false)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as filter_rate_pct
      FROM call_quality_metrics
      WHERE created_at >= NOW() - INTERVAL '%s days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `, [days]);

    // Get recent filtered calls
    const recentFilteredCalls = await db.manyOrNone(`
      SELECT
        fcl.id,
        fcl.call_id,
        fcl.classification,
        fcl.filter_reason,
        fcl.confidence,
        fcl.duration_sec,
        fcl.word_count,
        fcl.created_at,
        c.agent_name,
        c.campaign,
        c.disposition
      FROM filtered_calls_log fcl
      JOIN calls c ON c.id = fcl.call_id
      WHERE fcl.created_at >= NOW() - INTERVAL '%s days'
      ORDER BY fcl.created_at DESC
      LIMIT 100
    `, [days]);

    // Get classification distribution
    const classificationBreakdown = await db.manyOrNone(`
      SELECT
        classification,
        COUNT(*) as count,
        AVG(quality_score) as avg_quality_score,
        AVG(word_count) as avg_word_count,
        AVG(silence_ratio * 100) as avg_silence_pct
      FROM call_quality_metrics
      WHERE created_at >= NOW() - INTERVAL '%s days'
      GROUP BY classification
      ORDER BY count DESC
    `, [days]);

    // Get agent-specific filtering stats
    const agentStats = await db.manyOrNone(`
      SELECT
        c.agent_name,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE cqm.is_analyzable = true) as analyzable_calls,
        COUNT(*) FILTER (WHERE cqm.classification = 'voicemail') as voicemails,
        COUNT(*) FILTER (WHERE cqm.classification = 'wrong_number') as wrong_numbers,
        COUNT(*) FILTER (WHERE cqm.classification = 'no_agent') as no_agent,
        ROUND(
          COUNT(*) FILTER (WHERE cqm.is_analyzable = false)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as filtered_rate_pct,
        AVG(cqm.quality_score) as avg_quality_score
      FROM calls c
      JOIN call_quality_metrics cqm ON cqm.call_id = c.id
      WHERE c.created_at >= NOW() - INTERVAL '%s days'
      AND c.agent_name IS NOT NULL
      GROUP BY c.agent_name
      HAVING COUNT(*) >= 10
      ORDER BY filtered_rate_pct DESC
    `, [days]);

    // Get voicemail patterns hit rate
    const voicemailPatterns = await db.manyOrNone(`
      SELECT
        pattern,
        times_matched,
        false_positive_count,
        confidence_boost,
        ROUND(
          times_matched::DECIMAL /
          NULLIF(times_matched + false_positive_count, 0) * 100, 1
        ) as accuracy_pct
      FROM voicemail_patterns
      WHERE is_active = true
      AND times_matched > 0
      ORDER BY times_matched DESC
      LIMIT 20
    `);

    // Calculate cost savings
    const savings = await db.oneOrNone(`
      SELECT
        COUNT(*) FILTER (WHERE is_analyzable = false) as calls_filtered,
        COUNT(*) FILTER (WHERE is_analyzable = false) * 2 as seconds_saved,
        COUNT(*) FILTER (WHERE is_analyzable = false) * 0.01 as dollars_saved,
        SUM(CASE WHEN is_analyzable = false THEN
          CASE classification
            WHEN 'voicemail' THEN 0.012
            WHEN 'dead_air' THEN 0.008
            WHEN 'wrong_number' THEN 0.015
            ELSE 0.01
          END
        ELSE 0 END) as estimated_api_cost_saved
      FROM call_quality_metrics
      WHERE created_at >= NOW() - INTERVAL '%s days'
    `, [days]);

    return NextResponse.json({
      success: true,
      period,
      stats: stats || {},
      daily_breakdown: dailyBreakdown || [],
      recent_filtered: recentFilteredCalls || [],
      classification_breakdown: classificationBreakdown || [],
      agent_stats: agentStats || [],
      voicemail_patterns: voicemailPatterns || [],
      savings: savings || {}
    });

  } catch (error: any) {
    console.error('Failed to fetch filtered calls data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch filtered calls data' },
      { status: 500 }
    );
  }
}