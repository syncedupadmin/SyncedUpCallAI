import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// GET /api/testing/verify-setup - Verify the testing system is set up correctly
export async function GET(req: NextRequest) {
  try {
    const checks: any = {
      tables: {},
      sample_data: {},
      system_ready: false
    };

    // Check if tables exist
    const tables = await db.manyOrNone(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'ai_test_suites',
        'ai_test_cases',
        'ai_test_runs',
        'ai_test_feedback',
        'ai_accuracy_metrics'
      )
    `);

    for (const table of tables) {
      checks.tables[table.table_name] = true;
    }

    // Check if is_test column exists on calls
    const isTestColumn = await db.oneOrNone(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'calls'
      AND column_name = 'is_test'
    `);

    checks.calls_table_ready = !!isTestColumn;

    // Check for sample data
    const templateCount = await db.one(`
      SELECT COUNT(*) as count FROM ai_test_templates
    `);
    checks.sample_data.templates = parseInt(templateCount.count);

    const profileCount = await db.one(`
      SELECT COUNT(*) as count FROM ai_simulation_profiles
    `);
    checks.sample_data.profiles = parseInt(profileCount.count);

    // Check if any test suites exist
    const suiteCount = await db.one(`
      SELECT COUNT(*) as count FROM ai_test_suites
    `);
    checks.existing_suites = parseInt(suiteCount.count);

    // Overall status
    checks.system_ready =
      Object.keys(checks.tables).length >= 5 &&
      checks.calls_table_ready &&
      checks.sample_data.templates > 0;

    // Create first test suite if none exist
    let firstSuiteId = null;
    if (checks.system_ready && checks.existing_suites === 0) {
      const newSuite = await db.one(`
        INSERT INTO ai_test_suites (
          name,
          description,
          test_type,
          created_by
        ) VALUES (
          'Initial Accuracy Test',
          'Baseline test suite to measure current transcription accuracy',
          'transcription',
          'system'
        )
        RETURNING id
      `);
      firstSuiteId = newSuite.id;

      // Add a few test scenarios
      const scenarios = [
        {
          name: 'Clear Speech Test',
          audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Public test audio
          duration: 60,
          category: 'clear_speech',
          transcript: 'This is a placeholder transcript for testing. Replace with actual expected text.'
        },
        {
          name: 'Insurance Terms Test',
          audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
          duration: 60,
          category: 'technical_terms',
          transcript: 'Premium deductible copay beneficiary coverage policy claim'
        }
      ];

      for (const scenario of scenarios) {
        await db.none(`
          INSERT INTO ai_test_cases (
            suite_id,
            name,
            audio_url,
            audio_duration_sec,
            expected_transcript,
            test_category,
            difficulty_level,
            source
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          firstSuiteId,
          scenario.name,
          scenario.audio_url,
          scenario.duration,
          scenario.transcript,
          scenario.category,
          2,
          'generated'
        ]);
      }
    }

    return NextResponse.json({
      success: checks.system_ready,
      message: checks.system_ready
        ? '✅ AI Testing System is ready!'
        : '⚠️ System setup incomplete',
      checks,
      first_suite_id: firstSuiteId,
      next_steps: checks.system_ready ? [
        firstSuiteId ? `Created initial test suite: ${firstSuiteId}` : 'Test suites already exist',
        'Navigate to /testing/dashboard to view the dashboard',
        'Or import real calls using /api/testing/import-call/{callId}',
        'Run tests using /api/testing/run/{suiteId}'
      ] : [
        'Run the database migration from add-ai-testing-system.sql',
        'Check for any SQL errors in Supabase logs'
      ]
    });

  } catch (error: any) {
    console.error('Setup verification failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      message: '❌ Testing system not set up',
      hint: 'Run the migration: add-ai-testing-system.sql'
    }, { status: 500 });
  }
}