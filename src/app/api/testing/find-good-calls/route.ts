import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

// GET /api/testing/find-good-calls - Find high-quality calls to use as test cases
export async function GET(req: NextRequest) {
  try {
    // Find high-quality calls with transcripts
    const goodCalls = await db.manyOrNone(`
      SELECT
        c.id,
        c.duration_seconds,
        c.agent_name,
        c.campaign_name,
        c.disposition,
        c.qa_score_overall as qa_score,
        c.qa_scores,
        c.transcript,
        c.recording_url,
        c.convoso_lead_phone_number as phone_number,
        CASE
          WHEN c.recording_url IS NOT NULL THEN true
          ELSE false
        END as has_recording,
        CASE
          WHEN tc.call_id IS NOT NULL THEN true
          ELSE false
        END as already_imported
      FROM calls c
      LEFT JOIN test_cases tc ON tc.call_id = c.id
      WHERE c.recording_url IS NOT NULL
        AND c.transcript IS NOT NULL
        AND c.transcript != ''
        AND c.duration_seconds BETWEEN 30 AND 300
        AND c.qa_score_overall >= 0.70
        AND tc.call_id IS NULL  -- Not already imported
      ORDER BY c.qa_score_overall DESC NULLS LAST, c.created_at DESC
      LIMIT 20
    `);

    // Get some variety - different categories including shorter calls
    const varietyCalls = await db.manyOrNone(`
      SELECT
        c.id,
        c.duration_seconds,
        c.agent_name,
        c.qa_score_overall as qa_score,
        c.transcript,
        c.recording_url,
        'short_call' as suggested_category
      FROM calls c
      LEFT JOIN test_cases tc ON tc.call_id = c.id
      WHERE c.recording_url IS NOT NULL
        AND c.transcript IS NOT NULL
        AND c.transcript != ''
        AND c.duration_seconds BETWEEN 10 AND 30
        AND tc.call_id IS NULL
      ORDER BY c.created_at DESC
      LIMIT 5
    `);

    // Get default test suite
    const defaultSuite = await db.oneOrNone(`
      SELECT id FROM test_suites
      WHERE name = 'Default Test Suite'
      LIMIT 1
    `);

    const suiteId = defaultSuite?.id || 'create-new-suite';

    // Format calls for easy import
    const formattedCalls = [...goodCalls, ...varietyCalls].map(call => ({
      id: call.id,
      duration_seconds: call.duration_seconds,
      agent_name: call.agent_name,
      qa_score: call.qa_score,
      transcript_preview: call.transcript ? call.transcript.substring(0, 200) + '...' : '',
      transcript_word_count: call.transcript ? call.transcript.split(/\s+/).length : 0,
      recording_url: call.recording_url,
      already_imported: call.already_imported,
      category: call.suggested_category || 'standard'
    }));

    return NextResponse.json({
      success: true,
      suite_id: suiteId,
      high_quality_calls: goodCalls,
      variety_calls: varietyCalls,
      total_found: formattedCalls.length,
      calls: formattedCalls,
      import_commands: goodCalls.slice(0, 5).map(call => ({
        call_id: call.id,
        qa_score: call.qa_score,
        duration: call.duration_seconds,
        transcript_length: call.transcript ? call.transcript.length : 0,
        command: `fetch('/api/testing/import-batch', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({suite_id:'${suiteId}',call_ids:['${call.id}']})})`
      }))
    });

  } catch (error: any) {
    console.error('Failed to find good calls:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}