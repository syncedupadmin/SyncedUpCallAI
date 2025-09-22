import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// GET /api/testing/monitor - Monitor AI testing system health and failures
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const hours = parseInt(searchParams.get('hours') || '24');

    // Get system health metrics
    const health = await db.one(`
      SELECT
        COUNT(DISTINCT tc.id) as total_test_cases,
        COUNT(DISTINCT tc.id) FILTER (WHERE tc.is_active = true) as active_test_cases,
        COUNT(DISTINCT tc.id) FILTER (WHERE tc.audio_url IS NOT NULL) as test_cases_with_audio,
        COUNT(DISTINCT s.id) as total_suites,
        COUNT(DISTINCT s.id) FILTER (WHERE s.is_active = true) as active_suites
      FROM ai_test_cases tc
      FULL OUTER JOIN ai_test_suites s ON s.id = tc.suite_id
    `);

    // Get recent test run statistics
    const recentRuns = await db.one(`
      SELECT
        COUNT(*) as total_runs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_runs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_runs,
        COUNT(*) FILTER (WHERE status = 'running') as running_runs,
        AVG(transcript_wer) FILTER (WHERE transcript_wer IS NOT NULL) as avg_wer,
        MIN(transcript_wer) FILTER (WHERE transcript_wer IS NOT NULL) as best_wer,
        MAX(transcript_wer) FILTER (WHERE transcript_wer IS NOT NULL) as worst_wer,
        AVG(total_execution_time_ms) as avg_execution_time_ms
      FROM ai_test_runs
      WHERE created_at >= NOW() - INTERVAL '${hours} hours'
    `);

    // Get failure reasons
    const failureReasons = await db.manyOrNone(`
      SELECT
        error_message,
        COUNT(*) as count,
        MAX(created_at) as last_occurred
      FROM ai_test_runs
      WHERE status = 'failed'
        AND created_at >= NOW() - INTERVAL '${hours} hours'
        AND error_message IS NOT NULL
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT 10
    `);

    // Get test cases with invalid audio URLs (recent failures)
    const invalidAudioUrls = await db.manyOrNone(`
      SELECT DISTINCT
        tc.id,
        tc.name,
        tc.audio_url,
        tr.error_message,
        COUNT(tr.id) as failure_count
      FROM ai_test_cases tc
      JOIN ai_test_runs tr ON tr.test_case_id = tc.id
      WHERE tr.status = 'failed'
        AND tr.created_at >= NOW() - INTERVAL '${hours} hours'
        AND (
          tr.error_message LIKE '%audio%'
          OR tr.error_message LIKE '%URL%'
          OR tr.error_message LIKE '%recording%'
          OR tr.error_message LIKE '%Content-Type%'
        )
      GROUP BY tc.id, tc.name, tc.audio_url, tr.error_message
      ORDER BY failure_count DESC
      LIMIT 20
    `);

    // Get transcription queue status
    const transcriptionQueue = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60)
          FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL) as avg_completion_minutes
      FROM transcription_queue
      WHERE created_at >= NOW() - INTERVAL '${hours} hours'
    `);

    // Calculate health score (0-100)
    let healthScore = 100;
    const issues = [];

    // Deduct points for failures
    if (recentRuns.total_runs > 0) {
      const failureRate = (recentRuns.failed_runs || 0) / recentRuns.total_runs;
      if (failureRate > 0.5) {
        healthScore -= 40;
        issues.push(`High failure rate: ${Math.round(failureRate * 100)}%`);
      } else if (failureRate > 0.2) {
        healthScore -= 20;
        issues.push(`Moderate failure rate: ${Math.round(failureRate * 100)}%`);
      }
    }

    // Deduct points for no active test cases
    if (health.active_test_cases === '0') {
      healthScore -= 30;
      issues.push('No active test cases');
    }

    // Deduct points for invalid audio URLs
    if (invalidAudioUrls.length > 5) {
      healthScore -= 20;
      issues.push(`${invalidAudioUrls.length} test cases have invalid audio URLs`);
    }

    // Deduct points for stuck transcriptions
    if (parseInt(transcriptionQueue.processing) > 10) {
      healthScore -= 10;
      issues.push(`${transcriptionQueue.processing} transcriptions stuck in processing`);
    }

    // Generate recommendations
    const recommendations = [];

    if (invalidAudioUrls.length > 0) {
      recommendations.push('Run /api/testing/validate-audio-urls?fix=true to fix invalid URLs');
    }

    if (recentRuns.failed_runs > recentRuns.successful_runs) {
      recommendations.push('Investigate high failure rate - check logs for common errors');
    }

    if (health.active_test_cases === '0') {
      recommendations.push('Import test cases from Convoso or create manual test cases');
    }

    if (failureReasons.some(r => r.error_message?.includes('timeout'))) {
      recommendations.push('Increase timeouts or optimize slow operations');
    }

    return NextResponse.json({
      success: true,
      health_score: healthScore,
      status: healthScore >= 80 ? 'healthy' : healthScore >= 50 ? 'degraded' : 'unhealthy',
      issues,
      recommendations,
      metrics: {
        system: health,
        recent_runs: recentRuns,
        transcription_queue: transcriptionQueue,
        time_window_hours: hours
      },
      failures: {
        by_reason: failureReasons,
        invalid_audio_urls: invalidAudioUrls
      },
      alerts: issues.length > 0 ? {
        level: healthScore < 50 ? 'critical' : 'warning',
        messages: issues
      } : null
    });

  } catch (error: any) {
    console.error('[Monitor] Error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to get monitoring data',
        health_score: 0,
        status: 'error'
      },
      { status: 500 }
    );
  }
}