import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { createClient } from '@/lib/supabase/server';
import { calculateWER } from '@/lib/wer-calculator';
import { createClient as createDeepgramClient } from '@deepgram/sdk';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for test execution

// POST /api/testing/run/[suiteId] - Run a test suite
export async function POST(
  req: NextRequest,
  { params }: { params: { suiteId: string } }
) {
  // Check authentication
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { suiteId } = params;
    const { test_case_ids, run_all } = await req.json().catch(() => ({ run_all: true }));

    // Verify suite exists
    const suite = await db.oneOrNone(`
      SELECT * FROM test_suites WHERE id = $1 AND status = 'active'
    `, [suiteId]);

    if (!suite) {
      return NextResponse.json(
        { error: 'Test suite not found' },
        { status: 404 }
      );
    }

    // Get test cases to run
    let testCases;
    if (run_all) {
      testCases = await db.manyOrNone(`
        SELECT * FROM test_cases
        WHERE suite_id = $1
        ORDER BY created_at
      `, [suiteId]);
    } else if (test_case_ids && test_case_ids.length > 0) {
      testCases = await db.manyOrNone(`
        SELECT * FROM test_cases
        WHERE suite_id = $1 AND id = ANY($2)
      `, [suiteId, test_case_ids]);
    } else {
      // Run first 5 test cases as default
      testCases = await db.manyOrNone(`
        SELECT * FROM test_cases
        WHERE suite_id = $1
        ORDER BY created_at
        LIMIT 5
      `, [suiteId]);
    }

    if (!testCases || testCases.length === 0) {
      return NextResponse.json(
        { error: 'No test cases found in suite' },
        { status: 404 }
      );
    }

    // Initialize Deepgram
    const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY!);

    // Generate run ID
    const runId = crypto.randomUUID();
    const results = [];
    const startTime = Date.now();

    // Run each test case
    for (const testCase of testCases) {
      try {
        const testStartTime = Date.now();

        // Transcribe with Deepgram
        const response = await deepgram.listen.prerecorded.transcribeUrl(
          { url: testCase.audio_url },
          {
            model: 'nova-2',
            language: 'en-US',
            smart_format: true,
            punctuate: true,
            diarize: false
          }
        );

        const transcription = response.result?.results?.channels[0]?.alternatives[0]?.transcript || '';
        const processingTime = Date.now() - testStartTime;

        // Calculate WER
        const werResult = calculateWER(testCase.ground_truth, transcription);

        // Store result
        const testResult = await db.one(`
          INSERT INTO test_results (
            test_case_id,
            suite_id,
            run_id,
            transcription,
            ground_truth,
            wer_score,
            accuracy,
            processing_time_ms,
            model_used,
            status,
            metrics
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *
        `, [
          testCase.id,
          suiteId,
          runId,
          transcription,
          testCase.ground_truth,
          werResult.wer,
          werResult.accuracy,
          processingTime,
          'nova-2',
          werResult.wer <= 15 ? 'passed' : 'failed',
          JSON.stringify({
            reference_words: werResult.referenceWords,
            hypothesis_words: werResult.hypothesisWords,
            edit_distance: werResult.editDistance
          })
        ]);

        results.push({
          test_case_id: testCase.id,
          test_case_name: testCase.name,
          status: testResult.status,
          wer: werResult.wer,
          accuracy: werResult.accuracy,
          processing_time_ms: processingTime
        });

      } catch (error: any) {
        console.error(`Test case ${testCase.id} failed:`, error);
        results.push({
          test_case_id: testCase.id,
          test_case_name: testCase.name,
          status: 'error',
          error: error.message
        });
      }
    }

    const totalTime = Date.now() - startTime;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      success: true,
      run_id: runId,
      suite_id: suiteId,
      suite_name: suite.name,
      total_tests: results.length,
      passed,
      failed,
      total_time_ms: totalTime,
      results
    });

  } catch (error: any) {
    console.error('Failed to run test suite:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to run test suite' },
      { status: 500 }
    );
  }
}

// GET /api/testing/run/[suiteId] - Get suite run history
export async function GET(
  req: NextRequest,
  { params }: { params: { suiteId: string } }
) {
  // Check authentication
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { suiteId } = params;

    // Get run history for this suite
    const runs = await db.manyOrNone(`
      SELECT
        run_id,
        COUNT(*) as test_count,
        COUNT(*) FILTER (WHERE status = 'passed') as passed_count,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
        COUNT(*) FILTER (WHERE status = 'error') as error_count,
        AVG(wer_score) as avg_wer,
        AVG(accuracy) as avg_accuracy,
        AVG(processing_time_ms) as avg_execution_time,
        MIN(created_at) as started_at,
        MAX(created_at) as completed_at
      FROM test_results
      WHERE suite_id = $1
      GROUP BY run_id
      ORDER BY MAX(created_at) DESC
      LIMIT 20
    `, [suiteId]);

    return NextResponse.json({
      success: true,
      runs
    });

  } catch (error: any) {
    console.error('Failed to fetch suite run history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch run history' },
      { status: 500 }
    );
  }
}