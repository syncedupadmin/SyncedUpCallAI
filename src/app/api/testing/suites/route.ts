import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';

export const dynamic = 'force-dynamic';

// GET /api/testing/suites - List all test suites
export async function GET(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const suites = await db.manyOrNone(`
      SELECT
        s.*,
        COUNT(DISTINCT tc.id) as test_case_count,
        COUNT(DISTINCT sr.id) as total_runs,
        MAX(sr.created_at) as last_run_at,
        AVG(sr.avg_transcript_wer) as avg_wer_all_runs
      FROM ai_test_suites s
      LEFT JOIN ai_test_cases tc ON tc.suite_id = s.id
      LEFT JOIN ai_suite_runs sr ON sr.suite_id = s.id
      WHERE s.is_active = true
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    return NextResponse.json({
      success: true,
      suites
    });

  } catch (error: any) {
    console.error('Failed to fetch test suites:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch test suites' },
      { status: 500 }
    );
  }
}

// POST /api/testing/suites - Create a new test suite
export async function POST(req: NextRequest) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { name, description, test_type, target_engine } = await req.json();

    // Validate required fields
    if (!name || !test_type) {
      return NextResponse.json(
        { error: 'Name and test_type are required' },
        { status: 400 }
      );
    }

    // Validate test_type
    const validTestTypes = ['transcription', 'analysis', 'full_pipeline', 'rejection_handling', 'quality_filtering'];
    if (!validTestTypes.includes(test_type)) {
      return NextResponse.json(
        { error: `Invalid test_type. Must be one of: ${validTestTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Create the suite
    const suite = await db.one(`
      INSERT INTO ai_test_suites (
        name,
        description,
        test_type,
        target_engine,
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      name,
      description || null,
      test_type,
      target_engine || null,
      'admin' // You could get this from the auth context
    ]);

    // Generate default test scenarios if requested
    const { generate_defaults } = await req.json();
    if (generate_defaults) {
      const { generateTestScenarios } = await import('@/server/testing/test-generator');
      await generateTestScenarios(suite.id);
    }

    return NextResponse.json({
      success: true,
      suite
    });

  } catch (error: any) {
    console.error('Failed to create test suite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create test suite' },
      { status: 500 }
    );
  }
}