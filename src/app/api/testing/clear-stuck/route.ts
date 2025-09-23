import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// POST /api/testing/clear-stuck - Clear stuck test runs
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Find stuck runs (running for more than 10 minutes)
    const stuckRuns = await db.manyOrNone(`
      UPDATE ai_suite_runs
      SET
        status = 'failed',
        completed_at = NOW()
      WHERE
        status = 'running'
        AND started_at < NOW() - INTERVAL '10 minutes'
      RETURNING id, suite_id
    `);

    // Also clear any stuck individual test runs
    const stuckTests = await db.manyOrNone(`
      UPDATE ai_test_runs
      SET
        status = 'failed',
        error_message = 'Test terminated - stuck in running state',
        completed_at = NOW()
      WHERE
        status = 'running'
        AND created_at < NOW() - INTERVAL '10 minutes'
      RETURNING id
    `);

    return NextResponse.json({
      success: true,
      message: 'Cleared stuck test runs',
      cleared: {
        suite_runs: stuckRuns.length,
        test_runs: stuckTests.length
      },
      details: {
        suite_runs: stuckRuns,
        test_runs: stuckTests
      }
    });

  } catch (error: any) {
    console.error('[Clear Stuck] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear stuck runs' },
      { status: 500 }
    );
  }
}

// GET /api/testing/clear-stuck - Check for stuck runs
export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check for stuck suite runs
    const stuckSuiteRuns = await db.manyOrNone(`
      SELECT id, suite_id, started_at, status
      FROM ai_suite_runs
      WHERE status = 'running'
      ORDER BY started_at DESC
      LIMIT 10
    `);

    // Check for stuck test runs
    const stuckTestRuns = await db.manyOrNone(`
      SELECT COUNT(*) as count
      FROM ai_test_runs
      WHERE status = 'running'
    `);

    const hasStuckRuns = stuckSuiteRuns.length > 0 || (stuckTestRuns[0]?.count > 0);

    return NextResponse.json({
      success: true,
      has_stuck_runs: hasStuckRuns,
      stuck_suite_runs: stuckSuiteRuns.length,
      stuck_test_runs: stuckTestRuns[0]?.count || 0,
      details: {
        suite_runs: stuckSuiteRuns
      },
      recommendation: hasStuckRuns
        ? 'Found stuck runs. Call POST to clear them.'
        : 'No stuck runs found. System is ready.'
    });

  } catch (error: any) {
    console.error('[Clear Stuck] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check stuck runs' },
      { status: 500 }
    );
  }
}