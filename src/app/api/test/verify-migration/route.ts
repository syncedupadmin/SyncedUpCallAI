import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    console.log('=== Migration Verification Test ===');

    const results: any = {
      rejection_tables: {},
      quality_tables: {},
      views: {},
      sample_data: {},
      errors: []
    };

    // Test rejection analysis tables
    try {
      const rejectionTables = await db.manyOrNone(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN (
          'rejection_analysis',
          'agent_rejection_performance',
          'rebuttal_patterns',
          'opening_segments'
        )
      `);

      for (const table of rejectionTables) {
        results.rejection_tables[table.table_name] = true;
      }

      // Check opening_segments has rejection columns
      const openingCols = await db.oneOrNone(`
        SELECT
          column_name
        FROM information_schema.columns
        WHERE table_name = 'opening_segments'
        AND column_name = 'rejection_detected'
      `);

      results.rejection_tables.opening_segments_enhanced = !!openingCols;
    } catch (e: any) {
      results.errors.push(`Rejection tables: ${e.message}`);
    }

    // Test quality filtering tables
    try {
      const qualityTables = await db.manyOrNone(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name IN (
          'call_quality_metrics',
          'voicemail_patterns',
          'wrong_number_patterns',
          'automated_system_patterns',
          'filtered_calls_log'
        )
      `);

      for (const table of qualityTables) {
        results.quality_tables[table.table_name] = true;
      }
    } catch (e: any) {
      results.errors.push(`Quality tables: ${e.message}`);
    }

    // Test views
    try {
      const views = await db.manyOrNone(`
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name IN (
          'agent_quality_adjusted',
          'rejection_funnel_daily'
        )
      `);

      for (const view of views) {
        results.views[view.table_name] = true;
      }

      // Test agent_quality_adjusted view works
      const agentQuality = await db.manyOrNone(`
        SELECT * FROM agent_quality_adjusted LIMIT 1
      `);
      results.views.agent_quality_adjusted_works = true;
    } catch (e: any) {
      results.errors.push(`Views: ${e.message}`);
    }

    // Check for sample patterns
    try {
      const voicemailCount = await db.one(`
        SELECT COUNT(*) as count FROM voicemail_patterns
      `);
      results.sample_data.voicemail_patterns = voicemailCount.count;

      const wrongNumberCount = await db.one(`
        SELECT COUNT(*) as count FROM wrong_number_patterns
      `);
      results.sample_data.wrong_number_patterns = wrongNumberCount.count;

      const rebuttalCount = await db.one(`
        SELECT COUNT(*) as count FROM rebuttal_patterns
      `);
      results.sample_data.rebuttal_patterns = rebuttalCount.count;
    } catch (e: any) {
      results.errors.push(`Sample data: ${e.message}`);
    }

    // Test stored function
    try {
      const functionTest = await db.oneOrNone(`
        SELECT * FROM classify_call_quality(
          5,           -- word_count
          2,           -- agent_words
          0.1,         -- silence_ratio
          0.95,        -- asr_confidence
          'Hello, this is a test call'
        )
      `);
      results.stored_function_works = !!functionTest;
    } catch (e: any) {
      results.errors.push(`Stored function: ${e.message}`);
    }

    // Calculate success
    const rejectionTablesOk = Object.keys(results.rejection_tables).length >= 4;
    const qualityTablesOk = Object.keys(results.quality_tables).length >= 5;
    const viewsOk = Object.keys(results.views).length >= 2;
    const patternsLoaded = (results.sample_data.voicemail_patterns || 0) > 0;
    const noErrors = results.errors.length === 0;

    const allOk = rejectionTablesOk && qualityTablesOk && viewsOk && patternsLoaded && noErrors;

    return NextResponse.json({
      success: allOk,
      message: allOk
        ? '✅ All migrations applied successfully!'
        : '⚠️ Some migrations may be missing',
      details: results,
      summary: {
        rejection_system: rejectionTablesOk ? '✅ Ready' : '❌ Missing tables',
        quality_filtering: qualityTablesOk ? '✅ Ready' : '❌ Missing tables',
        views: viewsOk ? '✅ Working' : '❌ Not created',
        patterns: patternsLoaded ? '✅ Loaded' : '❌ Not loaded',
        errors: noErrors ? '✅ None' : `❌ ${results.errors.length} errors`
      },
      next_steps: allOk ? [
        '1. System is ready for production use',
        '2. Short calls (3+ seconds) will now be analyzed',
        '3. Useless calls will be automatically filtered',
        '4. Agent rejection metrics are being tracked',
        '5. Monitor /api/admin/filtered-calls for effectiveness'
      ] : [
        '1. Run the COMBINED_SQL_MIGRATIONS_TO_RUN.sql in Supabase',
        '2. Check for any error messages',
        '3. Run this verification again'
      ]
    });

  } catch (error: any) {
    console.error('Migration verification failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      hint: 'Ensure database connection is working'
    }, { status: 500 });
  }
}