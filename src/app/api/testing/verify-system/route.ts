import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createClient } from '@/lib/supabase/server';
import { createClient as createDeepgramClient } from '@deepgram/sdk';

export const dynamic = 'force-dynamic';

// GET /api/testing/verify-system - Verify the testing system is set up correctly
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const checks: Record<string, any> = {
      database: { status: 'checking', message: '' },
      deepgram: { status: 'checking', message: '' },
      test_suites: { status: 'checking', message: '', data: null },
      test_cases: { status: 'checking', message: '', data: null },
      recent_results: { status: 'checking', message: '', data: null }
    };

    // Check database tables exist
    try {
      const tables = await db.manyOrNone(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('test_suites', 'test_cases', 'test_results', 'test_metrics')
      `);

      if (tables.length === 4) {
        checks.database.status = 'success';
        checks.database.message = 'All required tables exist';
      } else {
        checks.database.status = 'error';
        checks.database.message = `Missing tables. Found: ${tables.map(t => t.table_name).join(', ')}`;
      }
    } catch (error: any) {
      checks.database.status = 'error';
      checks.database.message = error.message;
    }

    // Check Deepgram API
    try {
      const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY!);
      // Test with a simple audio URL
      const testUrl = 'https://www.kozco.com/tech/LRMonoPhase4.wav';
      const response = await deepgram.listen.prerecorded.transcribeUrl(
        { url: testUrl },
        {
          model: 'nova-2',
          language: 'en-US',
          smart_format: true
        }
      );

      if (response.result?.results?.channels[0]?.alternatives[0]?.transcript) {
        checks.deepgram.status = 'success';
        checks.deepgram.message = 'Deepgram API is working';
      } else {
        checks.deepgram.status = 'warning';
        checks.deepgram.message = 'Deepgram responded but no transcript';
      }
    } catch (error: any) {
      checks.deepgram.status = 'error';
      checks.deepgram.message = `Deepgram API error: ${error.message}`;
    }

    // Check test suites
    try {
      const suites = await db.manyOrNone(`
        SELECT id, name, created_at
        FROM test_suites
        WHERE status = 'active'
        LIMIT 5
      `);

      if (suites.length > 0) {
        checks.test_suites.status = 'success';
        checks.test_suites.message = `Found ${suites.length} active test suite(s)`;
        checks.test_suites.data = suites;
      } else {
        checks.test_suites.status = 'warning';
        checks.test_suites.message = 'No active test suites found';
      }
    } catch (error: any) {
      checks.test_suites.status = 'error';
      checks.test_suites.message = error.message;
    }

    // Check test cases
    try {
      const cases = await db.one(`
        SELECT
          COUNT(*) as total,
          COUNT(DISTINCT suite_id) as suite_count,
          MIN(created_at) as oldest,
          MAX(created_at) as newest
        FROM test_cases
      `);

      if (parseInt(cases.total) > 0) {
        checks.test_cases.status = 'success';
        checks.test_cases.message = `Found ${cases.total} test cases across ${cases.suite_count} suites`;
        checks.test_cases.data = cases;
      } else {
        checks.test_cases.status = 'warning';
        checks.test_cases.message = 'No test cases found';
      }
    } catch (error: any) {
      checks.test_cases.status = 'error';
      checks.test_cases.message = error.message;
    }

    // Check recent test results
    try {
      const results = await db.one(`
        SELECT
          COUNT(*) as total_results,
          COUNT(DISTINCT run_id) as total_runs,
          AVG(wer_score) as avg_wer,
          AVG(accuracy) as avg_accuracy,
          MAX(created_at) as last_test_at
        FROM test_results
        WHERE created_at > NOW() - INTERVAL '7 days'
      `);

      if (parseInt(results.total_results) > 0) {
        checks.recent_results.status = 'success';
        checks.recent_results.message = `Found ${results.total_results} test results from ${results.total_runs} runs in last 7 days`;
        checks.recent_results.data = results;
      } else {
        checks.recent_results.status = 'info';
        checks.recent_results.message = 'No test results in the last 7 days';
      }
    } catch (error: any) {
      checks.recent_results.status = 'error';
      checks.recent_results.message = error.message;
    }

    // Overall system status
    const hasErrors = Object.values(checks).some(c => c.status === 'error');
    const hasWarnings = Object.values(checks).some(c => c.status === 'warning');
    const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'success';

    return NextResponse.json({
      success: true,
      status: overallStatus,
      checks,
      ready: overallStatus !== 'error',
      message: overallStatus === 'success'
        ? 'System is fully operational'
        : overallStatus === 'warning'
        ? 'System is operational with warnings'
        : 'System has errors that need to be fixed'
    });

  } catch (error: any) {
    console.error('System verification failed:', error);
    return NextResponse.json(
      { error: 'System verification failed', message: error.message },
      { status: 500 }
    );
  }
}

// POST /api/testing/verify-system - Initialize or fix the testing system
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { action } = await request.json();

    if (action === 'init') {
      // Create default test suite if none exists
      const existingSuite = await db.oneOrNone(`
        SELECT id FROM test_suites WHERE name = 'Default Test Suite'
      `);

      if (!existingSuite) {
        await db.none(`
          INSERT INTO test_suites (name, description, created_by, status)
          VALUES ($1, $2, $3, 'active')
        `, [
          'Default Test Suite',
          'Automatically created default test suite',
          user.id
        ]);
      }

      return NextResponse.json({
        success: true,
        message: 'Testing system initialized'
      });
    }

    return NextResponse.json({
      error: 'Invalid action'
    }, { status: 400 });

  } catch (error: any) {
    console.error('System initialization failed:', error);
    return NextResponse.json(
      { error: 'System initialization failed', message: error.message },
      { status: 500 }
    );
  }
}