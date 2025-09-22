import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// GET /api/testing/metrics - Get testing metrics and analytics
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '7');
    const engine = searchParams.get('engine') || null;

    // Get overall metrics
    const overallMetrics = await db.one(`
      SELECT
        COUNT(DISTINCT tr.id) as total_tests,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.status = 'completed') as successful_tests,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.status = 'failed') as failed_tests,
        AVG(tr.transcript_wer) FILTER (WHERE tr.transcript_wer IS NOT NULL) as avg_wer,
        AVG(tr.transcript_cer) FILTER (WHERE tr.transcript_cer IS NOT NULL) as avg_cer,
        AVG(tr.total_execution_time_ms) as avg_execution_time_ms,
        MIN(tr.transcript_wer) as best_wer,
        MAX(tr.transcript_wer) as worst_wer,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tr.transcript_wer) as median_wer,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tr.transcript_wer) as p95_wer
      FROM ai_test_runs tr
      WHERE tr.created_at >= NOW() - ($1::text || ' days')::interval
        ${engine ? "AND tr.transcription_engine = $2" : ""}
    `, engine ? [days, engine] : [days]);

    // Get metrics by category
    const categoryMetrics = await db.manyOrNone(`
      SELECT
        tc.test_category,
        COUNT(DISTINCT tr.id) as test_count,
        AVG(tr.transcript_wer) as avg_wer,
        AVG(tr.transcript_cer) as avg_cer,
        AVG(tr.total_execution_time_ms) as avg_time_ms,
        MIN(tr.transcript_wer) as best_wer,
        MAX(tr.transcript_wer) as worst_wer,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.transcript_wer < 0.05) as excellent_count,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.transcript_wer >= 0.05 AND tr.transcript_wer < 0.15) as good_count,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.transcript_wer >= 0.15 AND tr.transcript_wer < 0.25) as fair_count,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.transcript_wer >= 0.25) as poor_count
      FROM ai_test_runs tr
      JOIN ai_test_cases tc ON tc.id = tr.test_case_id
      WHERE tr.created_at >= NOW() - ($1::text || ' days')::interval
        AND tr.status = 'completed'
        ${engine ? "AND tr.transcription_engine = $2" : ""}
      GROUP BY tc.test_category
      ORDER BY avg_wer ASC
    `, engine ? [days, engine] : [days]);

    // Get engine comparison
    const engineComparison = await db.manyOrNone(`
      SELECT
        tr.transcription_engine as engine,
        COUNT(*) as test_count,
        AVG(tr.transcript_wer) as avg_wer,
        AVG(tr.actual_transcript_confidence) as avg_confidence,
        AVG(tr.transcription_time_ms) as avg_time_ms,
        SUM(tr.total_cost_cents) / 100.0 as total_cost_dollars,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tr.transcript_wer) as median_wer,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tr.transcript_wer) as p95_wer
      FROM ai_test_runs tr
      WHERE tr.created_at >= NOW() - ($1::text || ' days')::interval
        AND tr.status = 'completed'
        AND tr.transcription_engine IS NOT NULL
      GROUP BY tr.transcription_engine
      ORDER BY avg_wer ASC
    `, [days]);

    // Get daily trends
    const dailyTrends = await db.manyOrNone(`
      SELECT
        DATE(tr.created_at) as date,
        COUNT(*) as test_count,
        AVG(tr.transcript_wer) as avg_wer,
        AVG(tr.total_execution_time_ms) as avg_time_ms,
        COUNT(DISTINCT tr.transcription_engine) as engines_tested
      FROM ai_test_runs tr
      WHERE tr.created_at >= NOW() - ($1::text || ' days')::interval
        AND tr.status = 'completed'
        ${engine ? "AND tr.transcription_engine = $2" : ""}
      GROUP BY DATE(tr.created_at)
      ORDER BY date DESC
    `, engine ? [days, engine] : [days]);

    // Get worst performing test cases
    const worstPerformers = await db.manyOrNone(`
      SELECT
        tc.name,
        tc.test_category,
        tc.difficulty_level,
        COUNT(tr.id) as run_count,
        AVG(tr.transcript_wer) as avg_wer,
        MAX(tr.transcript_wer) as worst_wer,
        STRING_AGG(DISTINCT tr.transcription_engine, ', ') as engines_tested
      FROM ai_test_cases tc
      JOIN ai_test_runs tr ON tr.test_case_id = tc.id
      WHERE tr.created_at >= NOW() - ($1::text || ' days')::interval
        AND tr.status = 'completed'
        AND tr.transcript_wer IS NOT NULL
      GROUP BY tc.id, tc.name, tc.test_category, tc.difficulty_level
      HAVING AVG(tr.transcript_wer) > 0.25
      ORDER BY avg_wer DESC
      LIMIT 10
    `, [days]);

    // Get improvement opportunities
    const improvements = await db.manyOrNone(`
      SELECT
        tf.error_category,
        COUNT(*) as occurrence_count,
        AVG(tr.transcript_wer) as avg_wer_when_occurs,
        COUNT(DISTINCT tc.test_category) as affected_categories,
        COUNT(tf.corrected_transcript) as corrections_available
      FROM ai_test_feedback tf
      JOIN ai_test_runs tr ON tr.id = tf.test_run_id
      JOIN ai_test_cases tc ON tc.id = tr.test_case_id
      WHERE tf.created_at >= NOW() - ($1::text || ' days')::interval
        AND tf.error_category IS NOT NULL
      GROUP BY tf.error_category
      HAVING COUNT(*) >= 3
      ORDER BY occurrence_count DESC
    `, [days]);

    // Calculate cost savings from improvements
    const costAnalysis = await db.one(`
      SELECT
        COUNT(*) as total_tests_run,
        SUM(total_cost_cents) / 100.0 as total_cost_dollars,
        AVG(total_cost_cents) / 100.0 as avg_cost_per_test,
        (
          SELECT AVG(transcript_wer)
          FROM ai_test_runs
          WHERE created_at >= NOW() - INTERVAL '30 days'
            AND created_at < NOW() - ($1::text || ' days')::interval
        ) as previous_avg_wer,
        (
          SELECT AVG(transcript_wer)
          FROM ai_test_runs
          WHERE created_at >= NOW() - ($1::text || ' days')::interval
        ) as current_avg_wer
      FROM ai_test_runs
      WHERE created_at >= NOW() - ($1::text || ' days')::interval
    `, [days]);

    // Calculate improvement percentage
    const improvementPct = costAnalysis.previous_avg_wer && costAnalysis.current_avg_wer
      ? ((costAnalysis.previous_avg_wer - costAnalysis.current_avg_wer) / costAnalysis.previous_avg_wer) * 100
      : 0;

    // Generate recommendations
    const recommendations = generateRecommendations({
      overallMetrics,
      categoryMetrics,
      engineComparison,
      improvements,
      worstPerformers
    });

    return NextResponse.json({
      success: true,
      metrics: {
        overall: overallMetrics,
        by_category: categoryMetrics,
        engine_comparison: engineComparison,
        daily_trends: dailyTrends,
        worst_performers: worstPerformers,
        improvement_opportunities: improvements,
        cost_analysis: {
          ...costAnalysis,
          improvement_percentage: improvementPct
        }
      },
      recommendations
    });

  } catch (error: any) {
    console.error('Failed to fetch metrics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}

/**
 * Generate improvement recommendations based on metrics
 */
function generateRecommendations(data: any): string[] {
  const recommendations: string[] = [];

  // Check overall WER
  if (data.overallMetrics.avg_wer > 0.20) {
    recommendations.push('Overall WER is above 20%. Consider upgrading to a better ASR model or improving audio quality.');
  }

  // Check category-specific issues
  for (const category of data.categoryMetrics || []) {
    if (category.avg_wer > 0.30 && category.test_count >= 5) {
      recommendations.push(`High error rate (${(category.avg_wer * 100).toFixed(1)}%) in "${category.test_category}" category. Focus improvements here.`);
    }
  }

  // Engine comparison
  if (data.engineComparison.length > 1) {
    const bestEngine = data.engineComparison[0];
    const worstEngine = data.engineComparison[data.engineComparison.length - 1];
    if (worstEngine.avg_wer > bestEngine.avg_wer * 1.5) {
      recommendations.push(`Consider using ${bestEngine.engine} more often - it performs ${((1 - bestEngine.avg_wer / worstEngine.avg_wer) * 100).toFixed(0)}% better than ${worstEngine.engine}.`);
    }
  }

  // Error patterns
  for (const improvement of data.improvements || []) {
    if (improvement.occurrence_count >= 10) {
      recommendations.push(`"${improvement.error_category}" errors occur frequently (${improvement.occurrence_count} times). ${improvement.corrections_available} corrections available for training.`);
    }
  }

  // Worst performers
  if (data.worstPerformers.length > 0) {
    recommendations.push(`${data.worstPerformers.length} test cases consistently perform poorly. Consider removing or improving these scenarios.`);
  }

  // If no issues found
  if (recommendations.length === 0) {
    recommendations.push('System is performing well. Continue monitoring for regressions.');
  }

  return recommendations;
}