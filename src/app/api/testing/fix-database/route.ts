import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// POST /api/testing/fix-database - Fix database schema and clear stuck runs
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[Fix Database] Starting database fixes...');

    // Step 1: Add missing columns to calls table
    console.log('[Fix Database] Adding missing columns to calls table...');

    try {
      await db.none(`
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS agent_name TEXT;
      `);
      console.log('[Fix Database] Added agent_name column');
    } catch (e) {
      console.log('[Fix Database] agent_name column already exists or error:', e);
    }

    try {
      await db.none(`
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
      `);
      console.log('[Fix Database] Added created_at column');
    } catch (e) {
      console.log('[Fix Database] created_at column already exists or error:', e);
    }

    try {
      await db.none(`
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;
      `);
      console.log('[Fix Database] Added analyzed_at column');
    } catch (e) {
      console.log('[Fix Database] analyzed_at column already exists or error:', e);
    }

    try {
      await db.none(`
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
      `);
      console.log('[Fix Database] Added is_test column');
    } catch (e) {
      console.log('[Fix Database] is_test column already exists or error:', e);
    }

    try {
      await db.none(`
        ALTER TABLE calls ADD COLUMN IF NOT EXISTS source TEXT;
      `);
      console.log('[Fix Database] Added source column');
    } catch (e) {
      console.log('[Fix Database] source column already exists or error:', e);
    }

    // Create index for test calls
    try {
      await db.none(`
        CREATE INDEX IF NOT EXISTS idx_calls_is_test ON calls(is_test) WHERE is_test = true;
      `);
      console.log('[Fix Database] Created index for test calls');
    } catch (e) {
      console.log('[Fix Database] Index already exists or error:', e);
    }

    // Step 2: Clear ALL stuck runs
    console.log('[Fix Database] Clearing stuck test runs...');

    const stuckSuiteRuns = await db.manyOrNone(`
      UPDATE ai_suite_runs
      SET
        status = 'failed',
        completed_at = NOW()
      WHERE
        status = 'running'
      RETURNING id
    `);
    console.log(`[Fix Database] Cleared ${stuckSuiteRuns.length} stuck suite runs`);

    const stuckTestRuns = await db.manyOrNone(`
      UPDATE ai_test_runs
      SET
        status = 'failed',
        error_message = 'Cleared stuck run - database fix',
        completed_at = NOW()
      WHERE
        status = 'running'
      RETURNING id
    `);
    console.log(`[Fix Database] Cleared ${stuckTestRuns.length} stuck test runs`);

    // Step 3: Verify columns exist
    const columns = await db.manyOrNone(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'calls'
      AND column_name IN ('agent_name', 'created_at', 'analyzed_at', 'is_test', 'source')
      ORDER BY column_name
    `);

    // Step 4: Check for any running tests
    const runningTests = await db.oneOrNone(`
      SELECT COUNT(*) as count
      FROM ai_suite_runs
      WHERE status = 'running'
    `);

    return NextResponse.json({
      success: true,
      message: 'Database fixes applied successfully',
      fixes: {
        columns_verified: columns.map(c => c.column_name),
        stuck_suite_runs_cleared: stuckSuiteRuns.length,
        stuck_test_runs_cleared: stuckTestRuns.length,
        remaining_running_tests: runningTests?.count || 0
      },
      ready_for_testing: columns.length >= 5 && (runningTests?.count || 0) === 0
    });

  } catch (error: any) {
    console.error('[Fix Database] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fix database' },
      { status: 500 }
    );
  }
}

// GET /api/testing/fix-database - Check database status
export async function GET(req: NextRequest) {
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check which columns exist
    const columns = await db.manyOrNone(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'calls'
      AND column_name IN ('agent_name', 'created_at', 'analyzed_at', 'is_test', 'source')
      ORDER BY column_name
    `);

    // Check for running tests
    const runningTests = await db.oneOrNone(`
      SELECT COUNT(*) as count
      FROM ai_suite_runs
      WHERE status = 'running'
    `);

    const missingColumns = ['agent_name', 'created_at', 'analyzed_at', 'is_test', 'source']
      .filter(col => !columns.some(c => c.column_name === col));

    return NextResponse.json({
      success: true,
      database_status: {
        existing_columns: columns.map(c => c.column_name),
        missing_columns: missingColumns,
        running_tests: runningTests?.count || 0,
        needs_fix: missingColumns.length > 0 || (runningTests?.count || 0) > 0
      },
      recommendation: missingColumns.length > 0
        ? 'Missing required columns. Call POST to fix.'
        : (runningTests?.count || 0) > 0
        ? 'Stuck tests found. Call POST to clear.'
        : 'Database is ready for testing.'
    });

  } catch (error: any) {
    console.error('[Fix Database] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check database status' },
      { status: 500 }
    );
  }
}