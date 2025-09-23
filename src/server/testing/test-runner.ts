import { db } from '@/server/db';
import { SSEManager } from '@/lib/sse';

export interface TestCase {
  id: string;
  suite_id: string;
  audio_url: string;
  audio_duration_sec: number;
  expected_transcript?: string;
  expected_analysis?: any;
  expected_classification?: string;
  test_category?: string;
  metadata?: any;
}

export interface TestRunResult {
  test_run_id: string;
  call_id: string;
  status: 'completed' | 'failed';
  transcript_wer?: number;
  transcript_cer?: number;
  analysis_accuracy?: number;
  classification_correct?: boolean;
  execution_time_ms: number;
  error?: string;
}

/**
 * Run a single test case through the existing transcription and analysis pipeline
 */
export async function runTestCase(testCase: TestCase): Promise<TestRunResult> {
  const startTime = Date.now();
  let testRunId: string;
  let testCallId: string;

  try {
    // 1. Create test run record
    const testRun = await db.one(`
      INSERT INTO ai_test_runs (
        test_case_id,
        status
      ) VALUES ($1, 'running')
      RETURNING id
    `, [testCase.id]);
    testRunId = testRun.id;

    // Send SSE update
    SSEManager.sendEvent(`test-${testCase.suite_id}`, 'test-started', {
      test_case_id: testCase.id,
      test_run_id: testRunId
    });

    // 2. Create a synthetic call record in your existing calls table
    const testCall = await db.one(`
      INSERT INTO calls (
        recording_url,
        duration_sec,
        agent_name,
        campaign,
        direction,
        started_at,
        created_at,
        source,
        analyzed_at,
        is_test  -- Add this column if it doesn't exist
      ) VALUES ($1, $2, 'TEST_AGENT', 'AI_TEST', 'outbound', NOW(), NOW(), 'ai_test', NOW(), true)
      RETURNING id
    `, [
      testCase.audio_url,
      testCase.audio_duration_sec || 30
    ]);
    testCallId = testCall.id;

    // Update test run with call_id
    await db.none(`
      UPDATE ai_test_runs
      SET call_id = $1
      WHERE id = $2
    `, [testCallId, testRunId]);

    // 3. Trigger YOUR EXISTING transcription pipeline
    console.log(`[Test Runner] Triggering transcription for test call ${testCallId}`);

    const transcribeResponse = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/jobs/transcribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.JOBS_SECRET}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        callId: testCallId,
        recordingUrl: testCase.audio_url
      })
    });

    if (!transcribeResponse.ok) {
      const error = await transcribeResponse.text();
      throw new Error(`Transcription failed: ${error}`);
    }

    const transcribeResult = await transcribeResponse.json();

    // Wait a moment for transcription to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. Get transcription result from your existing system
    const transcript = await db.oneOrNone(`
      SELECT
        text,
        translated_text,
        engine,
        lang,
        diarized,
        words
      FROM transcripts
      WHERE call_id = $1
    `, [testCallId]);

    if (!transcript) {
      throw new Error('Transcription not found after processing');
    }

    // 5. Update test run with transcription results
    const transcriptionTimeMs = Date.now() - startTime;

    await db.none(`
      UPDATE ai_test_runs
      SET
        actual_transcript = $1,
        transcription_engine = $2,
        transcription_time_ms = $3
      WHERE id = $4
    `, [
      transcript.text,
      transcript.engine,
      transcriptionTimeMs,
      testRunId
    ]);

    // 6. Calculate transcription accuracy if expected transcript exists
    let transcriptWer: number | undefined;
    let transcriptCer: number | undefined;

    if (testCase.expected_transcript) {
      const werResult = await calculateWER(testCase.expected_transcript, transcript.text);
      transcriptWer = werResult.wer;
      transcriptCer = werResult.cer;

      await db.none(`
        UPDATE ai_test_runs
        SET
          transcript_wer = $1,
          transcript_cer = $2
        WHERE id = $3
      `, [transcriptWer, transcriptCer, testRunId]);
    }

    // 7. If this is a full pipeline test, trigger analysis
    let analysisAccuracy: number | undefined;
    let classificationCorrect: boolean | undefined;

    const shouldAnalyze = await db.oneOrNone(`
      SELECT test_type
      FROM ai_test_suites
      WHERE id = $1
      AND test_type IN ('analysis', 'full_pipeline')
    `, [testCase.suite_id]);

    if (shouldAnalyze) {
      console.log(`[Test Runner] Triggering analysis for test call ${testCallId}`);

      const analyzeResponse = await fetch(`${process.env.APP_URL || 'http://localhost:3000'}/api/jobs/analyze`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.JOBS_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          callId: testCallId
        })
      });

      if (analyzeResponse.ok) {
        const analyzeResult = await analyzeResponse.json();

        // Wait for analysis to complete
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Get analysis result
        const analysis = await db.oneOrNone(`
          SELECT
            reason_primary,
            reason_secondary,
            confidence,
            qa_score,
            sentiment_agent,
            sentiment_customer,
            summary
          FROM analyses
          WHERE call_id = $1
        `, [testCallId]);

        if (analysis) {
          await db.none(`
            UPDATE ai_test_runs
            SET
              actual_analysis = $1,
              analysis_time_ms = $2
            WHERE id = $3
          `, [
            JSON.stringify(analysis),
            Date.now() - startTime - transcriptionTimeMs,
            testRunId
          ]);

          // Calculate analysis accuracy if expected
          if (testCase.expected_analysis) {
            analysisAccuracy = calculateAnalysisAccuracy(
              testCase.expected_analysis,
              analysis
            );

            await db.none(`
              UPDATE ai_test_runs
              SET analysis_accuracy_score = $1
              WHERE id = $2
            `, [analysisAccuracy, testRunId]);
          }
        }
      }
    }

    // 8. Check quality filtering classification if applicable
    if (testCase.expected_classification) {
      const qualityMetrics = await db.oneOrNone(`
        SELECT
          classification,
          is_analyzable
        FROM call_quality_metrics
        WHERE call_id = $1
      `, [testCallId]);

      if (qualityMetrics) {
        classificationCorrect = qualityMetrics.classification === testCase.expected_classification;

        await db.none(`
          UPDATE ai_test_runs
          SET
            actual_classification = $1,
            classification_correct = $2
          WHERE id = $3
        `, [
          qualityMetrics.classification,
          classificationCorrect,
          testRunId
        ]);
      }
    }

    // 9. Mark test as completed
    const totalExecutionTime = Date.now() - startTime;

    await db.none(`
      UPDATE ai_test_runs
      SET
        status = 'completed',
        total_execution_time_ms = $1,
        completed_at = NOW()
      WHERE id = $2
    `, [totalExecutionTime, testRunId]);

    // Send SSE completion update
    SSEManager.sendEvent(`test-${testCase.suite_id}`, 'test-completed', {
      test_case_id: testCase.id,
      test_run_id: testRunId,
      wer: transcriptWer,
      execution_time: totalExecutionTime
    });

    return {
      test_run_id: testRunId,
      call_id: testCallId,
      status: 'completed',
      transcript_wer: transcriptWer,
      transcript_cer: transcriptCer,
      analysis_accuracy: analysisAccuracy,
      classification_correct: classificationCorrect,
      execution_time_ms: totalExecutionTime
    };

  } catch (error: any) {
    console.error('[Test Runner] Error:', error);

    // Update test run with error
    if (testRunId!) {
      await db.none(`
        UPDATE ai_test_runs
        SET
          status = 'failed',
          error_message = $1,
          completed_at = NOW()
        WHERE id = $2
      `, [error.message, testRunId]);

      // Send SSE error update
      SSEManager.sendEvent(`test-${testCase.suite_id}`, 'test-failed', {
        test_case_id: testCase.id,
        test_run_id: testRunId,
        error: error.message
      });
    }

    return {
      test_run_id: testRunId!,
      call_id: testCallId!,
      status: 'failed',
      execution_time_ms: Date.now() - startTime,
      error: error.message
    };
  }
}

/**
 * Calculate Word Error Rate and Character Error Rate
 */
async function calculateWER(reference: string, hypothesis: string): Promise<{ wer: number; cer: number }> {
  // Simple word-level WER calculation
  const refWords = reference.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const hypWords = hypothesis.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  const distance = levenshteinDistance(refWords, hypWords);
  const wer = refWords.length > 0 ? distance / refWords.length : 0;

  // Character-level CER calculation
  const refChars = reference.toLowerCase().replace(/\s+/g, '').split('');
  const hypChars = hypothesis.toLowerCase().replace(/\s+/g, '').split('');

  const charDistance = levenshteinDistance(refChars, hypChars);
  const cer = refChars.length > 0 ? charDistance / refChars.length : 0;

  return {
    wer: Math.min(1, wer),
    cer: Math.min(1, cer)
  };
}

/**
 * Calculate Levenshtein distance between two arrays
 */
function levenshteinDistance<T>(arr1: T[], arr2: T[]): number {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],     // deletion
          dp[i][j - 1],     // insertion
          dp[i - 1][j - 1]  // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate analysis accuracy score
 */
function calculateAnalysisAccuracy(expected: any, actual: any): number {
  let score = 0;
  let checks = 0;

  // Check reason_primary
  if (expected.reason_primary !== undefined) {
    checks++;
    if (expected.reason_primary === actual.reason_primary) {
      score += 1;
    }
  }

  // Check qa_score (within 10 points)
  if (expected.qa_score !== undefined) {
    checks++;
    const diff = Math.abs(expected.qa_score - actual.qa_score);
    if (diff <= 10) {
      score += 1 - (diff / 100); // Partial credit based on closeness
    }
  }

  // Check sentiment (if present)
  if (expected.sentiment_customer !== undefined) {
    checks++;
    if (expected.sentiment_customer === actual.sentiment_customer) {
      score += 1;
    }
  }

  return checks > 0 ? score / checks : 0;
}

/**
 * Compare test results with expected values
 */
export async function compareTestResults(testRunId: string): Promise<{
  passed: boolean;
  details: any;
}> {
  const result = await db.one(`
    SELECT
      tr.*,
      tc.expected_transcript,
      tc.expected_analysis,
      tc.expected_classification
    FROM ai_test_runs tr
    JOIN ai_test_cases tc ON tc.id = tr.test_case_id
    WHERE tr.id = $1
  `, [testRunId]);

  const checks = [];

  // Check transcription accuracy
  if (result.expected_transcript && result.transcript_wer !== null) {
    checks.push({
      name: 'Transcription Accuracy',
      passed: result.transcript_wer < 0.15, // Less than 15% WER
      actual: `${(1 - result.transcript_wer) * 100}% accurate`,
      expected: '> 85% accurate'
    });
  }

  // Check analysis accuracy
  if (result.expected_analysis && result.analysis_accuracy_score !== null) {
    checks.push({
      name: 'Analysis Accuracy',
      passed: result.analysis_accuracy_score > 0.8,
      actual: `${result.analysis_accuracy_score * 100}% accurate`,
      expected: '> 80% accurate'
    });
  }

  // Check classification
  if (result.expected_classification && result.classification_correct !== null) {
    checks.push({
      name: 'Quality Classification',
      passed: result.classification_correct,
      actual: result.actual_classification,
      expected: result.expected_classification
    });
  }

  const allPassed = checks.every(c => c.passed);

  return {
    passed: allPassed,
    details: checks
  };
}