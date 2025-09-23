import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { runSuite } from '@/server/testing/bulk-tester';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for test execution

// POST /api/testing/run/[suiteId] - Run a test suite
export async function POST(
  req: NextRequest,
  { params }: { params: { suiteId: string } }
) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { suiteId } = params;

    // Verify suite exists
    const suite = await db.oneOrNone(`
      SELECT * FROM ai_test_suites WHERE id = $1 AND is_active = true
    `, [suiteId]);

    if (!suite) {
      return NextResponse.json(
        { error: 'Test suite not found' },
        { status: 404 }
      );
    }

    // Get options from request body
    const { parallel = 10, limit = 100 } = await req.json().catch(() => ({}));

    // Check if there's already a running test for this suite
    const runningTest = await db.oneOrNone(`
      SELECT id FROM ai_suite_runs
      WHERE suite_id = $1 AND status = 'running'
    `, [suiteId]);

    if (runningTest) {
      // Reuse the existing run instead of failing with 409
      return NextResponse.json({
        success: true,
        message: 'Test suite is already running',
        reused_run_id: runningTest.id,
        status: 'running'
      }, { status: 202 }); // 202 Accepted - request accepted but processing not complete
    }

    // Run the test suite using our simplified runner
    await runSuite({ suite_id: suiteId, parallel, limit });

    // Get the suite run that was just created
    const suiteRun = await db.one(`
      SELECT id FROM ai_suite_runs
      WHERE suite_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [suiteId]);

    return NextResponse.json({
      success: true,
      message: 'Test suite execution started',
      suite_run_id: suiteRun.id,
      suite_name: suite.name,
      monitor_url: `/api/testing/status/${suiteRun.id}`
    });

  } catch (error: any) {
    console.error('Failed to run test suite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run test suite' },
      { status: 500 }
    );
  }
}

// GET /api/testing/run/[suiteId] - Get suite run history
export async function GET(
  req: NextRequest,
  { params }: { params: { suiteId: string } }
) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { suiteId } = params;

    // Get run history for this suite
    const runs = await db.manyOrNone(`
      SELECT
        sr.*,
        COUNT(DISTINCT tr.id) as test_count,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.status = 'completed') as completed_count,
        COUNT(DISTINCT tr.id) FILTER (WHERE tr.status = 'failed') as failed_count,
        AVG(tr.transcript_wer) as avg_wer,
        AVG(tr.total_execution_time_ms) as avg_execution_time
      FROM ai_suite_runs sr
      LEFT JOIN ai_test_runs tr ON tr.suite_run_id = sr.id
      WHERE sr.suite_id = $1
      GROUP BY sr.id
      ORDER BY sr.created_at DESC
      LIMIT 20
    `, [suiteId]);

    return NextResponse.json({
      success: true,
      runs
    });

  } catch (error: any) {
    console.error('Failed to fetch suite run history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch run history' },
      { status: 500 }
    );
  }
}