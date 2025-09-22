import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { updateAgentRejectionMetrics } from '@/server/lib/rejection-analyzer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const period = req.nextUrl.searchParams.get('period') || 'week';
    const agentName = req.nextUrl.searchParams.get('agent');

    let intervalClause = "INTERVAL '7 days'";
    if (period === 'day') intervalClause = "INTERVAL '1 day'";
    if (period === 'month') intervalClause = "INTERVAL '30 days'";

    // Base query for agent performance
    let whereClause = `WHERE ra.created_at >= NOW() - ${intervalClause}`;
    if (agentName) {
      whereClause += ` AND ra.agent_name = '${agentName.replace(/'/g, "''")}'`;
    }

    // Get agent rejection performance from both sources
    const agentPerformance = await db.manyOrNone(`
      WITH rejection_stats AS (
        SELECT
          agent_name,
          agent_id,
          COUNT(*) as total_calls,
          COUNT(*) FILTER (WHERE rejection_detected = true) as total_rejections,
          COUNT(*) FILTER (WHERE call_tier = 'immediate_rejection') as immediate_rejections,
          COUNT(*) FILTER (WHERE call_tier = 'short_rejection') as short_rejections,
          COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals_attempted,
          COUNT(*) FILTER (WHERE led_to_pitch = true) as pitched_after_rejection,
          COUNT(*) FILTER (WHERE rebuttal_to_outcome = 'sale') as sales_after_rejection,
          COUNT(*) FILTER (WHERE rebuttal_to_outcome = 'appointment') as appointments_after_rejection,
          COUNT(*) FILTER (WHERE stayed_professional = false) as lost_composure_count,
          AVG(professionalism_score) as avg_professionalism,
          AVG(rebuttal_quality_score) as avg_rebuttal_quality,
          AVG(script_compliance_score) as avg_script_compliance
        FROM rejection_analysis ra
        ${whereClause}
        GROUP BY agent_name, agent_id
      )
      SELECT
        agent_name,
        agent_id,
        total_calls,
        total_rejections,
        immediate_rejections,
        short_rejections,
        rebuttals_attempted,
        pitched_after_rejection,
        sales_after_rejection,
        appointments_after_rejection,
        lost_composure_count,
        ROUND(avg_professionalism, 1) as avg_professionalism,
        ROUND(avg_rebuttal_quality, 1) as avg_rebuttal_quality,
        ROUND(avg_script_compliance, 1) as avg_script_compliance,
        ROUND(rebuttals_attempted::DECIMAL / NULLIF(total_rejections, 0) * 100, 1) as rebuttal_attempt_rate,
        ROUND(pitched_after_rejection::DECIMAL / NULLIF(rebuttals_attempted, 0) * 100, 1) as pitch_achievement_rate,
        ROUND(sales_after_rejection::DECIMAL / NULLIF(total_rejections, 0) * 100, 1) as rejection_to_sale_rate,
        -- Coaching priority score (higher = needs more coaching)
        ROUND(
          CASE
            WHEN total_rejections = 0 THEN 0
            ELSE
              (1 - (rebuttals_attempted::DECIMAL / NULLIF(total_rejections, 0))) * 50 +
              (1 - COALESCE(avg_professionalism, 100) / 100) * 30 +
              (lost_composure_count::DECIMAL / NULLIF(total_rejections, 0)) * 20
          END, 1
        ) as coaching_priority_score
      FROM rejection_stats
      WHERE total_rejections > 0
      ORDER BY coaching_priority_score DESC NULLS LAST
    `);

    // Get top performing rebuttals
    const topRebuttals = await db.manyOrNone(`
      SELECT
        rp.pattern_name,
        rp.rejection_type,
        rp.rebuttal_text,
        rp.times_used,
        rp.success_rate,
        rp.avg_quality_score,
        rp.led_to_sale_count,
        rp.led_to_appointment_count
      FROM rebuttal_patterns rp
      WHERE rp.status = 'active'
      AND rp.times_used >= 5
      ORDER BY rp.success_rate DESC
      LIMIT 10
    `);

    // Get recent coaching opportunities
    const coachingOpportunities = await db.manyOrNone(`
      SELECT
        ra.id,
        ra.call_id,
        ra.agent_name,
        ra.rejection_type,
        ra.rejection_severity,
        ra.rebuttal_attempted,
        ra.professionalism_score,
        ra.coaching_notes,
        ra.missed_opportunities,
        ra.created_at,
        c.recording_url,
        c.duration_sec
      FROM rejection_analysis ra
      JOIN calls c ON c.id = ra.call_id
      WHERE ra.rebuttal_attempted = false
      OR ra.professionalism_score < 70
      OR ra.script_compliance_score < 50
      ORDER BY ra.created_at DESC
      LIMIT 20
    `);

    // Get rejection trends over time
    const trends = await db.manyOrNone(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total_rejections,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as rebuttals,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as pitches,
        COUNT(*) FILTER (WHERE rebuttal_to_outcome IN ('sale', 'appointment')) as conversions,
        ROUND(AVG(professionalism_score), 1) as avg_professionalism,
        ROUND(AVG(rebuttal_quality_score), 1) as avg_rebuttal_quality
      FROM rejection_analysis
      WHERE rejection_detected = true
      AND created_at >= NOW() - ${intervalClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Summary statistics
    const summary = await db.oneOrNone(`
      SELECT
        COUNT(DISTINCT agent_name) as total_agents,
        COUNT(*) as total_rejections,
        COUNT(*) FILTER (WHERE rebuttal_attempted = true) as total_rebuttals,
        COUNT(*) FILTER (WHERE led_to_pitch = true) as total_pitches,
        COUNT(*) FILTER (WHERE rebuttal_to_outcome = 'sale') as total_sales,
        ROUND(
          COUNT(*) FILTER (WHERE rebuttal_attempted = true)::DECIMAL /
          NULLIF(COUNT(*), 0) * 100, 1
        ) as overall_rebuttal_rate,
        ROUND(
          COUNT(*) FILTER (WHERE led_to_pitch = true)::DECIMAL /
          NULLIF(COUNT(*) FILTER (WHERE rebuttal_attempted = true), 0) * 100, 1
        ) as overall_pitch_rate,
        ROUND(AVG(professionalism_score), 1) as avg_professionalism,
        ROUND(AVG(rebuttal_quality_score), 1) as avg_rebuttal_quality
      FROM rejection_analysis
      WHERE rejection_detected = true
      AND created_at >= NOW() - ${intervalClause}
    `);

    return NextResponse.json({
      success: true,
      period,
      summary: summary || {},
      agent_performance: agentPerformance || [],
      top_rebuttals: topRebuttals || [],
      coaching_opportunities: coachingOpportunities || [],
      trends: trends || []
    });

  } catch (error: any) {
    console.error('Failed to fetch rejection performance:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rejection performance' },
      { status: 500 }
    );
  }
}

// Update agent metrics
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { agent_id, agent_name } = await req.json();

    if (!agent_id || !agent_name) {
      return NextResponse.json(
        { error: 'agent_id and agent_name are required' },
        { status: 400 }
      );
    }

    // Update metrics for the agent
    await updateAgentRejectionMetrics(agent_id, agent_name);

    return NextResponse.json({
      success: true,
      message: `Metrics updated for agent ${agent_name}`
    });

  } catch (error: any) {
    console.error('Failed to update agent metrics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update agent metrics' },
      { status: 500 }
    );
  }
}