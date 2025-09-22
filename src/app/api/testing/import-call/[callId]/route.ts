import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { isAdminAuthenticated } from '@/server/auth/admin';
import { createTestFromRealCall } from '@/server/testing/test-generator';

export const dynamic = 'force-dynamic';

// POST /api/testing/import-call/[callId] - Import a real call as a test case
export async function POST(
  req: NextRequest,
  { params }: { params: { callId: string } }
) {
  // Check admin authentication
  const isAdmin = await isAdminAuthenticated(req);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { callId } = params;
    const { suite_id, name, category, verify_transcript } = await req.json();

    // Validate suite_id is provided
    if (!suite_id) {
      return NextResponse.json(
        { error: 'suite_id is required' },
        { status: 400 }
      );
    }

    // Check if suite exists
    const suite = await db.oneOrNone(`
      SELECT id, name FROM ai_test_suites WHERE id = $1 AND is_active = true
    `, [suite_id]);

    if (!suite) {
      return NextResponse.json(
        { error: 'Test suite not found' },
        { status: 404 }
      );
    }

    // Check if call exists and has required data
    const call = await db.oneOrNone(`
      SELECT
        c.id,
        c.recording_url,
        c.duration_sec,
        t.text as transcript,
        a.qa_score,
        cqm.classification as quality_classification
      FROM calls c
      LEFT JOIN transcripts t ON t.call_id = c.id
      LEFT JOIN analyses a ON a.call_id = c.id
      LEFT JOIN call_quality_metrics cqm ON cqm.call_id = c.id
      WHERE c.id = $1
    `, [callId]);

    if (!call) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      );
    }

    if (!call.recording_url) {
      return NextResponse.json(
        { error: 'Call has no recording URL' },
        { status: 400 }
      );
    }

    if (!call.transcript) {
      return NextResponse.json(
        { error: 'Call has not been transcribed yet' },
        { status: 400 }
      );
    }

    // Check if already imported
    const existing = await db.oneOrNone(`
      SELECT id FROM ai_test_cases WHERE source_call_id = $1
    `, [callId]);

    if (existing) {
      return NextResponse.json(
        { error: 'Call has already been imported as a test case' },
        { status: 409 }
      );
    }

    // Import the call as a test case
    const testCaseId = await createTestFromRealCall(callId, suite_id, {
      name: name || `Call ${callId} - QA Score: ${call.qa_score || 'N/A'}`,
      category: category || undefined,
      verifyTranscript: verify_transcript || false
    });

    return NextResponse.json({
      success: true,
      test_case_id: testCaseId,
      suite_name: suite.name,
      message: 'Call successfully imported as test case'
    });

  } catch (error: any) {
    console.error('Failed to import call as test case:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import call' },
      { status: 500 }
    );
  }
}