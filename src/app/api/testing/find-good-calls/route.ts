import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// GET /api/testing/find-good-calls - Find high-quality calls to use as test cases
export async function GET(req: NextRequest) {
  try {
    // Find high-quality calls with transcripts and analyses
    const goodCalls = await db.manyOrNone(`
      SELECT
        c.id,
        c.duration_sec,
        c.agent_name,
        c.campaign,
        c.disposition,
        a.qa_score,
        a.reason_primary,
        cqm.classification,
        cqm.is_analyzable,
        CASE
          WHEN c.recording_url IS NOT NULL THEN true
          ELSE false
        END as has_recording,
        CASE
          WHEN tc.id IS NOT NULL THEN true
          ELSE false
        END as already_imported
      FROM calls c
      JOIN transcripts t ON t.call_id = c.id
      JOIN analyses a ON a.call_id = c.id
      LEFT JOIN call_quality_metrics cqm ON cqm.call_id = c.id
      LEFT JOIN ai_test_cases tc ON tc.source_call_id = c.id
      WHERE c.recording_url IS NOT NULL
        AND c.duration_sec BETWEEN 10 AND 300
        AND a.qa_score >= 70
        AND (cqm.is_analyzable IS NULL OR cqm.is_analyzable = true)
        AND tc.id IS NULL  -- Not already imported
      ORDER BY a.qa_score DESC, c.created_at DESC
      LIMIT 20
    `);

    // Get some variety - different categories
    const varietyCalls = await db.manyOrNone(`
      SELECT
        c.id,
        c.duration_sec,
        c.agent_name,
        a.qa_score,
        a.reason_primary,
        cqm.classification,
        'short_call' as suggested_category
      FROM calls c
      JOIN transcripts t ON t.call_id = c.id
      LEFT JOIN analyses a ON a.call_id = c.id
      LEFT JOIN call_quality_metrics cqm ON cqm.call_id = c.id
      LEFT JOIN ai_test_cases tc ON tc.source_call_id = c.id
      WHERE c.recording_url IS NOT NULL
        AND c.duration_sec BETWEEN 3 AND 15
        AND tc.id IS NULL
      ORDER BY c.created_at DESC
      LIMIT 5
    `);

    const suiteId = '876b6b65-ddaa-42fe-aecd-80457cb66035'; // The suite we just created

    return NextResponse.json({
      success: true,
      suite_id: suiteId,
      high_quality_calls: goodCalls,
      variety_calls: varietyCalls,
      total_found: goodCalls.length + varietyCalls.length,
      import_commands: goodCalls.slice(0, 5).map(call => ({
        call_id: call.id,
        qa_score: call.qa_score,
        duration: call.duration_sec,
        command: `curl -X POST http://localhost:3000/api/testing/import-call/${call.id} -H "Content-Type: application/json" -d '{"suite_id":"${suiteId}","verify_transcript":true}'`
      })),
      quick_import_all: `
// Run this in browser console to import first 5 high-quality calls:
${goodCalls.slice(0, 5).map(call => `
fetch('/api/testing/import-call/${call.id}', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    suite_id: '${suiteId}',
    verify_transcript: true
  })
}).then(r => r.json()).then(console.log);`).join('')}
      `.trim()
    });

  } catch (error: any) {
    console.error('Failed to find good calls:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}