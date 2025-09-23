import { NextResponse } from "next/server";
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get overall totals
    const totals = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE status='passed') as completed,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        COUNT(*) FILTER (WHERE status='error') as error,
        COUNT(*) as total
      FROM test_results
    `);

    // Get tests run in last 7 days
    const last7 = await db.one(`
      SELECT COUNT(*) as n
      FROM test_results
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    // Calculate average WER for tests with results
    const werStats = await db.one(`
      SELECT
        AVG(wer_score) as avg_wer,
        MIN(wer_score) as min_wer,
        MAX(wer_score) as max_wer,
        AVG(accuracy) as avg_accuracy,
        COUNT(*) as total_with_wer
      FROM test_results
      WHERE wer_score IS NOT NULL
        AND status IN ('passed', 'failed')
    `);

    // Calculate success rate (WER <= 15% is considered success)
    const successRate = await db.one(`
      SELECT
        COUNT(*) FILTER (WHERE wer_score <= 15) as success,
        COUNT(*) as total
      FROM test_results
      WHERE wer_score IS NOT NULL
        AND status IN ('passed', 'failed')
    `);

    // Get average processing time
    const processingStats = await db.one(`
      SELECT
        AVG(processing_time_ms) as avg_time,
        MIN(processing_time_ms) as min_time,
        MAX(processing_time_ms) as max_time
      FROM test_results
      WHERE processing_time_ms IS NOT NULL
    `);

    // Get test suite count
    const suiteStats = await db.one(`
      SELECT
        COUNT(DISTINCT s.id) as total_suites,
        COUNT(DISTINCT tc.id) as total_test_cases
      FROM test_suites s
      LEFT JOIN test_cases tc ON tc.suite_id = s.id
      WHERE s.status = 'active'
    `);

    const avgWer = parseFloat(werStats.avg_wer || '0');
    const hasResults = parseInt(werStats.total_with_wer) > 0;
    const successCount = parseInt(successRate.success || '0');
    const totalWithWer = parseInt(successRate.total || '0');
    const successPct = totalWithWer > 0
      ? Math.round((successCount / totalWithWer) * 100)
      : 0;

    return NextResponse.json({
      // Main dashboard metrics
      completed: parseInt(totals.completed || '0'),
      failed: parseInt(totals.failed || '0'),
      error: parseInt(totals.error || '0'),
      running: 0, // We don't track running status in our schema
      total_tests: parseInt(totals.total || '0'),
      tests_last_7d: parseInt(last7.n || '0'),

      // WER metrics
      avg_wer: hasResults ? avgWer.toFixed(2) : "0.00",
      wer_label: hasResults ? `${avgWer.toFixed(1)}%` : "No data",
      min_wer: hasResults ? parseFloat(werStats.min_wer).toFixed(2) : "N/A",
      max_wer: hasResults ? parseFloat(werStats.max_wer).toFixed(2) : "N/A",
      avg_accuracy: hasResults ? parseFloat(werStats.avg_accuracy || '0').toFixed(1) : "0",

      // Success metrics
      success_rate: successPct > 0 ? `${successPct}%` : "0%",
      tests_with_results: totalWithWer,

      // Processing metrics
      avg_processing_time: processingStats.avg_time
        ? Math.round(parseFloat(processingStats.avg_time))
        : 0,

      // Suite metrics
      total_suites: parseInt(suiteStats.total_suites || '0'),
      total_test_cases: parseInt(suiteStats.total_test_cases || '0')
    });

  } catch (error: any) {
    console.error('Failed to fetch metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics', message: error.message },
      { status: 500 }
    );
  }
}