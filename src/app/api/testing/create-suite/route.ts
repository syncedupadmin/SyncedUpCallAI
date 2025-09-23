import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/testing/create-suite - Create a new test suite
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description, config } = await request.json();

    // Create new test suite
    const suite = await db.one(`
      INSERT INTO test_suites (name, description, created_by, config, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING *
    `, [
      name || 'Test Suite ' + new Date().toISOString().split('T')[0],
      description || 'AI Transcription Testing Suite',
      user.id,
      JSON.stringify(config || {
        wer_threshold: 15, // 15% WER is considered passing
        min_accuracy: 85,
        models: ['nova-2', 'nova-2-phonecall'],
        language: 'en-US',
        smart_format: true,
        punctuate: true,
        diarize: true
      })
    ]);

    // Initialize metrics for the suite
    await db.none(`
      INSERT INTO test_metrics (suite_id)
      VALUES ($1)
    `, [suite.id]);

    return NextResponse.json({
      success: true,
      suite,
      message: 'Test suite created successfully'
    });

  } catch (error: any) {
    console.error('Failed to create test suite:', error);
    return NextResponse.json(
      { error: 'Failed to create test suite', message: error.message },
      { status: 500 }
    );
  }
}

// GET /api/testing/create-suite - Get all test suites
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const suites = await db.manyOrNone(`
      SELECT
        s.*,
        m.total_tests,
        m.tests_passed,
        m.tests_failed,
        m.average_wer,
        m.success_rate,
        m.last_run_at,
        COUNT(DISTINCT tc.id) as test_case_count
      FROM test_suites s
      LEFT JOIN test_metrics m ON m.suite_id = s.id
      LEFT JOIN test_cases tc ON tc.suite_id = s.id
      WHERE s.status = 'active'
      GROUP BY s.id, m.total_tests, m.tests_passed, m.tests_failed,
               m.average_wer, m.success_rate, m.last_run_at
      ORDER BY s.created_at DESC
    `);

    return NextResponse.json({
      success: true,
      suites
    });

  } catch (error: any) {
    console.error('Failed to get test suites:', error);
    return NextResponse.json(
      { error: 'Failed to get test suites', message: error.message },
      { status: 500 }
    );
  }
}