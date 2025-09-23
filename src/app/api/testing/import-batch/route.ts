import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// POST /api/testing/import-batch - Import multiple calls as test cases
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { suite_id, call_ids, auto_create_suite } = await request.json();

    // Validate input
    if (!call_ids || !Array.isArray(call_ids) || call_ids.length === 0) {
      return NextResponse.json(
        { error: 'No call IDs provided' },
        { status: 400 }
      );
    }

    let suiteId = suite_id;

    // Auto-create suite if requested or no suite_id provided
    if (!suiteId || auto_create_suite) {
      const suite = await db.one(`
        INSERT INTO test_suites (name, description, created_by, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id
      `, [
        'Auto-created Suite ' + new Date().toISOString().split('T')[0],
        'Automatically created test suite for batch import',
        user.id
      ]);
      suiteId = suite.id;
    }

    // Get calls with their transcripts
    const calls = await db.manyOrNone(`
      SELECT
        c.id,
        c.duration_seconds,
        c.transcript,
        c.recording_url,
        c.agent_name,
        c.qa_score_overall
      FROM calls c
      WHERE c.id = ANY($1)
        AND c.transcript IS NOT NULL
        AND c.recording_url IS NOT NULL
    `, [call_ids]);

    if (calls.length === 0) {
      return NextResponse.json(
        { error: 'No valid calls found with transcripts and recordings' },
        { status: 404 }
      );
    }

    // Import each call as a test case
    const importedCases = [];
    for (const call of calls) {
      try {
        // Clean and prepare the ground truth transcript
        const groundTruth = call.transcript
          .replace(/\s+/g, ' ')
          .trim();

        const testCase = await db.one(`
          INSERT INTO test_cases (
            suite_id,
            call_id,
            name,
            audio_url,
            ground_truth,
            duration_seconds,
            qa_score,
            metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          suiteId,
          call.id,
          `Test Case - ${call.agent_name || 'Unknown'} - ${new Date().toISOString().split('T')[0]}`,
          call.recording_url,
          groundTruth,
          call.duration_seconds,
          call.qa_score_overall,
          JSON.stringify({
            original_call_id: call.id,
            agent_name: call.agent_name,
            imported_at: new Date().toISOString(),
            transcript_word_count: groundTruth.split(/\s+/).length
          })
        ]);

        importedCases.push(testCase);
      } catch (error: any) {
        console.error(`Failed to import call ${call.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      suite_id: suiteId,
      imported: importedCases.length,
      failed: calls.length - importedCases.length,
      test_cases: importedCases,
      message: `Successfully imported ${importedCases.length} test cases`
    });

  } catch (error: any) {
    console.error('Failed to import batch:', error);
    return NextResponse.json(
      { error: 'Failed to import batch', message: error.message },
      { status: 500 }
    );
  }
}

// GET /api/testing/import-batch - Get import suggestions
export async function GET(request: NextRequest) {
  try {
    // Get the best calls from the last 7 days that aren't already imported
    const suggestions = await db.manyOrNone(`
      SELECT
        c.id,
        c.duration_seconds,
        c.agent_name,
        c.qa_score_overall,
        c.created_at,
        LEFT(c.transcript, 100) as transcript_preview
      FROM calls c
      LEFT JOIN test_cases tc ON tc.call_id = c.id
      WHERE c.transcript IS NOT NULL
        AND c.recording_url IS NOT NULL
        AND c.duration_seconds BETWEEN 30 AND 180
        AND c.qa_score_overall >= 0.70
        AND tc.call_id IS NULL
        AND c.created_at >= NOW() - INTERVAL '7 days'
      ORDER BY c.qa_score_overall DESC NULLS LAST
      LIMIT 10
    `);

    return NextResponse.json({
      success: true,
      suggestions,
      quick_import_command: suggestions.length > 0 ? `
// Quick import top 5 calls:
fetch('/api/testing/import-batch', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    auto_create_suite: true,
    call_ids: ${JSON.stringify(suggestions.slice(0, 5).map(s => s.id))}
  })
}).then(r => r.json()).then(console.log);
      `.trim() : null
    });

  } catch (error: any) {
    console.error('Failed to get import suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to get suggestions', message: error.message },
      { status: 500 }
    );
  }
}