import { NextResponse } from "next/server";
import { Client } from "pg";

export async function GET() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // Get overall totals
    const totals = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status='completed') as completed,
        COUNT(*) FILTER (WHERE status='failed') as failed,
        COUNT(*) FILTER (WHERE status='running') as running
      FROM ai_test_runs
    `);

    // Get tests run in last 7 days
    const last7 = await client.query(`
      SELECT COUNT(*) as n
      FROM ai_test_runs
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    // Calculate average WER only for tests with ground truth
    const werRow = await client.query(`
      SELECT AVG(r.transcript_wer) as avg_wer
      FROM ai_test_runs r
      JOIN ai_test_cases tc ON tc.id = r.test_case_id
      WHERE r.status = 'completed'
      AND tc.expected_transcript IS NOT NULL
      AND tc.expected_transcript != ''
    `);

    // Calculate success rate (WER <= 0.15 is considered success)
    const successRate = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE r.transcript_wer <= 0.15) as success,
        COUNT(*) as total
      FROM ai_test_runs r
      JOIN ai_test_cases tc ON tc.id = r.test_case_id
      WHERE r.status = 'completed'
      AND tc.expected_transcript IS NOT NULL
      AND tc.expected_transcript != ''
    `);

    await client.end();

    const avgWer = werRow.rows[0].avg_wer;
    const hasGroundTruth = avgWer !== null;
    const successCount = Number(successRate.rows[0].success || 0);
    const totalWithGroundTruth = Number(successRate.rows[0].total || 0);
    const successPct = totalWithGroundTruth > 0
      ? Math.round((successCount / totalWithGroundTruth) * 100)
      : null;

    return NextResponse.json({
      completed: Number(totals.rows[0].completed || 0),
      failed: Number(totals.rows[0].failed || 0),
      running: Number(totals.rows[0].running || 0),
      tests_last_7d: Number(last7.rows[0].n || 0),
      avg_wer: hasGroundTruth ? Number(avgWer).toFixed(4) : "no_ground_truth",
      wer_label: hasGroundTruth ? `${(Number(avgWer) * 100).toFixed(2)}%` : "No ground truth",
      success_rate: successPct !== null ? `${successPct}%` : "N/A",
      tests_with_ground_truth: totalWithGroundTruth
    });

  } catch (error: any) {
    console.error('Failed to fetch metrics:', error);
    await client.end();
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}