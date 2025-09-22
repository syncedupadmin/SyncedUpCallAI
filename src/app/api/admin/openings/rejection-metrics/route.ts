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
    // Get overall rejection metrics
    const overallMetrics = await db.oneOrNone(`
      SELECT
        COUNT(*) as total_rejections,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals_attempted,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as led_to_pitch,
        COUNT(*) FILTER (WHERE rebuttal_to_outcome = 'sale') as led_to_sale,
        COUNT(*) FILTER (WHERE rebuttal_to_outcome = 'appointment') as led_to_appointment,
        ROUND(
          COUNT(*) FILTER (WHERE rebuttal_attempted = true)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as rebuttal_attempt_rate,
        ROUND(
          COUNT(*) FILTER (WHERE led_to_pitch = true)::DECIMAL /
          NULLIF(COUNT(*) FILTER (WHERE rebuttal_attempted = true), 0) * 100, 1
        ) as pitch_achievement_rate,
        ROUND(
          COUNT(*) FILTER (WHERE rebuttal_to_outcome IN ('sale', 'appointment'))::DECIMAL /
          NULLIF(COUNT(*) FILTER (WHERE rebuttal_attempted = true), 0) * 100, 1
        ) as rebuttal_success_rate
      FROM opening_segments
      WHERE rejection_detected = true
      AND created_at >= NOW() - INTERVAL '30 days'
    `);

    // Get rejection types distribution
    const rejectionTypes = await db.manyOrNone(`
      SELECT
        rejection_type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals_attempted,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as led_to_pitch,
        ROUND(
          COUNT(*) FILTER (WHERE rebuttal_attempted = true)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as rebuttal_rate
      FROM opening_segments
      WHERE rejection_detected = true
      AND rejection_type IS NOT NULL
      AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY rejection_type
      ORDER BY count DESC
    `);

    // Get successful rebuttal patterns
    const successfulPatterns = await db.manyOrNone(`
      SELECT
        os.id,
        os.transcript,
        os.rejection_type,
        os.rebuttal_to_outcome,
        os.agent_name,
        os.duration_sec
      FROM opening_segments os
      WHERE os.rejection_detected = true
      AND os.rebuttal_attempted = true
      AND os.rebuttal_to_outcome IN ('sale', 'appointment', 'pitched')
      AND os.created_at >= NOW() - INTERVAL '30 days'
      ORDER BY
        CASE rebuttal_to_outcome
          WHEN 'sale' THEN 1
          WHEN 'appointment' THEN 2
          ELSE 3
        END,
        os.created_at DESC
      LIMIT 10
    `);

    // Get agent rejection performance
    const agentPerformance = await db.manyOrNone(`
      SELECT
        agent_name,
        COUNT(*) as total_rejections,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals_attempted,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as led_to_pitch,
        COUNT(*) FILTER (WHERE rebuttal_to_outcome = 'sale') as sales,
        ROUND(
          COUNT(*) FILTER (WHERE rebuttal_attempted = true)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as rebuttal_attempt_rate,
        ROUND(
          COUNT(*) FILTER (WHERE led_to_pitch = true)::DECIMAL /
          NULLIF(COUNT(*) FILTER (WHERE rebuttal_attempted = true), 0) * 100, 1
        ) as pitch_success_rate
      FROM opening_segments
      WHERE rejection_detected = true
      AND agent_name IS NOT NULL
      AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY agent_name
      HAVING COUNT(*) >= 5  -- Only show agents with at least 5 rejections
      ORDER BY rebuttal_attempt_rate DESC NULLS LAST
      LIMIT 20
    `);

    // Get time-based trends (daily)
    const dailyTrends = await db.manyOrNone(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as rejections,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as pitches,
        COUNT(*) FILTER (WHERE rebuttal_to_outcome IN ('sale', 'appointment')) as conversions
      FROM opening_segments
      WHERE rejection_detected = true
      AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Get missed opportunities (rejections without rebuttals)
    const missedOpportunities = await db.manyOrNone(`
      SELECT
        os.id,
        os.transcript,
        os.rejection_type,
        os.agent_name,
        os.duration_sec,
        os.disposition
      FROM opening_segments os
      WHERE os.rejection_detected = true
      AND os.rebuttal_attempted = false
      AND os.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY os.created_at DESC
      LIMIT 10
    `);

    // Calculate coaching priority scores
    const coachingPriorities = await db.manyOrNone(`
      SELECT
        agent_name,
        COUNT(*) as total_rejections,
        COUNT(*) FILTER (WHERE rebuttal_attempted = false) as missed_rebuttals,
        ROUND(
          COUNT(*) FILTER (WHERE rebuttal_attempted = false)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as missed_rate,
        ROUND(
          COUNT(*) FILTER (WHERE rebuttal_attempted = false)::DECIMAL * 10 +
          (100 - COALESCE(
            COUNT(*) FILTER (WHERE led_to_pitch = true)::DECIMAL /
            NULLIF(COUNT(*) FILTER (WHERE rebuttal_attempted = true), 0) * 100, 0
          )), 1
        ) as coaching_priority_score
      FROM opening_segments
      WHERE rejection_detected = true
      AND agent_name IS NOT NULL
      AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY agent_name
      HAVING COUNT(*) >= 3  -- At least 3 rejections in the week
      ORDER BY coaching_priority_score DESC NULLS LAST
      LIMIT 10
    `);

    return NextResponse.json({
      success: true,
      metrics: {
        overall: overallMetrics || {},
        rejection_types: rejectionTypes || [],
        successful_patterns: successfulPatterns || [],
        agent_performance: agentPerformance || [],
        daily_trends: dailyTrends || [],
        missed_opportunities: missedOpportunities || [],
        coaching_priorities: coachingPriorities || []
      }
    });

  } catch (error: any) {
    console.error('Failed to fetch rejection metrics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rejection metrics' },
      { status: 500 }
    );
  }
}